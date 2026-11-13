import { createHash } from 'node:crypto';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';
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
  return canImportData(staff.role) ? null : reply({ error: 'Data imports require owner access.' }, 403);
}

class ImportServiceError extends Error {
  constructor(readonly unavailable: boolean, message = 'The import service could not complete the operation. Try again.') {
    super(message);
  }
}

async function rpc(client: Awaited<ReturnType<typeof createClient>>, action: string, payload: object = {}) {
  const { data, error } = await client.rpc('gr_bulk_import', { p_action: action, p_payload: payload });
  if (error) throw new ImportServiceError(['PGRST202', '42883'].includes(error.code));
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
  const forbidden = await checkOwner();
  if (forbidden) return forbidden;
  const job = new URL(request.url).searchParams.get('job');
  if (job && !UUID.test(job)) return reply({ error: 'Invalid import job.' }, 400);
  try {
    const client = await createClient();
    return reply(await rpc(client, job ? 'job' : 'history', job ? { job } : {}));
  } catch (error) {
    if (error instanceof ImportServiceError && error.unavailable) return reply({ available: false, jobs: [] });
    return reply({ error: 'Import history could not be loaded.' }, 502);
  }
}

export async function POST(request: Request) {
  const forbidden = await checkOwner();
  if (forbidden) return forbidden;
  const origin = request.headers.get('origin');
  if ((origin && (!URL.canParse(origin) || new URL(origin).host !== request.headers.get('host'))) ||
      request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Use the business workspace to start an import.' }, 403);
  try {
    if (Number(request.headers.get('content-length')) > limit) return reply({ error: 'Choose an export of up to 4 MB.' }, 413);
    const body = await boundedRequest(request);
    if (request.headers.get('content-type')?.startsWith('application/json')) {
      const { action, job } = await body.json();
      if (!['apply', 'cancel', 'resume'].includes(action) || typeof job !== 'string' || !UUID.test(job)) return reply({ error: 'Invalid job action.' }, 400);
      const client = await createClient();
      return reply(await rpc(client, action, { job }));
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
    const fingerprint = createHash('sha256').update(bytes).update(JSON.stringify([source, kind, dataset.entry ?? '', currency, Object.entries(mapping).sort()])).digest('hex');
    if (action === 'stage' && dataField(form, 'fingerprint') !== fingerprint) return reply({ error: 'The file or mapping changed. Validate it again before importing.' }, 409);

    const client = await createClient();
    let verified = true;
    const matches = new Map<number, Issue>();
    try {
      for (const group of batches(batches(records), 6)) {
        const responses = await Promise.all(group.map(rows =>
          rpc(client, 'preflight', { source, kind, rows }) as Promise<{ results: Issue[] }>));
        responses.forEach(response => response.results.forEach(item => matches.set(item.row, item)));
      }
    } catch (error) {
      if (!(error instanceof ImportServiceError) || !error.unavailable) throw error;
      verified = false;
    }
    if (verified) {
      for (const result of results) {
        const match = matches.get(result.row);
        if (match) Object.assign(result, match);
      }
      if (results.some(result => result.status === 'unverified')) throw new ImportServiceError(false);
    }
    const counts = summarize(results);
    const review = createHash('sha256').update(fingerprint)
      .update(JSON.stringify(results.map(({ row, status, message }) => [row, status, message]))).digest('hex');
    if (action === 'validate') return reply({
      verified, counts, fingerprint, review,
      rows: results.slice(0, 50),
      issues: results.filter(row => ['invalid','skipped'].includes(row.status))
        .map(({ row, status, message }) => ({ row, status, message })),
    });
    if (!verified) throw new ImportServiceError(true);
    if (dataField(form, 'review') !== review) return reply({ error: 'Catalogue matches changed. Validate again before staging this file.' }, 409);
    if (!counts.new && !counts.updated) return reply({ error: 'There are no eligible changes in this upload.' }, 409);

    const filename = file.name.replace(/[^\p{L}\p{N}_. -]/gu, '_').slice(-160);
    const extension = file.name.toLowerCase().split('.').at(-1);
    const job = await rpc(client, 'begin', { source, kind, fingerprint, filename, extension, expected: results.length }) as {
      id: string; status: string; objectPath: string;
    };
    if (job.status !== 'uploading') return reply(await rpc(client, 'job', { job: job.id }));
    const mime = extension === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : extension === 'csv' ? 'text/csv' : extension === 'json' ? 'application/json' : 'application/zip';
    const { error: uploadError } = await client.storage.from(bucket).upload(job.objectPath, bytes, { contentType: mime, upsert: false });
    if (uploadError && String(uploadError.statusCode) !== '409' && uploadError.name !== 'Duplicate') throw new ImportServiceError(false, 'The private source upload failed. Re-select the same file and retry.');
    const normalized = new Map(records.map(record => [record.row, record]));
    for (const group of batches(batches(results), 4)) {
      await Promise.all(group.map(rows => rpc(client, 'stage', {
        job: job.id,
        rows: rows.map(({ row, status, message }) => ({
          row, status, message,
          data: status === 'new' || status === 'updated' ? normalized.get(row) : null,
        })),
      })));
    }
    return reply(await rpc(client, 'ready', { job: job.id }));
  } catch (error) {
    if (error instanceof ImportServiceError) return reply({
      error: error.unavailable ? 'Catalogue matching and job writes become available after the import migration is reviewed and applied.' : error.message,
    }, 503);
    return reply({ error: error instanceof Error && !/Unexpected token|JSON at position/.test(error.message)
      ? error.message.slice(0, 250) : 'The export or mapping could not be read.' }, 400);
  }
}
