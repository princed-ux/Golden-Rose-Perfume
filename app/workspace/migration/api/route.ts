import { createHash, createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { getSupabaseConfig } from '@/src/lib/supabase/config';
import { UUID } from '@/src/lib/golden-rose/contracts';
import { batches, canImportData, isKind, MAX_UPLOAD, summarize, validateRows, type Mapping, type Issue } from '@/src/lib/imports/model';
import { parseUpload } from '@/src/lib/imports/parser';

const bucket = 'golden-rose-imports';
const limit = MAX_UPLOAD + 96_000;

function reply(data: object, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

async function checkOwner() {
  const staff = await getStaffAccess();
  if ('reason' in staff) return reply({ error: 'Sign in with an active owner account.' }, staff.reason === 'session' ? 401 : 403);
  return canImportData(staff.role) ? staff.userId : reply({ error: 'Data imports require owner access.' }, 403);
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
  if (!key || !/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) throw new ImportServiceError(true);
  return key;
}

function importClient() {
  return createClient(getSupabaseConfig().url, importKey(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function rpc(client: ReturnType<typeof importClient>, actor: string, action: string, payload: object = {}) {
  const { data, error } = await client.rpc('gr_bulk_import', { p_action: action, p_payload: { ...payload, actor } });
  if (error) throw new ImportServiceError(
    ['PGRST202', '42883'].includes(error.code),
    error.code === '22023' ? error.message : undefined,
    error.code === '22023' ? 409 : error.code === '42501' ? 403 : 503,
  );
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

export async function GET(request: Request) {
  const actor = await checkOwner();
  if (actor instanceof Response) return actor;
  const job = new URL(request.url).searchParams.get('job');
  if (job && !UUID.test(job)) return reply({ error: 'Invalid import job.' }, 400);
  try {
    const client = importClient();
    return reply(await rpc(client, actor, job ? 'job' : 'history', job ? { job } : {}));
  } catch (error) {
    if (error instanceof ImportServiceError && error.unavailable) return reply({ available: false, jobs: [] });
    return reply({ error: 'Import history could not be loaded.' }, 502);
  }
}

export async function POST(request: Request) {
  const actor = await checkOwner();
  if (actor instanceof Response) return actor;
  const origin = request.headers.get('origin');
  if ((origin && (!URL.canParse(origin) || new URL(origin).host !== request.headers.get('host'))) ||
      request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Use the business workspace to start an import.' }, 403);
  try {
    if (Number(request.headers.get('content-length')) > limit) return reply({ error: 'Choose an export of up to 4 MB.' }, 413);
    const body = await boundedRequest(request);
    if (request.headers.get('content-type')?.startsWith('application/json')) {
      const { action, job } = await body.json();
      if (!['apply', 'cancel', 'resume'].includes(action) || typeof job !== 'string' || !UUID.test(job)) return reply({ error: 'Invalid job action.' }, 400);
      return reply(await rpc(importClient(), actor, action, { job }));
    }

    const form = await body.formData();
    const file = form.get('file');
    const action = dataField(form, 'action');
    if (!(file instanceof File) || !['inspect', 'validate', 'stage'].includes(action)) return reply({ error: 'Choose an export and a supported action.' }, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = await parseUpload(bytes, file.name, dataField(form, 'entry') || undefined);
    const { dataset, files, images } = parsed;
    if (action === 'inspect') return reply({
      headers: dataset?.headers ?? [], rowCount: dataset?.records.length ?? 0, detected: dataset?.kind,
      entry: dataset?.entry, files, images,
    });
    const kind = dataField(form, 'kind');
    const source = dataField(form, 'source').trim().toLowerCase();
    const currency = dataField(form, 'currency');
    if (!dataset || !isKind(kind) || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(source) || !['', 'NGN'].includes(currency)) {
      return reply({ error: 'Select a supported record type and a stable source key such as shop-erp.' }, 400);
    }
    const mapping: Mapping = JSON.parse(dataField(form, 'mapping'));
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return reply({ error: 'Map the source columns first.' }, 400);
    const { results, records } = validateRows(dataset, kind, mapping, currency);
    const sourceHash = createHash('sha256').update(bytes).digest('hex');
    const fingerprint = createHash('sha256').update(sourceHash + ':' + (dataset.entry ?? '')).digest('hex');
    if (action === 'stage' && dataField(form, 'fingerprint') !== fingerprint) return reply({ error: 'The source file or ZIP entry changed. Validate it again before importing.' }, 409);

    const extension = file.name.toLowerCase().split('.').at(-1);
    const metadata = {
      source, kind, fingerprint, sourceHash, extension, entry: dataset.entry ?? null,
      mapping, currency, expected: results.length,
    };
    if (action === 'stage') {
      const client = importClient();
      const existing = await rpc(client, actor, 'find', metadata) as { id?: string; status?: string };
      if (existing.id && existing.status !== 'uploading') return reply(await rpc(client, actor, 'job', { job: existing.id }));
    }
    let verified = true;
    const matches = new Map<number, Issue & { targetId?: string }>();
    try {
      const client = importClient();
      for (const group of batches(batches(records), 6)) {
        const responses = await Promise.all(group.map(rows =>
          rpc(client, actor, 'preflight', { source, kind, rows }) as Promise<{ results: (Issue & { targetId?: string })[] }>));
        responses.forEach(response => response.results.forEach(item => matches.set(item.row, item)));
      }
    } catch (error) {
      if (!(error instanceof ImportServiceError) || !error.unavailable) throw error;
      verified = false;
    }
    if (verified) {
      const byTarget = new Map<string, typeof results>();
      for (const result of results) {
        const match = matches.get(result.row);
        if (!match) continue;
        result.status = match.status;
        result.message = match.message;
        if (match.targetId) {
          const group = byTarget.get(match.targetId) ?? [];
          group.push(result);
          byTarget.set(match.targetId, group);
        }
      }
      for (const group of byTarget.values()) {
        if (group.length < 2) continue;
        for (const row of group) {
          row.status = 'invalid';
          row.message = 'Multiple rows resolve to the same Golden Rose record.';
        }
      }
      if (results.some(result => result.status === 'unverified')) throw new ImportServiceError(false);
    }
    const counts = summarize(results);
    const review = verified ? createHmac('sha256', importKey())
      .update(JSON.stringify(['golden-rose-import-review-v1', source, kind, fingerprint, extension, currency, Object.entries(mapping).sort()]))
      .update(JSON.stringify(results.map(({ row, status, message }) => [row, status, message, matches.get(row)?.targetId ?? null])))
      .digest('hex') : '';
    if (action === 'validate') return reply({
      verified, counts, fingerprint, review,
      rows: results.slice(0, 50),
      issues: results.filter(row => ['invalid','skipped'].includes(row.status))
        .map(({ row, status, message }) => ({ row, status, message })),
    });
    if (!verified) throw new ImportServiceError(true);
    if (dataField(form, 'review') !== review) return reply({ error: 'The mapping or catalogue matches changed. Validate again before staging this file.' }, 409);
    if (!counts.new && !counts.updated) return reply({ error: 'There are no eligible changes in this upload.' }, 409);

    const client = importClient();
    const filename = file.name.replace(/[^\p{L}\p{N}_. -]/gu, '_').slice(-160);
    const job = await rpc(client, actor, 'begin', { ...metadata, filename, review }) as {
      id: string; status: string; objectPath: string;
    };
    if (job.status !== 'uploading') return reply(await rpc(client, actor, 'job', { job: job.id }));
    const mime = extension === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : extension === 'csv' ? 'text/csv' : extension === 'json' ? 'application/json' : 'application/zip';
    const { error: uploadError } = await client.storage.from(bucket).upload(job.objectPath, bytes, { contentType: mime, upsert: false });
    if (uploadError) {
      if (String(uploadError.statusCode) !== '409') throw new ImportServiceError(false, 'The private source upload failed. Re-select the same file and retry.');
      const { data: original, error } = await client.storage.from(bucket).download(job.objectPath);
      if (error || !original || original.size !== bytes.length ||
        createHash('sha256').update(Buffer.from(await original.arrayBuffer())).digest('hex') !== sourceHash) {
        throw new ImportServiceError(false, 'The stored source does not match the reviewed file.');
      }
    }
    const normalized = new Map(records.map(record => [record.row, record]));
    for (const group of batches(batches(results), 4)) {
      await Promise.all(group.map(rows => rpc(client, actor, 'stage', {
        job: job.id,
        review,
        rows: rows.map(({ row, status, message }) => ({
          row, status, message,
          data: status === 'new' || status === 'updated' ? normalized.get(row) : null,
          targetId: matches.get(row)?.targetId ?? null,
        })),
      })));
    }
    return reply(await rpc(client, actor, 'ready', { job: job.id, review }));
  } catch (error) {
    if (error instanceof ImportServiceError) return reply({
      error: error.unavailable ? 'Catalogue matching and job writes require the reviewed migration and server import key.' : error.message,
    }, error.status);
    return reply({ error: error instanceof Error && !/Unexpected token|JSON at position/.test(error.message)
      ? error.message.slice(0, 250) : 'The export or mapping could not be read.' }, 400);
  }
}
