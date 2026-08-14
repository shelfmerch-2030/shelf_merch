import { logger } from '../../../config/logger.js';
import { ApiError } from '../../../utils/errors.js';
import { decryptToken } from '../../../utils/tokenEncryption.js';
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
import { mergePaginateAll, requireMergeConfigured } from './mergeHttp.js';
import { getOwnedMergeConnection } from './merge.service.js';

function emptyCounts() {
  return { created: 0, updated: 0, unchanged: 0 };
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

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
  const rows = await mergePaginateAll(MERGE_HRIS_GROUPS_URL, {
    accountToken,
    query: { types: 'DEPARTMENT', page_size: 100 },
    logContext: {
      organizationId: String(tenantId),
      connectionId: String(connection._id),
      model: 'departments',
    },
  });

  for (const row of rows) {
    const mergeId = asString(row?.id);
    if (!mergeId) continue;
    // Prefer DEPARTMENT; tolerate missing type when filtered by API.
    if (row?.type && String(row.type).toUpperCase() !== 'DEPARTMENT') continue;

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
  const rows = await mergePaginateAll(MERGE_HRIS_LOCATIONS_URL, {
    accountToken,
    query: { page_size: 100 },
    logContext: {
      organizationId: String(tenantId),
      connectionId: String(connection._id),
      model: 'locations',
    },
  });

  for (const row of rows) {
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

async function syncEmployees({ tenantId, connection, accountToken, now, departmentIdSet }) {
  const counts = emptyCounts();
  const rows = await mergePaginateAll(MERGE_HRIS_EMPLOYEES_URL, {
    accountToken,
    query: { page_size: 100 },
    logContext: {
      organizationId: String(tenantId),
      connectionId: String(connection._id),
      model: 'employees',
    },
  });

  for (const row of rows) {
    const mergeId = asString(row?.id);
    if (!mergeId) continue;

    const groupIds = Array.isArray(row.groups)
      ? row.groups.map(asString).filter(Boolean)
      : [];
    const departmentMergeIds = groupIds.filter((id) => departmentIdSet.has(id));

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
        employmentStatus: asString(row.employment_status),
        // jobTitle is backfilled from Employments after upsert.
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

  return counts;
}

async function syncEmployments({ tenantId, connection, accountToken, now }) {
  const counts = emptyCounts();
  const rows = await mergePaginateAll(MERGE_HRIS_EMPLOYMENTS_URL, {
    accountToken,
    query: { page_size: 100 },
    logContext: {
      organizationId: String(tenantId),
      connectionId: String(connection._id),
      model: 'employments',
    },
  });

  const latestTitleByEmployee = new Map();

  for (const row of rows) {
    const mergeId = asString(row?.id);
    if (!mergeId) continue;
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

    if (mergeEmployeeId && jobTitle) {
      const prev = latestTitleByEmployee.get(mergeEmployeeId);
      if (!prev || (effectiveDate && (!prev.at || effectiveDate > prev.at))) {
        latestTitleByEmployee.set(mergeEmployeeId, { title: jobTitle, at: effectiveDate });
      }
    }
  }

  // Backfill job titles onto employees from latest employment.
  for (const [mergeEmployeeId, { title }] of latestTitleByEmployee.entries()) {
    await MergeHrisEmployee.updateOne(
      { tenantId, connectionId: connection._id, mergeEmployeeId },
      { $set: { jobTitle: title } },
    );
  }

  return counts;
}

/**
 * Full paginated HRIS sync for a tenant-owned Merge connection.
 * Updates only Merge HRIS models — never Contacts or Users.
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
      .select('mergeDepartmentId')
      .lean();
    const departmentIdSet = new Set(departments.map((d) => d.mergeDepartmentId));

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
      departmentIdSet,
    });

    summary.employments = await syncEmployments({
      tenantId,
      connection,
      accountToken,
      now,
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
  const filter = { tenantId };
  if (connectionId) filter.connectionId = connectionId;

  const rows = await MergeHrisEmployee.find(filter)
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .lean();

  const connectionIds = [...new Set(rows.map((r) => String(r.connectionId)))];
  const [departments, locations, employments] = await Promise.all([
    MergeHrisDepartment.find({ tenantId, connectionId: { $in: connectionIds } })
      .select('connectionId mergeDepartmentId name')
      .lean(),
    MergeHrisLocation.find({ tenantId, connectionId: { $in: connectionIds } })
      .select('connectionId mergeLocationId name country')
      .lean(),
    MergeHrisEmployment.find({ tenantId, connectionId: { $in: connectionIds } })
      .select('connectionId mergeEmployeeId employmentType jobTitle effectiveDate')
      .lean(),
  ]);

  const deptNameByKey = new Map(
    departments.map((d) => [`${d.connectionId}:${d.mergeDepartmentId}`, d.name || '']),
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
      const primaryDeptId = Array.isArray(r.departmentMergeIds) ? r.departmentMergeIds[0] : '';
      const deptName = primaryDeptId
        ? deptNameByKey.get(`${connKey}:${primaryDeptId}`) || ''
        : '';
      const loc = r.locationMergeId
        ? locByKey.get(`${connKey}:${r.locationMergeId}`)
        : null;
      const employment = employmentByEmployee.get(`${connKey}:${r.mergeEmployeeId}`);

      return {
        id: String(r._id),
        connectionId: connKey,
        provider: r.provider,
        mergeEmployeeId: r.mergeEmployeeId,
        displayName: r.displayName || `${r.firstName} ${r.lastName}`.trim(),
        firstName: r.firstName,
        lastName: r.lastName,
        workEmail: r.workEmail,
        employmentStatus: r.employmentStatus,
        jobTitle: r.jobTitle || employment?.jobTitle || '',
        employmentType: employment?.employmentType || '',
        departmentName: deptName,
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
