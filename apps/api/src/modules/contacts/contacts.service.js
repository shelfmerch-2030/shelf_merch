import { Contact } from './contact.model.js';
import { managedEntityNamesForUser } from '../entities/entities.service.js';
import { ApiError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { deriveEffectiveEmploymentStatus } from '../integrations/merge/effectiveEmploymentStatus.js';

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

/** Read-time effective status; never writes derived values onto the Contact. */
export function contactToPublicJSON(contact, now) {
  if (!contact) return contact;
  const obj =
    typeof contact.toJSON === 'function'
      ? contact.toJSON()
      : { ...contact };
  const derived = deriveEffectiveEmploymentStatus({
    employmentStatus: obj.employmentStatus,
    terminationDate: obj.terminationDate,
    startDate: obj.dateOfJoining,
    now,
  });
  return {
    ...obj,
    effectiveEmploymentStatus: derived.effectiveEmploymentStatus,
    effectiveStatusSource: derived.effectiveStatusSource,
  };
}

/** List contacts visible to the caller — tenant-wide for admins, dept-scoped for EMs. */
export async function listContactsForUser({ tenantId, user }) {
  const names = await managedEntityNamesForUser({ tenantId, user });
  if (names === null) {
    const rows = await Contact.find({ tenantId }).sort({ name: 1 });
    return rows.map((row) => contactToPublicJSON(row));
  }
  if (!names.length) return [];

  const rows = await Contact.find({
    tenantId,
    ...departmentMatchFilter(names),
  }).sort({ name: 1 });
  return rows.map((row) => contactToPublicJSON(row));
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