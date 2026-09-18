import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';
import { decryptToken } from '../../../utils/tokenEncryption.js';
import { Contact } from '../../contacts/contact.model.js';
import {
  MERGE_HRIS_EMPLOYEES_URL,
  MERGE_HRIS_EMPLOYMENTS_URL,
  MERGE_HRIS_GROUPS_URL,
  MERGE_HRIS_LOCATIONS_URL,
} from './merge.constants.js';
import { MergeHrisDepartment } from './models/mergeHrisDepartment.model.js';
import { MergeHrisLocation } from './models/mergeHrisLocation.model.js';
import { MergeHrisEmployee } from './models/mergeHrisEmployee.model.js';
import { MergeHrisEmployment } from './models/mergeHrisEmployment.model.js';
import { MergeConnection } from './mergeConnection.model.js';
import { mergePaginateAll, requireMergeConfigured } from './mergeHttp.js';
import { getOwnedMergeConnection } from './merge.service.js';

function emptyCounts() {
  return { created: 0, updated: 0, unchanged: 0, pruned: 0 };
}

function asDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Normalize Merge employment_status for directory/HRIS (incl. Google suspended). */
export function normalizeMergeEmploymentStatus(value) {
  const raw = asString(value).toUpperCase().replace(/\s+/g, '_');
  if (!raw) return '';
  if (raw === 'ACTIVE' || raw === 'ENABLED') return 'ACTIVE';
  if (raw === 'SUSPENDED' || raw === 'DISABLED' || raw === 'SUSPEND') return 'SUSPENDED';
  if (raw === 'INACTIVE' || raw === 'ARCHIVED' || raw === 'DELETED' || raw === 'TERMINATED') {
    return 'INACTIVE';
  }
  if (raw === 'PENDING') return 'PENDING';
  return raw;
}


function titleCasePlace(value) {
  const raw = asString(value);
  if (!raw) return '';
  if (/^[A-Z]{2,3}$/.test(raw)) return raw;
  return raw
    .split(/\s+/)
    .map((part) => {
      if (/^\d/.test(part)) return part;
      if (/^[A-Z]{2,3}$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

const COUNTRY_LABELS = Object.freeze({
  IN: 'India',
  IND: 'India',
  AU: 'Australia',
  US: 'United States',
  USA: 'United States',
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  CA: 'Canada',
  SG: 'Singapore',
  AE: 'United Arab Emirates',
  DE: 'Germany',
  NL: 'Netherlands',
});

const REGION_LABELS = Object.freeze({
  // India
  TG: 'Telangana',
  TS: 'Telangana',
  AP: 'Andhra Pradesh',
  KA: 'Karnataka',
  MH: 'Maharashtra',
  TN: 'Tamil Nadu',
  DL: 'Delhi',
  HR: 'Haryana',
  UP: 'Uttar Pradesh',
  GJ: 'Gujarat',
  RJ: 'Rajasthan',
  WB: 'West Bengal',
  KL: 'Kerala',
  // Australia
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  SA: 'South Australia',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
});

function expandCountry(value) {
  const raw = asString(value);
  if (!raw) return '';
  const key = raw.toUpperCase();
  return COUNTRY_LABELS[key] || titleCasePlace(raw);
}

function expandRegion(value) {
  const raw = asString(value);
  if (!raw) return '';
  const key = raw.toUpperCase();
  return REGION_LABELS[key] || titleCasePlace(raw);
}

/**
 * Compact display address from a synced MergeHrisLocation.
 * Uses street/city when present; otherwise falls back to location name + region/country.
 */
export function formatHrisLocationAddress(loc) {
  if (!loc || typeof loc !== 'object') return '';
  const street1 = asString(loc.street1);
  const street2 = asString(loc.street2);
  const city = asString(loc.city);
  const placeName = titleCasePlace(loc.name);
  const state = expandRegion(loc.state);
  const zipCode = asString(loc.zipCode);
  const country = expandCountry(loc.country);

  const locality = titleCasePlace(city) || placeName;
  const street = [street1, street2].filter(Boolean).join(', ');
  const region = [state, zipCode].filter(Boolean).join(' ');

  const parts = [street, locality, region, country].filter(Boolean);
  // Deduplicate consecutive identical parts (e.g. name === city).
  const unique = [];
  for (const part of parts) {
    if (!unique.length || unique[unique.length - 1].toLowerCase() !== part.toLowerCase()) {
      unique.push(part);
    }
  }
  return unique.join(', ');
}

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeGroupType(row) {
  const type = String(row?.type || '').toUpperCase();
  if (type === 'DEPARTMENT') return 'DEPARTMENT';
  if (type === 'TEAM') return 'TEAM';
  if (row?.is_commonly_used_as_team === true && type !== 'DEPARTMENT') return 'TEAM';
  return 'UNKNOWN';
}

function buildDepartmentMergeIds({ groupIds, teamMergeId, groupTypeById }) {
  const dept = [];
  const team = [];
  const other = [];
  const seen = new Set();
  const pushUnique = (bucket, id) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    bucket.push(id);
  };
  for (const id of groupIds) {
    const groupType = groupTypeById.get(id) || 'UNKNOWN';
    if (groupType === 'DEPARTMENT') pushUnique(dept, id);
    else if (groupType === 'TEAM') pushUnique(team, id);
    else pushUnique(other, id);
  }
  const ordered = [...dept, ...team, ...other];
  if (teamMergeId && !seen.has(teamMergeId)) ordered.push(teamMergeId);
  return ordered;
}

function resolveOrgUnitName({ departmentMergeIds, departmentsById }) {
  const ids = Array.isArray(departmentMergeIds) ? departmentMergeIds : [];
  const pickNamed = (predicate) => {
    for (const id of ids) {
      const dept = departmentsById.get(id);
      if (!dept) continue;
      const name = asString(dept.name);
      if (!name) continue;
      if (!predicate || predicate(dept)) return name;
    }
    return '';
  };
  return (
    pickNamed((d) => (d.groupType || 'UNKNOWN') === 'DEPARTMENT') ||
    pickNamed((d) => (d.groupType || 'UNKNOWN') === 'TEAM') ||
    pickNamed()
  );
}

/**
 * Delete local Merge rows missing from a complete snapshot.
 * Incomplete / malformed snapshots never prune.
 * A complete empty snapshot (zero items) deletes all rows for this connection.
 * A complete snapshot with rows but zero usable ids does not prune.
 */
async function pruneByMergeIds({
  Model,
  tenantId,
  connectionId,
  mergeIdField,
  seenIds,
  snapshotComplete,
  rawItemCount,
  counts,
  logContext,
}) {
  if (!snapshotComplete) {
    counts.pruneSkippedReason = 'incomplete';
    logger.warn(
      { ...logContext, rawItemCount, seenCount: seenIds.length },
      'Merge snapshot incomplete — skipped prune',
    );
    return;
  }

  if (seenIds.length === 0) {
    if (rawItemCount > 0) {
      counts.pruneSkippedReason = 'no_usable_ids';
      logger.warn(
        { ...logContext, rawItemCount },
        'Merge snapshot had rows but no usable ids — skipped prune',
      );
      return;
    }
    const deleted = await Model.deleteMany({ tenantId, connectionId });
    counts.pruned = deleted?.deletedCount || 0;
    return;
  }

  const deleted = await Model.deleteMany({
    tenantId,
    connectionId,
    [mergeIdField]: { $nin: seenIds },
  });
  counts.pruned = deleted?.deletedCount || 0;
}

async function upsertByMergeId({
  Model,
  tenantId,
  connectionId,
  mergeIdField,
  mergeId,
  fields,
  counts,
}) {
  if (!mergeId) {
    return;
  }
  const existing = await Model.findOne({
    tenantId,
    connectionId,
    [mergeIdField]: mergeId,
  });

  if (!existing) {
    await Model.create({
      tenantId,
      connectionId,
      ...fields,
      [mergeIdField]: mergeId,
    });
    counts.created += 1;
    return;
  }

  let changed = false;
  for (const [key, value] of Object.entries(fields)) {
    // Always refresh sync timestamp without counting it as a data change.
    if (key === 'lastSyncedAt') {
      existing[key] = value;
      continue;
    }
    if (key === 'departmentMergeIds') {
      if (!arraysEqual(existing[key] || [], value || [])) {
        existing[key] = value;
        changed = true;
      }
      continue;
    }
    const prev = existing[key];
    const next = value;
    const same =
      prev instanceof Date || next instanceof Date
        ? String(prev || '') === String(next || '')
        : prev === next;
    if (!same) {
      existing[key] = next;
      changed = true;
    }
  }

  if (changed) {
    await existing.save();
    counts.updated += 1;
  } else {
    await existing.save();
    counts.unchanged += 1;
  }
}

async function syncDepartments({ tenantId, connection, accountToken, now }) {
  const counts = emptyCounts();
  const snapshot = await mergePaginateAll(MERGE_HRIS_GROUPS_URL, {
    accountToken,
    query: { page_size: 100 },
    logContext: {
      organizationId: String(tenantId),
      connectionId: String(connection._id),
      model: 'departments',
    },
  });

  for (const row of snapshot.items) {
    const mergeId = asString(row?.id);
    if (!mergeId) continue;

    await upsertByMergeId({
      Model: MergeHrisDepartment,
      tenantId,
      connectionId: connection._id,
      mergeIdField: 'mergeDepartmentId',
      mergeId,
      counts,
      fields: {
        provider: connection.provider,
        remoteId: asString(row.remote_id),
        name: asString(row.name),
        groupType: normalizeGroupType(row),
        parentDepartmentMergeId: asString(row.parent_group),
        lastSyncedAt: now,
        source: 'merge',
      },
    });
  }

  return counts;
}

async function syncLocations({ tenantId, connection, accountToken, now }) {
  const counts = emptyCounts();
  const snapshot = await mergePaginateAll(MERGE_HRIS_LOCATIONS_URL, {
    accountToken,
    query: { page_size: 100 },
    logContext: {
      organizationId: String(tenantId),
      connectionId: String(connection._id),
      model: 'locations',
    },
  });

  for (const row of snapshot.items) {
    const mergeId = asString(row?.id);
    if (!mergeId) continue;

    await upsertByMergeId({
      Model: MergeHrisLocation,
      tenantId,
      connectionId: connection._id,
      mergeIdField: 'mergeLocationId',
      mergeId,
      counts,
      fields: {
        provider: connection.provider,
        remoteId: asString(row.remote_id),
        name: asString(row.name),
        street1: asString(row.street_1),
        street2: asString(row.street_2),
        city: asString(row.city),
        state: asString(row.state),
        zipCode: asString(row.zip_code),
        country: asString(row.country),
        lastSyncedAt: now,
        source: 'merge',
      },
    });
  }

  return counts;
}

async function syncEmployees({ tenantId, connection, accountToken, now, groupTypeById }) {
  const counts = emptyCounts();
  const logContext = {
    organizationId: String(tenantId),
    connectionId: String(connection._id),
    model: 'employees',
  };
  const snapshot = await mergePaginateAll(MERGE_HRIS_EMPLOYEES_URL, {
    accountToken,
    // Common Model Employee.team — not provider-specific; used whenever Merge fills it.
    query: { page_size: 100, expand: 'team' },
    logContext,
  });

  const seenMergeEmployeeIds = [];
  for (const row of snapshot.items) {
    const mergeId = asString(row?.id);
    if (!mergeId) continue;
    seenMergeEmployeeIds.push(mergeId);

    const groupIds = Array.isArray(row.groups)
      ? row.groups.map((g) => (typeof g === 'object' && g ? asString(g.id) : asString(g))).filter(Boolean)
      : [];

    let teamMergeId = '';
    let teamName = '';
    if (row?.team && typeof row.team === 'object') {
      teamMergeId = asString(row.team.id);
      teamName = asString(row.team.name);
    } else {
      teamMergeId = asString(row.team);
    }

    if (teamMergeId && teamName && !groupTypeById.has(teamMergeId)) {
      await upsertByMergeId({
        Model: MergeHrisDepartment,
        tenantId,
        connectionId: connection._id,
        mergeIdField: 'mergeDepartmentId',
        mergeId: teamMergeId,
        counts: emptyCounts(),
        fields: {
          provider: connection.provider,
          remoteId: '',
          name: teamName,
          groupType: 'TEAM',
          parentDepartmentMergeId: '',
          lastSyncedAt: now,
          source: 'merge',
        },
      });
      groupTypeById.set(teamMergeId, 'TEAM');
    }

    const knownGroupIds = groupIds.filter((id) => groupTypeById.has(id));
    const departmentMergeIds = buildDepartmentMergeIds({
      groupIds: knownGroupIds,
      teamMergeId,
      groupTypeById,
    });

    await upsertByMergeId({
      Model: MergeHrisEmployee,
      tenantId,
      connectionId: connection._id,
      mergeIdField: 'mergeEmployeeId',
      mergeId,
      counts,
      fields: {
        provider: connection.provider,
        remoteEmployeeId: asString(row.remote_id),
        firstName: asString(row.first_name),
        lastName: asString(row.last_name),
        displayName: asString(row.display_full_name || row.preferred_name),
        workEmail: asString(row.work_email).toLowerCase(),
        personalEmail: asString(row.personal_email).toLowerCase(),
        mobilePhoneNumber: asString(row.mobile_phone_number),
        employmentStatus: normalizeMergeEmploymentStatus(row.employment_status),
        managerMergeEmployeeId: asString(row.manager),
        departmentMergeIds,
        locationMergeId: asString(row.work_location || row.home_location),
        startDate: asDate(row.start_date || row.hire_date),
        terminationDate: asDate(row.termination_date),
        rawModifiedAt: asDate(row.modified_at),
        lastSyncedAt: now,
        source: 'merge',
      },
    });
  }

  await pruneByMergeIds({
    Model: MergeHrisEmployee,
    tenantId,
    connectionId: connection._id,
    mergeIdField: 'mergeEmployeeId',
    seenIds: seenMergeEmployeeIds,
    snapshotComplete: snapshot.complete,
    rawItemCount: snapshot.items.length,
    counts,
    logContext,
  });

  if (counts.pruneSkippedReason) {
    // Directory hides rows with lastSyncedAt older than connection.lastSyncAt.
    // Skipped prunes must not make kept employees disappear from the list.
    await MergeHrisEmployee.updateMany(
      { tenantId, connectionId: connection._id },
      { $set: { lastSyncedAt: now } },
    );
  }

  counts.snapshotComplete = Boolean(snapshot.complete && !counts.pruneSkippedReason);
  return counts;
}

async function syncEmployments({ tenantId, connection, accountToken, now }) {
  const counts = emptyCounts();
  const logContext = {
    organizationId: String(tenantId),
    connectionId: String(connection._id),
    model: 'employments',
  };
  const snapshot = await mergePaginateAll(MERGE_HRIS_EMPLOYMENTS_URL, {
    accountToken,
    query: { page_size: 100 },
    logContext,
  });

  const latestTitleByEmployee = new Map();
  const seenEmploymentIds = [];

  for (const row of snapshot.items) {
    const mergeId = asString(row?.id);
    if (!mergeId) continue;
    seenEmploymentIds.push(mergeId);
    const mergeEmployeeId = asString(row.employee);
    const jobTitle = asString(row.job_title);
    const effectiveDate = asDate(row.effective_date);

    await upsertByMergeId({
      Model: MergeHrisEmployment,
      tenantId,
      connectionId: connection._id,
      mergeIdField: 'mergeEmploymentId',
      mergeId,
      counts,
      fields: {
        provider: connection.provider,
        mergeEmployeeId,
        jobTitle,
        employmentType: asString(row.employment_type),
        effectiveDate,
        payFrequency: asString(row.pay_frequency),
        payPeriod: asString(row.pay_period),
        lastSyncedAt: now,
        source: 'merge',
      },
    });

    if (mergeEmployeeId) {
      const prev = latestTitleByEmployee.get(mergeEmployeeId);
      if (!prev) {
        latestTitleByEmployee.set(mergeEmployeeId, { title: jobTitle, at: effectiveDate });
      } else if (effectiveDate && (!prev.at || effectiveDate > prev.at)) {
        latestTitleByEmployee.set(mergeEmployeeId, { title: jobTitle, at: effectiveDate });
      }
    }
  }

  await pruneByMergeIds({
    Model: MergeHrisEmployment,
    tenantId,
    connectionId: connection._id,
    mergeIdField: 'mergeEmploymentId',
    seenIds: seenEmploymentIds,
    snapshotComplete: snapshot.complete,
    rawItemCount: snapshot.items.length,
    counts,
    logContext,
  });

  if (snapshot.complete) {
    const employees = await MergeHrisEmployee.find({
      tenantId,
      connectionId: connection._id,
    })
      .select('mergeEmployeeId')
      .lean();
    for (const emp of employees) {
      const latest = latestTitleByEmployee.get(emp.mergeEmployeeId);
      const title = latest ? latest.title : '';
      await MergeHrisEmployee.updateOne(
        { tenantId, connectionId: connection._id, mergeEmployeeId: emp.mergeEmployeeId },
        { $set: { jobTitle: title } },
      );
    }
  } else {
    for (const [mergeEmployeeId, { title }] of latestTitleByEmployee.entries()) {
      await MergeHrisEmployee.updateOne(
        { tenantId, connectionId: connection._id, mergeEmployeeId },
        { $set: { jobTitle: title } },
      );
    }
  }

  return counts;
}

function isUsableContactEmail(email) {
  const v = asString(email).toLowerCase();
  if (!v || !v.includes('@') || v.startsWith('@') || v.endsWith('@')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function contactHasMergeIdentity(contact) {
  return Boolean(contact?.mergeEmployeeId && contact?.mergeConnectionId);
}

function mergeIdentityMatches(contact, { mergeEmployeeId, mergeConnectionId }) {
  return (
    contactHasMergeIdentity(contact) &&
    contact.mergeEmployeeId === mergeEmployeeId &&
    String(contact.mergeConnectionId) === String(mergeConnectionId)
  );
}

/**
 * Mirror synced Merge HRIS employees into Workspace Contacts (source=hris).
 * Upsert order: Merge identity → claim/reclaim by email → create.
 * After a complete employee snapshot, Contacts whose Merge IDs are no longer live
 * on this connection become stale (IDs preserved, records not deleted).
 */
async function syncContactsFromHrisEmployees({
  tenantId,
  connection,
  employeeSnapshotComplete = false,
}) {
  const counts = { ...emptyCounts(), conflicts: 0 };
  const mergeConnectionId = connection._id;
  const employees = await MergeHrisEmployee.find({
    tenantId,
    connectionId: mergeConnectionId,
  }).lean();

  const liveIds = employees.map((e) => asString(e.mergeEmployeeId)).filter(Boolean);

  if (employees.length) {
    const [departments, locations] = await Promise.all([
      MergeHrisDepartment.find({ tenantId, connectionId: mergeConnectionId })
        .select('mergeDepartmentId name groupType')
        .lean(),
      MergeHrisLocation.find({ tenantId, connectionId: mergeConnectionId }).lean(),
    ]);

    const departmentsById = new Map(departments.map((d) => [d.mergeDepartmentId, d]));
    const locById = new Map(locations.map((l) => [l.mergeLocationId, l]));

    for (const emp of employees) {
      const mergeEmployeeId = asString(emp.mergeEmployeeId);
      if (!mergeEmployeeId) continue;

      const email = asString(emp.workEmail || emp.personalEmail).toLowerCase();
      if (!isUsableContactEmail(email)) continue;

      const firstName = asString(emp.firstName);
      const lastName = asString(emp.lastName);
      const name =
        asString(emp.displayName) ||
        `${firstName} ${lastName}`.trim() ||
        email;

      const department = resolveOrgUnitName({
        departmentMergeIds: emp.departmentMergeIds,
        departmentsById,
      });

      const loc = emp.locationMergeId ? locById.get(emp.locationMergeId) : null;
      const workLocation = loc
        ? asString(loc.name) || formatHrisLocationAddress(loc)
        : '';
      const address = loc
        ? {
            line1: asString(loc.street1),
            line2: asString(loc.street2),
            city: asString(loc.city) || asString(loc.name),
            state: asString(loc.state),
            pincode: asString(loc.zipCode),
            country: asString(loc.country),
          }
        : undefined;

      const patch = {
        name,
        firstName,
        lastName,
        email,
        phone: asString(emp.mobilePhoneNumber),
        employeeCode: asString(emp.remoteEmployeeId),
        department,
        designation: asString(emp.jobTitle),
        workLocation,
        dateOfJoining: emp.startDate || null,
        employmentStatus: asString(emp.employmentStatus),
        source: 'hris',
        mergeEmployeeId,
        mergeConnectionId,
        hrisLinkStatus: 'current',
        ...(address ? { address } : {}),
      };

      try {
        const existing = await Contact.findOne({
          tenantId,
          mergeConnectionId,
          mergeEmployeeId,
        });

        if (existing) {
          if (existing.email !== email) {
            const emailOwner = await Contact.findOne({ tenantId, email });
            if (emailOwner && String(emailOwner._id) !== String(existing._id)) {
              logger.warn(
                {
                  organizationId: String(tenantId),
                  connectionId: String(mergeConnectionId),
                  provider: connection.provider,
                  mergeEmployeeId,
                  code: 'MERGE_CONTACT_EMAIL_CONFLICT',
                  linkedContactId: String(existing._id),
                  conflictingContactId: String(emailOwner._id),
                },
                'Merge HRIS contact email conflict — skipped update',
              );
              counts.conflicts += 1;
              continue;
            }
          }
          Object.assign(existing, patch);
          await existing.save();
          counts.updated += 1;
          continue;
        }

        const byEmail = await Contact.findOne({ tenantId, email });
        if (byEmail) {
          if (
            contactHasMergeIdentity(byEmail) &&
            !mergeIdentityMatches(byEmail, { mergeEmployeeId, mergeConnectionId })
          ) {
            if (String(byEmail.mergeConnectionId) !== String(mergeConnectionId)) {
              logger.warn(
                {
                  organizationId: String(tenantId),
                  connectionId: String(mergeConnectionId),
                  provider: connection.provider,
                  mergeEmployeeId,
                  code: 'MERGE_CONTACT_IDENTITY_CONFLICT',
                  reason: 'cross_connection',
                  existingContactId: String(byEmail._id),
                  existingMergeEmployeeId: byEmail.mergeEmployeeId,
                  existingMergeConnectionId: String(byEmail.mergeConnectionId),
                },
                'Merge HRIS contact identity conflict — skipped claim',
              );
              counts.conflicts += 1;
              continue;
            }

            const oldLive = await MergeHrisEmployee.exists({
              tenantId,
              connectionId: mergeConnectionId,
              mergeEmployeeId: byEmail.mergeEmployeeId,
            });
            if (oldLive) {
              logger.warn(
                {
                  organizationId: String(tenantId),
                  connectionId: String(mergeConnectionId),
                  provider: connection.provider,
                  mergeEmployeeId,
                  code: 'MERGE_CONTACT_IDENTITY_CONFLICT',
                  reason: 'live_identity',
                  existingContactId: String(byEmail._id),
                  existingMergeEmployeeId: byEmail.mergeEmployeeId,
                  existingMergeConnectionId: String(byEmail.mergeConnectionId),
                },
                'Merge HRIS contact identity conflict — skipped claim',
              );
              counts.conflicts += 1;
              continue;
            }
            // Old Merge employee is gone on this connection — reclaim.
          }
          Object.assign(byEmail, patch);
          await byEmail.save();
          counts.updated += 1;
          continue;
        }

        await Contact.create({ tenantId, ...patch });
        counts.created += 1;
      } catch (err) {
        if (err?.code === 11000) counts.conflicts += 1;
        logger.warn(
          {
            organizationId: String(tenantId),
            connectionId: String(mergeConnectionId),
            provider: connection.provider,
            mergeEmployeeId,
            code: err?.code || err?.name,
          },
          'Merge HRIS contact upsert skipped',
        );
      }
    }
  }

  if (employeeSnapshotComplete) {
    await Contact.updateMany(
      {
        tenantId,
        mergeConnectionId,
        mergeEmployeeId: { $gt: '', $nin: liveIds },
      },
      { $set: { hrisLinkStatus: 'stale' } },
    );
  }

  return counts;
}

/**
 * Full paginated HRIS sync for a tenant-owned Merge connection.
 * Updates Merge HRIS models and mirrors employees into Workspace Contacts.
 * Never creates ShelfMerch Users/logins.
 */
export async function syncMergeConnection({ tenantId, connectionId }) {
  requireMergeConfigured();

  const connection = await getOwnedMergeConnection({ tenantId, connectionId });
  if (connection.status !== 'connected' && connection.status !== 'needs_attention') {
    throw new ApiError(400, 'Merge connection is not active', 'MERGE_CONNECTION_INACTIVE');
  }
  if (!connection.encryptedAccountToken) {
    throw new ApiError(400, 'Merge account token is missing', 'MERGE_TOKEN_MISSING');
  }

  let accountToken;
  try {
    accountToken = decryptToken(connection.encryptedAccountToken);
  } catch {
    throw new ApiError(500, 'Could not decrypt Merge account token', 'MERGE_TOKEN_DECRYPT_FAILED');
  }

  const now = new Date();
  connection.lastSyncStatus = 'syncing';
  connection.lastError = '';
  await connection.save();

  const summary = {
    employees: emptyCounts(),
    departments: emptyCounts(),
    locations: emptyCounts(),
    employments: emptyCounts(),
    contacts: emptyCounts(),
  };

  try {
    summary.departments = await syncDepartments({
      tenantId,
      connection,
      accountToken,
      now,
    });

    const departments = await MergeHrisDepartment.find({
      tenantId,
      connectionId: connection._id,
    })
      .select('mergeDepartmentId groupType')
      .lean();
    const groupTypeById = new Map(
      departments.map((d) => [d.mergeDepartmentId, d.groupType || 'UNKNOWN']),
    );

    summary.locations = await syncLocations({
      tenantId,
      connection,
      accountToken,
      now,
    });

    summary.employees = await syncEmployees({
      tenantId,
      connection,
      accountToken,
      now,
      groupTypeById,
    });

    summary.employments = await syncEmployments({
      tenantId,
      connection,
      accountToken,
      now,
    });

    summary.contacts = await syncContactsFromHrisEmployees({
      tenantId,
      connection,
      employeeSnapshotComplete: Boolean(summary.employees.snapshotComplete),
    });

    connection.lastSyncAt = now;
    connection.lastSyncStatus = 'success';
    connection.lastError = '';
    connection.status = 'connected';
    await connection.save();

    logger.info(
      {
        organizationId: String(tenantId),
        connectionId: String(connection._id),
        provider: connection.provider,
        contactsCreated: summary.contacts.created,
        contactsUpdated: summary.contacts.updated,
        contactsConflicts: summary.contacts.conflicts || 0,
      },
      'Merge HRIS sync completed',
    );

    return {
      connection: connection.toPublicJSON(),
      sync: summary,
    };
  } catch (err) {
    connection.lastSyncStatus = 'failed';
    connection.lastError = err?.code || err?.message || 'SYNC_FAILED';

    if (err?.code === 'MERGE_SCOPES_DISABLED') {
      // Valid Linked Account; missing dashboard scopes — keep connected.
      connection.status = 'connected';
      connection.lastError = 'MERGE_SCOPES_DISABLED';
    } else if (err?.code === 'MERGE_AUTH_FAILED') {
      connection.status = 'needs_attention';
    }

    await connection.save();

    logger.warn(
      {
        organizationId: String(tenantId),
        connectionId: String(connection._id),
        provider: connection.provider,
        code: err?.code,
      },
      'Merge HRIS sync failed',
    );
    throw err;
  }
}

/** List synced HRIS employees for the tenant (safe fields only). */
export async function listMergeHrisEmployees({ tenantId, connectionId, limit = 100 }) {
  const connFilter = { tenantId };
  if (connectionId) connFilter._id = connectionId;

  const connections = await MergeConnection.find(connFilter)
    .select('_id lastSyncAt status')
    .lean();
  const connectionById = new Map(connections.map((c) => [String(c._id), c]));

  if (!connections.length) {
    return { employees: [] };
  }

  const filter = {
    tenantId,
    $or: connections.map((c) => {
      const clause = { connectionId: c._id };
      if (c.lastSyncAt) {
        // Drop leftover rows from a prior Linked Account / Merge UUID rotation.
        // Rows with no lastSyncedAt are kept (tests and pre-timestamp imports).
        clause.$or = [
          { lastSyncedAt: { $exists: false } },
          { lastSyncedAt: null },
          { lastSyncedAt: { $gte: c.lastSyncAt } },
        ];
      }
      return clause;
    }),
  };

  const rows = await MergeHrisEmployee.find(filter)
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .lean();

  const connectionIds = [...new Set(rows.map((r) => String(r.connectionId)))];
  const [departments, locations, employments] = await Promise.all([
    MergeHrisDepartment.find({ tenantId, connectionId: { $in: connectionIds } })
      .select('connectionId mergeDepartmentId name groupType')
      .lean(),
    MergeHrisLocation.find({ tenantId, connectionId: { $in: connectionIds } })
      .select('connectionId mergeLocationId name street1 street2 city state zipCode country')
      .lean(),
    MergeHrisEmployment.find({ tenantId, connectionId: { $in: connectionIds } })
      .select('connectionId mergeEmployeeId employmentType jobTitle effectiveDate')
      .lean(),
  ]);

  const departmentsByKey = new Map(
    departments.map((d) => [`${d.connectionId}:${d.mergeDepartmentId}`, d]),
  );
  const locByKey = new Map(
    locations.map((l) => [`${l.connectionId}:${l.mergeLocationId}`, l]),
  );
  const employmentByEmployee = new Map();
  for (const emp of employments) {
    const key = `${emp.connectionId}:${emp.mergeEmployeeId}`;
    const prev = employmentByEmployee.get(key);
    if (
      !prev ||
      (emp.effectiveDate && (!prev.effectiveDate || emp.effectiveDate > prev.effectiveDate))
    ) {
      employmentByEmployee.set(key, emp);
    }
  }

  return {
    employees: rows.map((r) => {
      const connKey = String(r.connectionId);
      const departmentsById = new Map();
      if (Array.isArray(r.departmentMergeIds)) {
        for (const deptId of r.departmentMergeIds) {
          const dept = departmentsByKey.get(`${connKey}:${deptId}`);
          if (dept) departmentsById.set(deptId, dept);
        }
      }
      const deptName = resolveOrgUnitName({
        departmentMergeIds: r.departmentMergeIds,
        departmentsById,
      });
      const loc = r.locationMergeId
        ? locByKey.get(`${connKey}:${r.locationMergeId}`)
        : null;
      const employment = employmentByEmployee.get(`${connKey}:${r.mergeEmployeeId}`);
      const address = formatHrisLocationAddress(loc);

      return {
        id: String(r._id),
        connectionId: connKey,
        connectionStatus: connectionById.get(connKey)?.status || 'disconnected',
        provider: r.provider,
        mergeEmployeeId: r.mergeEmployeeId,
        displayName: r.displayName || `${r.firstName} ${r.lastName}`.trim(),
        firstName: r.firstName,
        lastName: r.lastName,
        workEmail: r.workEmail,
        employmentStatus: r.employmentStatus,
        jobTitle: r.jobTitle || '',
        employmentType: employment?.employmentType || '',
        departmentName: deptName,
        address,
        country: loc?.country || '',
        locationName: loc?.name || '',
        departmentMergeIds: r.departmentMergeIds || [],
        locationMergeId: r.locationMergeId || null,
        startDate: r.startDate,
        terminationDate: r.terminationDate,
        lastSyncedAt: r.lastSyncedAt,
        source: r.source,
      };
    }),
  };
}
