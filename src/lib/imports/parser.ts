import { extname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import readXlsx, { readSheetNames } from 'read-excel-file/node';
import { MAX_ROWS, MAX_UPLOAD, detectKind, type Dataset } from './model';

const MAX_COLUMNS = 100;
const MAX_EXPANDED = 32_000_000;
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const dataExtensions = ['.csv', '.xlsx', '.json'];
const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];

function zipDirectory(buffer: Buffer) {
  let end = -1;
  for (let cursor = buffer.length - 22; cursor >= Math.max(0, buffer.length - 65_557); cursor--) {
    if (buffer.readUInt32LE(cursor) === 0x06054b50 && cursor + 22 + buffer.readUInt16LE(cursor + 20) === buffer.length) {
      end = cursor;
      break;
    }
  }
  if (end < 0 || buffer.readUInt32LE(end + 4) !== 0) throw new Error('Invalid or multi-volume ZIP file.');
  const count = buffer.readUInt16LE(end + 10);
  const directoryStart = buffer.readUInt32LE(end + 16);
  let cursor = directoryStart;
  if (!count || count > 1500 || cursor + buffer.readUInt32LE(end + 12) !== end) throw new Error('ZIP directory exceeds the supported limits.');
  const entries = new Map<string, { offset: number; packed: number; size: number; method: number }>();
  let expanded = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory entry.');
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const packed = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const length = buffer.readUInt16LE(cursor + 28);
    const offset = buffer.readUInt32LE(cursor + 42);
    const nameEnd = cursor + 46 + length;
    if (nameEnd > end || offset + 30 > directoryStart || flags & 1 || ![0, 8].includes(method)) throw new Error('Encrypted or unsupported ZIP entry.');
    const path = textDecoder.decode(buffer.subarray(cursor + 46, nameEnd));
    if (!path || /[\\:\x00-\x1f]/.test(path) || path.startsWith('/') || path.split('/').some(part => part === '..' || part === '.') || entries.has(path)) {
      throw new Error('Unsafe or duplicate ZIP entry path.');
    }
    if (buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error('Invalid ZIP entry header.');
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    expanded += size;
    if (start + packed > directoryStart || expanded > MAX_EXPANDED) throw new Error('ZIP expands beyond the 32 MB limit.');
    entries.set(path, { offset: start, packed, size, method });
    cursor = nameEnd + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
  }
  if (cursor !== end) throw new Error('ZIP directory length is invalid.');
  return entries;
}

function readEntry(buffer: Buffer, entry: ReturnType<typeof zipDirectory> extends Map<string, infer Entry> ? Entry : never) {
  const packed = buffer.subarray(entry.offset, entry.offset + entry.packed);
  const result = entry.method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: Math.max(1, entry.size) });
  if (result.length !== entry.size) throw new Error('ZIP entry size could not be verified.');
  return result;
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
    throw new Error('Export large numeric identifiers as text to preserve their exact value.');
  }
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new Error('JSON records must contain flat scalar values.');
  }
  return String(value);
}

async function parseDataset(bytes: Buffer, name: string): Promise<Dataset> {
  const extension = extname(name).toLowerCase();
  let table: string[][];
  if (extension === '.csv') {
    const raw = textDecoder.decode(bytes);
    if (/\x00/.test(raw)) throw new Error('Save the CSV as UTF-8 text.');
    let columns = 0;
    let separator = ',';
    for (const delimiter of [',',';','\t']) {
      try {
        const header: string[][] = parse(raw, { delimiter, bom: true, max_record_size: 128_000, to: 1 });
        if ((header[0]?.length ?? 0) > columns) {
          columns = header[0].length;
          separator = delimiter;
        }
      } catch { /* Try another supported separator. */ }
    }
    if (!columns) throw new Error('CSV contains invalid quoting or no readable header.');
    try {
      table = parse(raw, { delimiter: separator, bom: true, relax_column_count: true, max_record_size: 128_000, to: MAX_ROWS + 2 });
    } catch {
      throw new Error('CSV contains an invalid record, quoting or an oversized field.');
    }
  } else if (extension === '.json') {
    const data: unknown = JSON.parse(textDecoder.decode(bytes).replace(/^\uFEFF/, ''));
    const rows = Array.isArray(data) ? data : (data as { records?: unknown } | null)?.records;
    if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS ||
      rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error('Use a JSON array of records, or an object with a records array.');
    }
    const headers = [...new Set<string>(rows.flatMap(row => Object.keys(row)))];
    if (headers.length > MAX_COLUMNS) throw new Error('Exports can contain up to 100 columns.');
    table = [headers, ...rows.map(row => headers.map(header => scalar(Object.hasOwn(row, header) ? row[header] : null)))];
  } else if (extension === '.xlsx') {
    const entries = zipDirectory(bytes);
    if (!entries.has('[Content_Types].xml') || !entries.has('xl/workbook.xml')) throw new Error('This file is not an XLSX workbook.');
    for (const [path, entry] of entries) {
      if (/^xl\/(media|embeddings)\//i.test(path)) throw new Error('Export workbook data without embedded photos. Photos can be supplied separately.');
      const contents = readEntry(bytes, entry);
      if (/^xl\/worksheets\/[^/]+\.xml$/i.test(path)) {
        const xml = textDecoder.decode(contents);
        if (/<!DOCTYPE/i.test(xml)) throw new Error('Unsupported workbook XML.');
        for (const attribute of xml.matchAll(/<(?:[\w-]+:)?(?:c|dimension)\b[^>]*?\s(?:r|ref)\s*=\s*(["'])(.*?)\1/gi)) {
          const match = /^(?:[A-Z]+\d+:)?([A-Z]+)(\d+)$/.exec(attribute[2]);
          if (!match) throw new Error('Unsupported workbook cell reference.');
          const column = [...match[1]].reduce((sum, character) => sum * 26 + character.charCodeAt(0) - 64, 0);
          if (column > MAX_COLUMNS || Number(match[2]) > MAX_ROWS + 1) throw new Error('Workbook exceeds 25,000 rows or 100 columns.');
        }
      }
    }
    if ((await readSheetNames(bytes)).length !== 1) throw new Error('Export each workbook sheet as a separate file.');
    table = (await readXlsx(bytes)).map(row => row.map(scalar));
  } else {
    throw new Error('Choose a CSV, XLSX, JSON or supported ZIP export.');
  }

  const [first, ...records] = table;
  const headers = first?.map(header => header.trim()) ?? [];
  if (!headers.length || !records.length || headers.length > MAX_COLUMNS || records.length > MAX_ROWS ||
    headers.some(header => !header || header.length > 180) ||
    new Set(headers.map(header => header.toLowerCase())).size !== headers.length) {
    throw new Error('Use unique, non-empty column headers and up to 25,000 rows and 100 columns.');
  }
  return { headers, records, kind: detectKind(headers, name) };
}

export async function parseUpload(bytes: Buffer, filename: string, entry?: string) {
  if (!bytes.length || bytes.length > MAX_UPLOAD) throw new Error('Choose an export of up to 4 MB.');
  if (extname(filename).toLowerCase() !== '.zip') {
    if (entry) throw new Error('Choose an entry from a ZIP package.');
    return { dataset: await parseDataset(bytes, filename), files: [] as string[], images: 0 };
  }
  const directory = zipDirectory(bytes);
  const paths = [...directory.keys()].filter(path => !path.endsWith('/'));
  const files = paths.filter(path => dataExtensions.includes(extname(path).toLowerCase()));
  const images = paths.filter(path => imageExtensions.includes(extname(path).toLowerCase())).length;
  if (files.length + images !== paths.length || !files.length) throw new Error('ZIP packages must contain supported data exports and optional JPG, PNG, WebP or AVIF images.');
  if (!entry && files.length > 1) return { dataset: null, files, images };
  const selected = entry ?? files[0];
  if (!files.includes(selected)) throw new Error('Choose a data file from this ZIP package.');
  const dataset = await parseDataset(readEntry(bytes, directory.get(selected)!), selected);
  return { dataset: { ...dataset, entry: selected }, files, images };
}
