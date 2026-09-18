const EXPLICIT_INACTIVE = new Set(['INACTIVE', 'TERMINATED', 'ARCHIVED', 'DELETED']);

function asDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function snapshotKey(employmentStatus) {
  const raw = String(employmentStatus || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (!raw) return '';
  if (raw === 'ENABLED') return 'ACTIVE';
  if (EXPLICIT_INACTIVE.has(raw)) return 'INACTIVE';
  return raw;
}

/** HRIS date stuffed into datetime as midnight UTC — not a real time-of-day. */
export function isDateOnlyUtc(value) {
  const d = asDate(value);
  if (!d) return false;
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

/**
 * Instant at which a termination becomes effective.
 * Date-only midnight UTC: start of the next UTC calendar day.
 * Genuine timestamps: the instant itself.
 */
export function terminationEffectiveAt(terminationDate) {
  const d = asDate(terminationDate);
  if (!d) return null;
  if (isDateOnlyUtc(d)) {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0),
    );
  }
  return d;
}

/**
 * Read-time effective employment status. Does not mutate stored snapshot fields.
 * @param {object} args
 * @param {string} [args.employmentStatus] stored/raw snapshot
 * @param {Date|string|null} [args.terminationDate]
 * @param {Date|string|null} [args.startDate] used only for rehire
 * @param {Date|string} [args.now]
 */
export function deriveEffectiveEmploymentStatus({
  employmentStatus = '',
  terminationDate = null,
  startDate = null,
  now = new Date(),
} = {}) {
  const clock = asDate(now) || new Date();
  const snapshot = snapshotKey(employmentStatus);
  const termAt = asDate(terminationDate);
  const startAt = asDate(startDate);
  const effectiveAt = terminationEffectiveAt(termAt);
  const terminationEffective = Boolean(effectiveAt && clock.getTime() >= effectiveAt.getTime());
  const rehire =
    snapshot === 'ACTIVE' &&
    Boolean(startAt && termAt && startAt.getTime() > termAt.getTime());

  if (snapshot === 'INACTIVE') {
    return {
      effectiveEmploymentStatus: 'INACTIVE',
      effectiveStatusSource: 'merge_status',
    };
  }

  if (rehire) {
    return {
      effectiveEmploymentStatus: 'ACTIVE',
      effectiveStatusSource: 'rehire',
    };
  }

  if (terminationEffective) {
    return {
      effectiveEmploymentStatus: 'INACTIVE',
      effectiveStatusSource: 'termination_date',
    };
  }

  if (snapshot === 'ACTIVE' || snapshot === 'PENDING' || snapshot === 'SUSPENDED') {
    return {
      effectiveEmploymentStatus: snapshot,
      effectiveStatusSource: 'merge_status',
    };
  }

  return {
    effectiveEmploymentStatus: snapshot,
    effectiveStatusSource: 'merge_status',
  };
}
