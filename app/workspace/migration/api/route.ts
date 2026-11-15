import 'server-only';

import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { getSupabaseConfig } from '@/src/lib/supabase/config';
import { UUID } from '@/src/lib/golden-rose/contracts';
import { canImportData, isKind, MAX_UPLOAD, type Mapping, type RecordData } from '@/src/lib/imports/model';
import { digest } from '@/src/lib/imports/prepare';
import { createPackageService, WorkflowError } from '@/src/lib/imports/package-service';
import type { DatasetSettings } from '@/src/lib/imports/workflow';
import { adminProductPages } from '@/src/lib/golden-rose/edge';

const bucket = 'golden-rose-imports';
const limit = MAX_UPLOAD + 96_000;

function reply(data: object, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

async function checkOwner() {
  const staff = await getStaffAccess();
  if ('reason' in staff) {
    if (staff.reason === 'unavailable') return reply({ error: 'Could not verify owner access. Check the Supabase connection and retry.' }, 503);
    return reply({ error: 'Sign in with an active owner account.' }, staff.reason === 'session' ? 401 : 403);
  }
  return canImportData(staff.role) ? staff : reply({ error: 'Data imports require owner access.' }, 403);
}

class ImportServiceError extends Error {
  constructor(
    readonly unavailable: boolean,
    message = 'The import service could not complete the operation. Try again.',
    readonly status = 503,
  ) {
    super(message);
  }
}

function importKey() {
  const key = process.env.SUPABASE_IMPORT_SECRET_KEY?.trim();
  if (!key || !/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) {
    throw new ImportServiceError(true, 'Set the Golden Rose Supabase secret as SUPABASE_IMPORT_SECRET_KEY on the server, then restart the app.');
  }
  return key;
}

function importClient() {
  return createClient(getSupabaseConfig().url, importKey(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function rpc(client: ReturnType<typeof importClient>, actor: string, action: string, payload: object = {}) {
  const { data, error } = await client.rpc('gr_bulk_import', { p_action: action, p_payload: { ...payload, actor } });
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) {
      throw new ImportServiceError(true, 'The bulk-import function is unavailable. Check that the app points to the Golden Rose project.');
    }
    if (error.code === '42501') {
      if (error.message === 'Active owner access required.') throw new ImportServiceError(false, 'Data imports require an active owner account.', 403);
      throw new ImportServiceError(true, 'The server credential cannot access bulk imports. Verify the Golden Rose import secret and RPC grants.');
    }
    if (error.code === '22023') throw new ImportServiceError(false, error.message, 409);
    if (error.code === 'P0002') throw new ImportServiceError(false, 'Import job not found. Refresh import history and try again.', 404);
    if (error.code === 'PGRST301' || error.code === 'PGRST302' || /invalid api key/i.test(error.message)) {
      throw new ImportServiceError(true, 'The server import secret was rejected. Configure the active Golden Rose Supabase secret and restart the app.');
    }
    throw new ImportServiceError(false);
  }
  return data;
}

async function boundedRequest(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Provide an import request.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Choose an export of up to 4 MB.');
    }
    chunks.push(value);
  }
  return new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } });
}

function dataField(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}


function storageMissing(error: { status?: number | string; statusCode?: string; message: string }) {
  return Number(error.statusCode ?? error.status) === 404 || /^(object not found|the resource was not found)$/i.test(error.message);
}

function packageService(client: ReturnType<typeof importClient>, owner: { userId: string; token: string }) {
  const files = client.storage.from(bucket);

  async function read(path: string) {
    const { data, error } = await files.download(path).asStream();
    if (error) {
      if (storageMissing(error)) return null;
      throw new WorkflowError('Private import storage could not be read. Try again.', 503);
    }
    const reader = data.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) return Buffer.concat(chunks);
        length += next.value.byteLength;
        if (length > MAX_UPLOAD) {
          await reader.cancel();
          throw new WorkflowError('The stored source exceeds the supported upload size.', 413);
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function verifyStored(path: string, expectedHash: string) {
    const stored = await read(path);
    if (!stored || digest(stored) !== expectedHash) {
      throw new WorkflowError('The private import source could not be saved. Retry or reselect the same export.', 503);
    }
  }

  async function barcodeConflicts(records: RecordData[]) {
    const bySku = new Map<string, number>();
    const byBarcode = new Map<string, number>();
    const conflicts = new Set<number>();
    for (const record of records) {
      if (typeof record.sku === 'string') bySku.set(record.sku.toLowerCase(), record.row);
      if (typeof record.barcode === 'string') byBarcode.set(record.barcode, record.row);
    }
    if (!bySku.size && !byBarcode.size) return conflicts;
    for await (const page of adminProductPages(owner.token)) {
      for (const product of page) {
        for (const variant of product.variants) {
          const sku = variant.sku && bySku.get(variant.sku.toLowerCase());
          const barcode = variant.barcode && byBarcode.get(variant.barcode);
          if (sku) conflicts.add(sku);
          if (barcode) conflicts.add(barcode);
        }
      }
      if (conflicts.size === records.length) break;
    }
    return conflicts;
  }

  return createPackageService({
    rpc: (action, payload) => rpc(client, owner.userId, action, payload),
    sign: value => createHmac('sha256', importKey()).update(owner.userId + ':' + value).digest('hex'),
    barcodeConflicts,
    storage: {
      read,
      put: async (path, bytes, contentType) => {
        const { error } = await files.upload(path, bytes, { contentType, upsert: false });
        if (error) await verifyStored(path, digest(bytes));
      },
      copy: async (from, to, hash) => {
        const { error } = await files.copy(from, to);
        if (error) await verifyStored(to, hash);
      },
      recent: async () => {
        const { data, error } = await files.list('workflows', {
          limit: 12, sortBy: { column: 'created_at', order: 'desc' },
        });
        if (error) throw new WorkflowError('Saved import packages could not be loaded. Check private import storage and retry.', 503);
        return data.flatMap(item => /^[a-f0-9]{64}\.json$/.test(item.name) ? [item.name.slice(0, -5)] : []);
      },
    },
  });
}

function serviceError(error: unknown) {
  if (error instanceof ImportServiceError || error instanceof WorkflowError) return reply({ error: error.message }, error.status);
  return null;
}

export async function GET(request: Request) {
  const owner = await checkOwner();
  if (owner instanceof Response) return owner;
  const { searchParams } = new URL(request.url);
  const job = searchParams.get('job');
  const workflow = searchParams.get('workflow');
  if (job && !UUID.test(job)) return reply({ error: 'Invalid import job.' }, 400);
  try {
    const client = importClient();
    const packages = packageService(client, owner);
    if (workflow) return reply(await packages.get(workflow));
    const data = await rpc(client, owner.userId, job ? 'job' : 'history', job ? { job } : {});
    if (job) return reply(data);
    if (data?.available !== true || !Array.isArray(data.jobs)) {
      return reply({ error: 'The import service returned unexpected history data.' }, 502);
    }
    try {
      return reply({ ...data, packages: await packages.recent() });
    } catch {
      return reply({ ...data, packages: [], packageError: 'Saved import packages could not be loaded. Refresh history to try again.' });
    }
  } catch (error) {
    return serviceError(error) ?? reply({ error: 'Import history could not be loaded. Check the connection and retry.' }, 502);
  }
}

function datasetSettings(raw: string): DatasetSettings[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > 48) throw new WorkflowError('Invalid column settings.', 400);
  return parsed.map((item: DatasetSettings | null) => {
    if (!item || typeof item.key !== 'string' || item.key.length > 1100 ||
      (item.kind !== undefined && !isKind(item.kind)) ||
      (item.mapping !== undefined && (!item.mapping || typeof item.mapping !== 'object' || Array.isArray(item.mapping) ||
        Object.keys(item.mapping).length > 20))) throw new WorkflowError('Invalid column settings.', 400);
    return { key: item.key, kind: item.kind, mapping: item.mapping as Mapping | undefined };
  });
}

export async function POST(request: Request) {
  const owner = await checkOwner();
  if (owner instanceof Response) return owner;
  const origin = request.headers.get('origin');
  if ((origin && (!URL.canParse(origin) || new URL(origin).host !== request.headers.get('host'))) ||
      request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Use the business workspace to start an import.' }, 403);
  try {
    if (Number(request.headers.get('content-length')) > limit) return reply({ error: 'Choose an export of up to 4 MB.' }, 413);
    const body = await boundedRequest(request);
    const client = importClient();
    const packages = packageService(client, owner);
    if (request.headers.get('content-type')?.startsWith('application/json')) {
      const { action, id, job, plan, signature } = await body.json();
      if (action === 'start' && typeof signature === 'string') return reply(await packages.start(plan, signature));
      if (action === 'step' && typeof id === 'string') return reply(await packages.step(id));
      if (['apply', 'cancel', 'resume'].includes(action) && typeof job === 'string' && UUID.test(job)) {
        return reply(await rpc(client, owner.userId, action, { job }));
      }
      return reply({ error: 'Invalid import action.' }, 400);
    }

    const form = await body.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) return reply({ error: 'Choose a non-empty export.' }, 400);
    if (file.size > MAX_UPLOAD) return reply({ error: 'Choose an export of up to 4 MB.' }, 413);
    const filename = file.name.replace(/[^\p{L}\p{N}_. -]/gu, '_').slice(-160);
    const source = dataField(form, 'source').trim().toLowerCase();
    const settings = datasetSettings(dataField(form, 'settings'));
    return reply(await packages.review(Buffer.from(await file.arrayBuffer()), filename, source, settings));
  } catch (error) {
    return serviceError(error) ?? reply({
      error: error instanceof Error && !/Unexpected token|JSON at position|fetch failed/.test(error.message)
        ? error.message.slice(0, 250) : 'The export could not be read. Check the file and try again.',
    }, 400);
  }
}
