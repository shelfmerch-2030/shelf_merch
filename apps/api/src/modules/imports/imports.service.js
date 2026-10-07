import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { Contact } from '../contacts/contact.model.js';
import { ImportJob } from './importJob.model.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_ALIASES = {
  name: ['name', 'full name', 'employee name', 'contact name', 'display name'],
  email: ['email', 'email address', 'work email', 'e mail', 'mail'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'contact number', 'cell'],
  department: ['department', 'dept', 'team', 'division'],
  employeeCode: ['employeecode', 'employee code', 'employee id', 'emp id', 'emp code', 'staff id'],
  addressLine1: ['address', 'address line 1', 'address1', 'street', 'street address', 'home address', 'line1'],
  addressLine2: ['address line 2', 'address2', 'line2', 'apt', 'suite', 'unit'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region'],
  pincode: ['pincode', 'pin code', 'zip', 'zip code', 'postal code', 'postcode'],
  country: ['country', 'nation'],
};

const IMPORT_FIELDS = Object.keys(FIELD_ALIASES);

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

function isExcelFile(fileName) {
  return /\.(xlsx|xls)$/i.test(fileName ?? '');
}

function parseImportRows(buffer, fileName) {
  if (isExcelFile(fileName)) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  }
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

function resolveColumns(headers) {
  const byKey = new Map(headers.map((h) => [normalizeKey(h), h]));
  const resolved = {};

  for (const field of IMPORT_FIELDS) {
    for (const alias of FIELD_ALIASES[field] ?? []) {
      const col = byKey.get(normalizeKey(alias));
      if (col) {
        resolved[field] = col;
        break;
      }
    }
  }

  const first = byKey.get('first name') ?? byKey.get('firstname');
  const last = byKey.get('last name') ?? byKey.get('lastname');
  if (!resolved.name && first) {
    resolved.nameParts = { first, last: last ?? '' };
  }

  return resolved;
}

function pickField(row, cols, field) {
  if (field === 'name' && cols.nameParts) {
    return [row[cols.nameParts.first], row[cols.nameParts.last]].filter(Boolean).join(' ').trim();
  }
  const col = cols[field];
  if (!col) return '';
  return String(row[col] ?? '').trim();
}

function buildAddress(row, cols) {
  const line1 = pickField(row, cols, 'addressLine1');
  const line2 = pickField(row, cols, 'addressLine2');
  const city = pickField(row, cols, 'city');
  const state = pickField(row, cols, 'state');
  const pincode = pickField(row, cols, 'pincode');
  const country = pickField(row, cols, 'country') || 'IN';
  if (!line1 && !line2 && !city && !state && !pincode) return null;
  return { line1, line2, city, state, pincode, country };
}

/**
 * §7.7 CSV/Excel import worker logic. Pure function of (tenantId, jobId) so it can
 * run from the BullMQ worker process or inline as a fallback.
 */
export async function processCsvImport({ tenantId, jobId }) {
  const job = await ImportJob.findOne({ _id: jobId, tenantId }).select('+csv');
  if (!job) throw new Error(`Import job ${jobId} not found`);

  job.status = 'processing';
  await job.save();

  try {
    const rows = parseImportRows(job.csv, job.fileName);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const cols = resolveColumns(headers);

    const errors = [];
    const seenEmails = new Set();
    let validCount = 0;

    for (const [index, row] of rows.entries()) {
      const rowNum = index + 2; // 1-based + header row
      const name = pickField(row, cols, 'name');
      const email = pickField(row, cols, 'email').toLowerCase();

      if (!name) {
        errors.push({ row: rowNum, message: 'Missing name' });
        continue;
      }
      if (!email || !EMAIL_RE.test(email)) {
        errors.push({ row: rowNum, message: `Invalid email "${email ?? ''}"` });
        continue;
      }
      if (seenEmails.has(email)) {
        errors.push({ row: rowNum, message: `Duplicate email "${email}" within file — skipped` });
        continue;
      }
      seenEmails.add(email);

      const update = {
        name,
        phone: pickField(row, cols, 'phone'),
        department: pickField(row, cols, 'department'),
        employeeCode: pickField(row, cols, 'employeeCode'),
        source: 'csv',
        // Soft-deleted contacts are hidden from list queries; clear on upsert so
        // re-importing the same email restores the row instead of E11000.
        deletedAt: null,
      };
      const address = buildAddress(row, cols);
      if (address) update.address = address;

      await Contact.updateOne(
        { tenantId, email },
        {
          $set: update,
          $setOnInsert: { tenantId, email },
        },
        { upsert: true, includeDeleted: true },
      );
      validCount += 1;
    }

    job.totalRows = rows.length;
    job.validCount = validCount;
    job.errorCount = errors.length;
    job.errors = errors.slice(0, 100); // cap stored errors
    job.status = 'done';
    job.csv = undefined;
    await job.save();

    return job;
  } catch (err) {
    job.status = 'failed';
    job.errors = [{ row: 0, message: err.message }];
    await job.save();
    throw err;
  }
}
