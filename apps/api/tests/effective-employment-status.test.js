import { describe, it, expect } from 'vitest';
import {
  deriveEffectiveEmploymentStatus,
  isDateOnlyUtc,
  terminationEffectiveAt,
} from '../src/modules/integrations/merge/effectiveEmploymentStatus.js';

const dateOnly = '2026-09-18T00:00:00.000Z';

describe('deriveEffectiveEmploymentStatus', () => {
  it('keeps ACTIVE with no termination date', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        now: '2026-09-18T12:00:00.000Z',
      }),
    ).toEqual({
      effectiveEmploymentStatus: 'ACTIVE',
      effectiveStatusSource: 'merge_status',
    });
  });

  it('ACTIVE + today date-only stays ACTIVE through that UTC date', () => {
    expect(isDateOnlyUtc(dateOnly)).toBe(true);
    expect(terminationEffectiveAt(dateOnly).toISOString()).toBe('2026-09-19T00:00:00.000Z');
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        terminationDate: dateOnly,
        now: '2026-09-18T08:21:48.003Z',
      }),
    ).toEqual({
      effectiveEmploymentStatus: 'ACTIVE',
      effectiveStatusSource: 'merge_status',
    });
  });

  it('is still ACTIVE one millisecond before the next UTC day', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        terminationDate: dateOnly,
        now: '2026-09-18T23:59:59.999Z',
      }).effectiveEmploymentStatus,
    ).toBe('ACTIVE');
  });

  it('becomes INACTIVE exactly at next UTC midnight', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        terminationDate: dateOnly,
        now: '2026-09-19T00:00:00.000Z',
      }),
    ).toEqual({
      effectiveEmploymentStatus: 'INACTIVE',
      effectiveStatusSource: 'termination_date',
    });
  });

  it('keeps a future date-only termination ACTIVE', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        terminationDate: '2026-10-01T00:00:00.000Z',
        now: '2026-09-18T12:00:00.000Z',
      }),
    ).toEqual({
      effectiveEmploymentStatus: 'ACTIVE',
      effectiveStatusSource: 'merge_status',
    });
  });

  it('marks a past date-only termination INACTIVE', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        terminationDate: '2026-09-01T00:00:00.000Z',
        now: '2026-09-18T12:00:00.000Z',
      }),
    ).toEqual({
      effectiveEmploymentStatus: 'INACTIVE',
      effectiveStatusSource: 'termination_date',
    });
  });

  it('applies explicit INACTIVE immediately even with a future termination date', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'INACTIVE',
        terminationDate: '2026-12-01T00:00:00.000Z',
        now: '2026-09-18T12:00:00.000Z',
      }),
    ).toEqual({
      effectiveEmploymentStatus: 'INACTIVE',
      effectiveStatusSource: 'merge_status',
    });
  });

  it('maps TERMINATED, ARCHIVED, and DELETED snapshots to INACTIVE immediately', () => {
    for (const status of ['TERMINATED', 'ARCHIVED', 'DELETED']) {
      expect(
        deriveEffectiveEmploymentStatus({
          employmentStatus: status,
          terminationDate: '2026-12-01T00:00:00.000Z',
          now: '2026-09-18T12:00:00.000Z',
        }),
      ).toEqual({
        effectiveEmploymentStatus: 'INACTIVE',
        effectiveStatusSource: 'merge_status',
      });
    }
  });

  it('uses a genuine timestamp as the effective instant', () => {
    const ts = '2026-09-18T16:30:00.000Z';
    expect(isDateOnlyUtc(ts)).toBe(false);
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        terminationDate: ts,
        now: '2026-09-18T16:29:59.999Z',
      }).effectiveEmploymentStatus,
    ).toBe('ACTIVE');
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        terminationDate: ts,
        now: '2026-09-18T16:30:00.000Z',
      }),
    ).toEqual({
      effectiveEmploymentStatus: 'INACTIVE',
      effectiveStatusSource: 'termination_date',
    });
  });

  it('returns ACTIVE when the termination date is cleared and Merge says ACTIVE', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        terminationDate: null,
        now: '2026-09-18T12:00:00.000Z',
      }),
    ).toEqual({
      effectiveEmploymentStatus: 'ACTIVE',
      effectiveStatusSource: 'merge_status',
    });
  });

  it('treats rehire as ACTIVE when startDate is after the old termination date', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        terminationDate: '2026-01-15T00:00:00.000Z',
        startDate: '2026-03-01T00:00:00.000Z',
        now: '2026-09-18T12:00:00.000Z',
      }),
    ).toEqual({
      effectiveEmploymentStatus: 'ACTIVE',
      effectiveStatusSource: 'rehire',
    });
  });

  it('does not treat same-day start and termination as rehire', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        terminationDate: dateOnly,
        startDate: dateOnly,
        now: '2026-09-19T00:00:00.000Z',
      }).effectiveStatusSource,
    ).toBe('termination_date');
  });

  it('keeps PENDING and SUSPENDED until a date-only termination day has ended', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'PENDING',
        terminationDate: dateOnly,
        now: '2026-09-18T12:00:00.000Z',
      }).effectiveEmploymentStatus,
    ).toBe('PENDING');
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'SUSPENDED',
        terminationDate: dateOnly,
        now: '2026-09-19T00:00:00.000Z',
      }),
    ).toEqual({
      effectiveEmploymentStatus: 'INACTIVE',
      effectiveStatusSource: 'termination_date',
    });
  });

  it('does not invent ACTIVE for empty snapshot without an effective termination', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: '',
        now: '2026-09-18T12:00:00.000Z',
      }),
    ).toEqual({
      effectiveEmploymentStatus: '',
      effectiveStatusSource: 'merge_status',
    });
  });

  it('does not use hrisLinkStatus as an input', () => {
    expect(
      deriveEffectiveEmploymentStatus({
        employmentStatus: 'ACTIVE',
        terminationDate: dateOnly,
        hrisLinkStatus: 'stale',
        now: '2026-09-18T12:00:00.000Z',
      }).effectiveEmploymentStatus,
    ).toBe('ACTIVE');
  });
});
