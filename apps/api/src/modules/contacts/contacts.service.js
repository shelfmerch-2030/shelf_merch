import { Contact } from './contact.model.js';
import { managedEntityNamesForUser } from '../entities/entities.service.js';
import { ApiError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { deriveEffectiveEmploymentStatus } from '../integrations/merge/effectiveEmploymentStatus.js';
import { MergeConnection } from '../integrations/merge/mergeConnection.model.js';
import { MergeHrisEmployee } from '../integrations/merge/models/mergeHrisEmployee.model.js';

function normalizeDept(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function departmentMatchFilter(names) {
  return {
    $or: names.map((name) => ({
      department: { $regex: `^${escapeRegex(name.trim())}$`, $options: 'i' },
    })),
  };
}

function contactMatchesDepartments(contact, names) {
  const dept = normalizeDept(contact?.department);
  if (!dept) return false;
  const allowed = new Set(names.map(normalizeDept));
  return allowed.has(dept);
}

function isEntityManager(user) {
  return user?.role === 'entity_manager' || user?.scopeType === 'entity';
}

function mergeIdentityOf(contact) {
  const mergeEmployeeId = String(contact?.mergeEmployeeId || '').trim();
  const mergeConnectionId = contact?.mergeConnectionId;
  if (!mergeEmployeeId || !mergeConnectionId) return null;
  return {
    mergeEmployeeId,
    mergeConnectionId,
    key: `${String(mergeConnectionId)}:${mergeEmployeeId}`,
  };
}

/** Same freshness Directory uses: missing/null lastSyncedAt, or >= connection.lastSyncAt. */
function isDirectoryVisibleEmployee(emp, connection) {
  if (!emp || !connection) return false;
  if (!connection.lastSyncAt) return true;
  if (emp.lastSyncedAt == null) return true;
  return new Date(emp.lastSyncedAt).getTime() >= new Date(connection.lastSyncAt).getTime();
}

/**
 * One batched employee lookup for the Merge-linked Contacts in `rows`.
 * Keyed by `${connectionId}:${mergeEmployeeId}`. Directory-invisible leftovers
 * are omitted so callers fall back to Contact fields.
 */
async function loadDirectoryEmployeesByIdentity({ tenantId, rows }) {
  const idsByConnection = new Map();
  for (const row of rows) {
    const ident = mergeIdentityOf(row);
    if (!ident) continue;
    const connKey = String(ident.mergeConnectionId);
    let ids = idsByConnection.get(connKey);
    if (!ids) {
      ids = new Set();
      idsByConnection.set(connKey, ids);
    }
    ids.add(ident.mergeEmployeeId);
  }

  if (!idsByConnection.size) return new Map();

  const connectionIds = [...idsByConnection.keys()];
  const connections = await MergeConnection.find({
    tenantId,
    _id: { $in: connectionIds },
  })
    .select('_id lastSyncAt')
    .lean();

  if (!connections.length) return new Map();

  const connectionsById = new Map(connections.map((c) => [String(c._id), c]));
  const employees = await MergeHrisEmployee.find({
    tenantId,
    $or: connections.map((c) => ({
      connectionId: c._id,
      mergeEmployeeId: { $in: [...idsByConnection.get(String(c._id))] },
    })),
  })
    .select('connectionId mergeEmployeeId employmentStatus terminationDate startDate lastSyncedAt')
    .lean();

  const employeesByKey = new Map();
  for (const emp of employees) {
    const connection = connectionsById.get(String(emp.connectionId));
    if (!isDirectoryVisibleEmployee(emp, connection)) continue;
    employeesByKey.set(`${String(emp.connectionId)}:${emp.mergeEmployeeId}`, emp);
  }
  return employeesByKey;
}

/** Read-time effective status; never writes derived values onto the Contact. */
export function contactToPublicJSON(contact, now, liveEmployee = null) {
  if (!contact) return contact;
  const obj =
    typeof contact.toJSON === 'function'
      ? contact.toJSON()
      : { ...contact };
  const derived = deriveEffectiveEmploymentStatus(
    liveEmployee
      ? {
          employmentStatus: liveEmployee.employmentStatus,
          terminationDate: liveEmployee.terminationDate,
          startDate: liveEmployee.startDate,
          now,
        }
      : {
          employmentStatus: obj.employmentStatus,
          terminationDate: obj.terminationDate,
          startDate: obj.dateOfJoining,
          now,
        },
  );
  return {
    ...obj,
    effectiveEmploymentStatus: derived.effectiveEmploymentStatus,
    effectiveStatusSource: derived.effectiveStatusSource,
  };
}

/** Merge-linked and effectively inactive — hide from the normal Contacts list only. */
function isHiddenInactiveMergeHrisContact(row) {
  if (!row?.mergeEmployeeId || !row?.mergeConnectionId) return false;
  return row.effectiveEmploymentStatus === 'INACTIVE';
}

function toListedContacts(rows, employeesByKey, now) {
  const listed = [];
  for (const row of rows) {
    const ident = mergeIdentityOf(row);
    const liveEmployee = ident ? employeesByKey.get(ident.key) : null;
    const json = contactToPublicJSON(row, now, liveEmployee || null);
    if (!isHiddenInactiveMergeHrisContact(json)) listed.push(json);
  }
  return listed;
}

/** List contacts visible to the caller — tenant-wide for admins, dept-scoped for EMs. */
export async function listContactsForUser({ tenantId, user, now }) {
  const names = await managedEntityNamesForUser({ tenantId, user });
  if (names === null) {
    const rows = await Contact.find({ tenantId }).sort({ name: 1 });
    const employeesByKey = await loadDirectoryEmployeesByIdentity({ tenantId, rows });
    return toListedContacts(rows, employeesByKey, now);
  }
  if (!names.length) return [];

  const rows = await Contact.find({
    tenantId,
    ...departmentMatchFilter(names),
  }).sort({ name: 1 });
  const employeesByKey = await loadDirectoryEmployeesByIdentity({ tenantId, rows });
  return toListedContacts(rows, employeesByKey, now);
}

/**
 * Stamp/validate department for entity managers.
 * Entity managers cannot set or change contact role (company admin only).
 */
export async function prepareContactPayloadForUser({
  tenantId,
  user,
  body,
  existingContact = null,
}) {
  const names = await managedEntityNamesForUser({ tenantId, user });
  if (names === null) return { ...body };

  if (!names.length) {
    throw new ForbiddenError('No managed department assigned');
  }

  const { role: _ignoredRole, ...rest } = body;
  const payload = { ...rest };

  // EM cannot assign roles — keep existing on update, default Member on create.
  if (existingContact) {
    // omit role so Object.assign won't change it
  } else {
    payload.role = 'Member';
  }

  const dept = String(payload.department || '').trim();
  if (!dept) {
    payload.department = names[0];
    return payload;
  }

  if (!names.some((name) => normalizeDept(name) === normalizeDept(dept))) {
    throw new ApiError(
      403,
      'Department must match one of your managed departments',
      'DEPARTMENT_SCOPE',
    );
  }

  payload.department = dept;
  return payload;
}

/** Ensure an entity manager may mutate this contact (admin always allowed). */
export async function assertContactAccess({ tenantId, user, contact }) {
  if (!isEntityManager(user)) return;

  const names = await managedEntityNamesForUser({ tenantId, user });
  if (!names?.length || !contactMatchesDepartments(contact, names)) {
    throw new ForbiddenError('Contact is outside your managed departments');
  }
}

export async function getContactOrThrow({ tenantId, contactId }) {
  const contact = await Contact.findOne({ _id: contactId, tenantId });
  if (!contact) throw new NotFoundError('Contact not found');
  return contact;
}

/**
 * Create a contact, or restore + update a soft-deleted row with the same email.
 * Soft-delete hides contacts from the UI but leaves the document; re-adding the
 * same email must revive that row instead of inserting a duplicate.
 */
export async function createOrRestoreContact({ tenantId, payload, source = 'manual' }) {
  const email = String(payload.email || '')
    .trim()
    .toLowerCase();
  const existing = await Contact.findOne({ tenantId, email }).setOptions({ includeDeleted: true });
  if (existing) {
    if (!existing.deletedAt) {
      throw new ConflictError('A contact with this email already exists');
    }
    Object.assign(existing, payload, { email, source, deletedAt: null });
    await existing.save();
    return existing;
  }
  return Contact.create({ tenantId, ...payload, email, source });
}
