
import 'server-only';

import { createHash } from 'node:crypto';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
import { nairaToKobo } from '@/src/lib/golden-rose/contracts';
import { parseUpload } from '@/src/lib/imports/parser';

const RPC_NAME = 'gr_odoo_sales_staging';
const MAX_FILE_BYTES = 4_000_000;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 96_000;
const MAX_ROWS = 1_000;
const MAX_RPC_PAYLOAD_BYTES = 1_450_000;
const MAX_ISSUES = 30;

const SUPPORTED_EXTENSIONS = new Set([
  'csv',
  'xlsx',
  'json',
  'zip',
]);

const fieldNames = [
  'lineId',
  'orderId',
  'saleDate',
  'sku',
  'quantity',
  'unitPrice',
  'lineTotal',
  'unitCost',
  'state',
  'currency',
] as const;

type Field = (typeof fieldNames)[number];
type Mapping = Partial<Record<Field, number>>;

type ImportLine = {
  rowNumber: number;
  lineId: string;
  orderId: string;
  saleDate: string;
  sku: string;
  quantity: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  unitCostMinor: number | null;
  state: string;
};

type ReviewResult = {
  headers: string[];
  mapping: Mapping;
  fields: Record<Field, string>;
  requiredFields: Field[];
  rowCount: number;
  fileHash: string;
  issues: string[];
  issueCount: number;
  ready: boolean;
  preview: string[][];
};

const aliases: Record<Field, readonly string[]> = {
  lineId: [
    'odoo_line_id',
    'sale_line_id',
    'sale.order.line/id',
    'sale.order.line/.id',
    'order line/external id',
    'order line/database id',
    'line id',
    'line_id',
    'external id',
    'database id',
    'id',
    '.id',
  ],
  orderId: [
    'odoo_order_id',
    'order_id',
    'order reference',
    'order reference/id',
    'order reference/.id',
    'order/external id',
    'order/database id',
    'order_id/id',
    'order_id/.id',
    'order number',
    'order name',
    'order',
    'reference',
  ],
  saleDate: [
    'sale_date',
    'date_order',
    'date order',
    'order date',
    'sale date',
    'sales date',
    'confirmation date',
    'create_date',
    'create date',
    'date',
  ],
  sku: [
    'sku',
    'internal reference',
    'default_code',
    'product/internal reference',
    'product_id/default_code',
    'product code',
    'item code',
    'stock code',
  ],
  quantity: [
    'quantity',
    'product_uom_qty',
    'qty',
    'quantity ordered',
    'ordered quantity',
    'product quantity',
  ],
  unitPrice: [
    'unit_price_ngn',
    'unit price',
    'price_unit',
    'unit selling price',
    'selling price',
    'price',
  ],
  lineTotal: [
    'line_subtotal_ngn',
    'price_subtotal',
    'line subtotal',
    'subtotal',
    'untaxed amount',
    'line total',
    'amount untaxed',
  ],
  unitCost: [
    'unit_cost_ngn',
    'unit cost',
    'purchase price',
    'standard_price',
    'cost',
    'product/cost',
  ],
  state: [
    'order_state',
    'order state',
    'state',
    'status',
    'sale order state',
    'order status',
  ],
  currency: [
    'currency',
    'currency code',
    'currency_id/name',
    'currency/name',
    'currency_id',
    'currency_id/id',
  ],
};

const labels: Record<Field, string> = {
  lineId: 'Unique Odoo sale-line ID',
  orderId: 'Odoo order ID / reference',
  saleDate: 'Sale date',
  sku: 'Product SKU / internal reference',
  quantity: 'Quantity sold',
  unitPrice: 'Unit selling price (NGN)',
  lineTotal: 'Line subtotal (NGN)',
  unitCost: 'Historical unit cost (optional)',
  state: 'Order state / status',
  currency: 'Currency (or verified NGN confirmation)',
};

const requiredFields: Field[] = [
  'lineId',
  'orderId',
  'saleDate',
  'sku',
  'quantity',
  'unitPrice',
  'lineTotal',
  'state',
];

function respond(
  data: object,
  status = 200,
): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
    },
  });
}

async function requireOwner(): Promise<Response | null> {
  const access = await getStaffAccess();

  if ('reason' in access) {
    return respond(
      {
        error:
          access.reason === 'unavailable'
            ? 'Staff verification is temporarily unavailable. Retry shortly.'
            : 'Sign in with an active Golden Rose owner account.',
      },
      access.reason === 'unavailable' ? 503 : 401,
    );
  }

  return access.role === 'owner'
    ? null
    : respond(
        {
          error:
            'Only the business owner can review historical sales imports.',
        },
        403,
      );
}

function normalizeHeading(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function automaticMapping(headers: string[]): Mapping {
  const normalized = headers.map(normalizeHeading);
  const mapping: Mapping = {};
  const assigned = new Set<number>();

  for (const field of fieldNames) {
    const choices = aliases[field].map(normalizeHeading);

    const index = normalized.findIndex(
      (header, i) =>
        !assigned.has(i) && choices.includes(header),
    );

    if (index !== -1) {
      mapping[field] = index;
      assigned.add(index);
    }
  }

  return mapping;
}

function readMapping(
  headers: string[],
  value: FormDataEntryValue | null,
): Mapping {
  if (value === null || value === '') {
    return automaticMapping(headers);
  }

  if (
    typeof value !== 'string' ||
    value.length > 2_000
  ) {
    throw new Error(
      'Invalid column mapping; review the file again.',
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      'Column mapping is not valid JSON.',
    );
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      'Column mapping must be an object.',
    );
  }

  const input = parsed as Record<string, unknown>;

  if (
    Object.keys(input).some(
      (key) => !fieldNames.includes(key as Field),
    )
  ) {
    throw new Error(
      'Column mapping contains an unknown target field.',
    );
  }

  const result: Mapping = {};

  for (const field of fieldNames) {
    const index = input[field];

    if (index === undefined || index === null) {
      continue;
    }

    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= headers.length
    ) {
      throw new Error(
        `Select a valid column for ${labels[field]}.`,
      );
    }

    result[field] = index;
  }

  return result;
}

function calendarDate(
  year: number,
  month: number,
  day: number,
): string | null {
  if (
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const value = [
    year,
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function parseSaleDate(value: string): string | null {
  const text = value.trim();

  const iso =
    /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T].*)?$/.exec(
      text,
    );

  if (iso) {
    return calendarDate(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
    );
  }

  const local =
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+.*)?$/.exec(
      text,
    );

  if (!local) {
    return null;
  }

  const first = Number(local[1]);
  const second = Number(local[2]);
  const year = Number(local[3]);

  // Never guess whether 05/06 means May 6 or June 5.
  if (first <= 12 && second <= 12) {
    return null;
  }

  if (first > 12) {
    return calendarDate(year, second, first);
  }

  return calendarDate(year, first, second);
}

function parseMoney(value: string): number | null {
  const withoutCurrency = value
    .trim()
    .replace(/^(?:NGN\s*|₦\s*)/i, '');

  if (
    withoutCurrency.includes(',') &&
    !/^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d{1,2})?$/.test(
      withoutCurrency,
    )
  ) {
    return null;
  }

  const text = withoutCurrency.replace(/,/g, '');

  if (
    !/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(
      text,
    )
  ) {
    return null;
  }

  const minor = nairaToKobo(text);

  return minor !== null &&
    minor <= 900_000_000_000_000
    ? minor
    : null;
}

function isNGN(value: string): boolean {
  return ['NGN', '₦', 'NIGERIAN NAIRA'].includes(
    value.trim().toUpperCase(),
  );
}

function validateDataset(
  headers: string[],
  records: string[][],
  mapping: Mapping,
  confirmedNGN: boolean,
): {
  rows: ImportLine[];
  issues: string[];
  issueCount: number;
} {
  const issues: string[] = [];
  let issueCount = 0;

  const issue = (message: string) => {
    issueCount += 1;

    if (issues.length < MAX_ISSUES) {
      issues.push(message);
    }
  };

  for (const field of requiredFields) {
    if (mapping[field] === undefined) {
      issue(
        `Map the required field: ${labels[field]}.`,
      );
    }
  }

  if (
    mapping.currency === undefined &&
    !confirmedNGN
  ) {
    issue(
      'Map the source currency or confirm that all amounts are already NGN.',
    );
  }

  const assigned = Object.values(mapping);

  if (
    new Set(assigned).size !== assigned.length
  ) {
    issue(
      'One source column cannot be assigned to multiple fields.',
    );
  }

  if (
    records.length < 1 ||
    records.length > MAX_ROWS
  ) {
    issue(
      `Upload between 1 and ${MAX_ROWS} historical sale lines per file.`,
    );
  }

  if (issueCount > 0) {
    return {
      rows: [],
      issues,
      issueCount,
    };
  }

  const rows: ImportLine[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const cells = records[i];

    const get = (field: Field) =>
      (cells[mapping[field] ?? -1] ?? '').trim();

    const lineId = get('lineId');
    const orderId = get('orderId');
    const sku = get('sku');
    const status = get('state');
    const quantity = get('quantity');
    const saleDate = parseSaleDate(get('saleDate'));

    const unitPriceMinor = parseMoney(
      get('unitPrice'),
    );

    const lineTotalMinor = parseMoney(
      get('lineTotal'),
    );

    const rawCost = get('unitCost');

    const unitCostMinor = rawCost
      ? parseMoney(rawCost)
      : null;

    const currency = get('currency');

    let problem = '';

    if (
      cells.length > headers.length &&
      cells
        .slice(headers.length)
        .some((cell) => cell.trim())
    ) {
      problem =
        'data appears in an extra, unnamed column';
    } else if (
      lineId.length < 1 ||
      lineId.length > 100 ||
      orderId.length < 1 ||
      orderId.length > 100 ||
      sku.length < 1 ||
      sku.length > 100 ||
      status.length < 1 ||
      status.length > 40 ||
      /[\r\n\0]/.test(
        lineId + orderId + sku + status,
      )
    ) {
      problem =
        'invalid Odoo line ID, order reference, SKU or state';
    } else if (!saleDate) {
      problem =
        'invalid or ambiguous date; use YYYY-MM-DD for clarity';
    } else if (
      !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(
        quantity,
      ) ||
      Number(quantity) <= 0 ||
      Number(quantity) > 100_000_000
    ) {
      problem =
        'quantity must be positive with up to three decimal places';
    } else if (
      unitPriceMinor === null ||
      lineTotalMinor === null ||
      (rawCost !== '' && unitCostMinor === null)
    ) {
      problem =
        'invalid NGN unit price, subtotal or optional historical cost';
    } else if (
      mapping.currency !== undefined &&
      !isNGN(currency)
    ) {
      problem =
        'currency is not NGN; foreign-currency conversion is not automatic';
    } else if (seen.has(lineId)) {
      problem =
        'duplicate Odoo sale-line ID within this file';
    }

    if (problem) {
      issue(`Row ${i + 2}: ${problem}.`);
      continue;
    }

    seen.add(lineId);

    rows.push({
      rowNumber: i + 2,
      lineId,
      orderId,
      saleDate: saleDate!,
      sku,
      quantity,
      unitPriceMinor: unitPriceMinor!,
      lineTotalMinor: lineTotalMinor!,
      unitCostMinor,
      state: status,
    });
  }

  return {
    rows,
    issues,
    issueCount,
  };
}

async function boundedForm(
  request: Request,
): Promise<FormData> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('multipart/form-data')
  ) {
    throw new Error(
      'Upload files using the Golden Rose import form.',
    );
  }

  const length = Number(
    request.headers.get('content-length') ?? 0,
  );

  if (
    Number.isFinite(length) &&
    length > MAX_REQUEST_BYTES
  ) {
    throw new Error(
      'The upload exceeds the 4 MB limit.',
    );
  }

  const reader = request.body?.getReader();

  if (!reader) {
    throw new Error(
      'No upload content was received.',
    );
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const next = await reader.read();

      if (next.done) {
        break;
      }

      size += next.value.byteLength;

      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();

        throw new Error(
          'The upload exceeds the 4 MB limit.',
        );
      }

      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  return new Response(
    Buffer.concat(chunks),
    {
      headers: {
        'content-type':
          request.headers.get('content-type') ?? '',
      },
    },
  ).formData();
}

export async function GET(): Promise<Response> {
  const denied = await requireOwner();

  if (denied) {
    return denied;
  }

  try {
    const client = await createClient();

    const { data, error } = await client.rpc(
      RPC_NAME,
      {
        p_action: 'list',
        p_payload: {},
      },
    );

    if (error) {
      console.error(
        '[Golden Rose Odoo sales history]',
        { code: error.code },
      );

      return respond(
        {
          error:
            'Could not load historical import history. Retry.',
        },
        503,
      );
    }

    if (
      !data ||
      !Array.isArray(data.batches)
    ) {
      return respond(
        {
          error:
            'The import service returned invalid history data.',
        },
        502,
      );
    }

    return respond(data);
  } catch {
    return respond(
      {
        error:
          'Historical import history is temporarily unavailable.',
      },
      503,
    );
  }
}

export async function POST(
  request: Request,
): Promise<Response> {
  const denied = await requireOwner();

  if (denied) {
    return denied;
  }

  const origin = request.headers.get('origin');

  if (
    (
      origin &&
      origin !== new URL(request.url).origin
    ) ||
    request.headers.get('sec-fetch-site') ===
      'cross-site'
  ) {
    return respond(
      {
        error:
          'Upload the file from the Golden Rose workspace.',
      },
      403,
    );
  }

  try {
    const form = await boundedForm(request);
    const file = form.get('file');

    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > MAX_FILE_BYTES
    ) {
      return respond(
        {
          error:
            'Choose a non-empty export up to 4 MB.',
        },
        400,
      );
    }

    const extension = file.name
      .split('.')
      .at(-1)
      ?.toLowerCase();

    if (
      !extension ||
      !SUPPORTED_EXTENSIONS.has(extension)
    ) {
      return respond(
        {
          error:
            'Supported files: CSV, XLSX, JSON or ZIP with one data file. Convert legacy XLS first.',
        },
        415,
      );
    }

    const action = form.get('action');

    if (
      action !== 'review' &&
      action !== 'stage'
    ) {
      return respond(
        {
          error:
            'Choose Review file or Approve and stage.',
        },
        400,
      );
    }

    const bytes = Buffer.from(
      await file.arrayBuffer(),
    );

    const fileHash = createHash('sha256')
      .update(bytes)
      .digest('hex');

    if (action === 'stage') {
      if (
        form.get('expectedHash') !== fileHash
      ) {
        return respond(
          {
            error:
              'The file has changed since review. Review it again.',
          },
          409,
        );
      }

      if (
        form.get('sourceConfirmed') !== 'true'
      ) {
        return respond(
          {
            error:
              'Confirm that this is a genuine Odoo export before staging.',
          },
          422,
        );
      }
    }

    const parsed = await parseUpload(
      bytes,
      file.name,
    );

    if (!parsed.dataset) {
      return respond(
        {
          error:
            'The ZIP contains multiple datasets. Upload one sales file at a time.',
        },
        422,
      );
    }

    const { headers, records } = parsed.dataset;

    const mapping = readMapping(
      headers,
      form.get('mapping'),
    );

    const confirmedNGN =
      form.get('confirmNgn') === 'true';

    const validation = validateDataset(
      headers,
      records,
      mapping,
      confirmedNGN,
    );

    const review: ReviewResult = {
      headers,
      mapping,
      fields: labels,
      requiredFields,
      rowCount: records.length,
      fileHash,
      issues: validation.issues,
      issueCount: validation.issueCount,
      ready: validation.issueCount === 0,
      preview: records.slice(0, 5),
    };

    if (action === 'review') {
      return respond(review);
    }

    if (validation.issueCount > 0) {
      return respond(
        {
          ...review,
          error:
            'Correct the highlighted mapping or data issues.',
        },
        422,
      );
    }

    const payload = {
      hash: fileHash,
      filename: file.name
        .replace(
          /[^\p{L}\p{N}_. -]/gu,
          '_',
        )
        .slice(0, 160),
      rows: validation.rows,
    };

    if (
      !payload.filename ||
      Buffer.byteLength(
        JSON.stringify(payload),
        'utf8',
      ) > MAX_RPC_PAYLOAD_BYTES
    ) {
      return respond(
        {
          error:
            'The file is too complex for one staging batch. Split it into smaller files.',
        },
        413,
      );
    }

    const client = await createClient();

    const { data, error } = await client.rpc(
      RPC_NAME,
      {
        p_action: 'stage',
        p_payload: payload,
      },
    );

    if (error) {
      console.error(
        '[Golden Rose Odoo sales staging]',
        { code: error.code },
      );

      if (error.code === '23505') {
        return respond(
          {
            error:
              'An Odoo line ID was already staged in another file. Check import history.',
          },
          409,
        );
      }

      if (error.code === '42501') {
        return respond(
          {
            error:
              'Your owner session was not authorized. Sign in again.',
          },
          403,
        );
      }

      if (
        [
          '22023',
          '22P02',
          '22007',
          '23514',
        ].includes(error.code)
      ) {
        return respond(
          {
            error:
              'The database rejected one or more sale lines. Check identifiers, dates and amounts.',
          },
          422,
        );
      }

      return respond(
        {
          error:
            'Staging could not be confirmed. Check import history before retrying.',
        },
        503,
      );
    }

    if (
      !data ||
      data.ok !== true ||
      typeof data.id !== 'string'
    ) {
      return respond(
        {
          error:
            'The database did not return a valid staging confirmation.',
        },
        502,
      );
    }

    return respond(data);
  } catch (error) {
    return respond(
      {
        error:
          error instanceof Error
            ? error.message.slice(0, 220)
            : 'Unable to read the export. Check its format and retry.',
      },
      400,
    );
  }
}
