import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { ApiError } from '../../utils/errors.js';

export const MAX_ROWS = 5000;

/** Accepted header spellings per field (normalised: lowercase, alphanumerics only). */
const HEADER_ALIASES = {
  sku: ['sku', 'skucode', 'itemcode', 'productcode', 'code', 'variantsku', 'productid', 'id'],
  barcode: ['barcode', 'gtin', 'ean', 'upc', 'isbn', 'gtin13', 'ean13'],
  name: ['name', 'productname', 'title', 'producttitle', 'itemname', 'description'],
  brand: ['brand', 'manufacturer', 'make', 'vendor'],
  model: ['model', 'modelnumber', 'mpn', 'partnumber', 'style', 'stylecode'],
  category: ['category', 'type', 'producttype', 'subcategory', 'department'],
  size: ['size', 'sizename', 'option1'],
  color: ['color', 'colour', 'colorname', 'option2'],
  material: ['material', 'fabric'],
  imageUrl: ['imageurl', 'image', 'imagesrc', 'photo', 'picture', 'thumbnail'],
};

const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Map the file's headers to our fields; first alias found wins. */
export function resolveHeaders(headers) {
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const hit = aliases.find((a) => byNorm.has(a));
    if (hit) map[field] = byNorm.get(hit);
  }
  return map;
}

/** CSV or XLSX buffer → normalised client catalog rows. */
export function parseCatalogFile(buffer, fileName = '') {
  let records;
  try {
    if (/\.(xlsx|xls)$/i.test(fileName)) {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      records = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) : [];
    } else {
      records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
    }
  } catch (err) {
    throw new ApiError(422, `Could not read the file: ${err.message}`, 'CATALOG_FILE_INVALID');
  }
  if (!records.length) throw new ApiError(422, 'The file has no rows', 'CATALOG_FILE_EMPTY');
  if (records.length > MAX_ROWS) {
    throw new ApiError(422, `The file has ${records.length} rows; the limit is ${MAX_ROWS} per run`, 'CATALOG_FILE_TOO_LARGE');
  }
  const headerMap = resolveHeaders(Object.keys(records[0]));
  if (!headerMap.sku) {
    throw new ApiError(422, `No SKU column found. Name a column "sku" (headers seen: ${Object.keys(records[0]).join(', ')})`, 'CATALOG_FILE_NO_SKU');
  }
  if (!headerMap.name && !headerMap.barcode) {
    throw new ApiError(422, 'Add a "name" or "barcode" column so products can be matched', 'CATALOG_FILE_NO_NAME');
  }
  return records.map((rec) =>
    Object.fromEntries(Object.keys(HEADER_ALIASES).map((field) => [field, String(headerMap[field] ? rec[headerMap[field]] ?? '' : '').trim()])),
  );
}
