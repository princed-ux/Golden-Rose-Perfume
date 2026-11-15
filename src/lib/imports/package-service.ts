import { timingSafeEqual } from 'node:crypto';
import { batches, MAX_UPLOAD, summarize, type Issue, type RecordData } from './model';
import { digest, prepareImport, type PreparedDataset } from './prepare';
import {
  workflowStatus, type DatasetPlan, type DatasetSettings, type ImportJob,
  type ReviewResponse, type WorkflowPlan, type WorkflowProgress,
} from './workflow';

type Match = Issue & { targetId?: string | null };
type ExistingJob = { id?: string; status?: ImportJob['status']; objectPath?: string };
type Rpc = (action: string, payload?: object) => Promise<unknown>;
type ImportStorage = {
  read: (path: string) => Promise<Buffer | null>;
  put: (path: string, bytes: Buffer, mime: string) => Promise<void>;
  copy: (from: string, to: string, sourceHash: string) => Promise<void>;
  recent: () => Promise<string[]>;
};
type Dependencies = {
  rpc: Rpc;
  storage: ImportStorage;
  sign: (text: string) => string;
  barcodeConflicts: (records: RecordData[]) => Promise<Set<number>>;
};

const textMime = 'application/json';
const mimeTypes: Record<string, string> = {
  csv: 'text/csv', json: textMime, zip: 'application/zip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const extension = (filename: string) => filename.toLowerCase().split('.').at(-1);
const planPath = (id: string) => 'workflows/' + id + '.json';
const sourcePath = ({ hash, filename }: Pick<WorkflowPlan, 'hash' | 'filename'>) => 'workflow-sources/' + hash + '.' + extension(filename);
const sourceKey = /^[a-z0-9][a-z0-9-]{1,63}$/;
const sha256 = /^[a-f0-9]{64}$/;
const unresolved = {
  parent: 'Parent product is unresolved.',
  brand: 'Brand source ID is unresolved.',
  category: 'Category source ID is unresolved.',
};

export class WorkflowError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

function metadata(plan: WorkflowPlan, dataset: DatasetPlan) {
  return {
    source: plan.source, kind: dataset.kind,
    fingerprint: digest(plan.hash + ':' + (dataset.entry ?? '')), sourceHash: plan.hash,
    extension: extension(plan.filename), entry: dataset.entry,
    mapping: dataset.mapping, currency: dataset.currency, expected: dataset.expected,
  };
}

function decisions(item: PreparedDataset, matches: Map<number, Match>) {
  return digest(JSON.stringify(item.results.map(row => [row.row, row.status, matches.get(row.row)?.targetId ?? null])));
}

async function matchRows(rpc: Rpc, source: string, item: PreparedDataset, records = item.records) {
  const matches = new Map<number, Match>();
  for (const group of batches(batches(records), 4)) {
    const tables = await Promise.all(group.map(async rows =>
      await rpc('preflight', { source, kind: item.kind, rows }) as { results: Match[] }));
    for (const table of tables) {
      for (const match of table.results) matches.set(match.row, match);
    }
  }
  if (records.some(record => !matches.has(record.row))) throw new WorkflowError('Catalogue validation returned an incomplete result. Review the file again.', 502);
  return matches;
}

function mergeMatches(item: PreparedDataset, matches: Map<number, Match>) {
  const byTarget = new Map<string, number>();
  for (const [row, match] of matches) {
    const result = item.results[row - 2];
    result.status = match.status;
    result.message = match.message;
    if (!match.targetId) continue;
    const earlier = byTarget.get(match.targetId);
    if (earlier !== undefined) {
      for (const number of [earlier, row]) {
        item.results[number - 2].status = 'invalid';
        item.results[number - 2].message = 'Multiple rows resolve to the same Golden Rose record.';
      }
    } else byTarget.set(match.targetId, row);
  }
}

function pendingTemplateReference(record: RecordData, external: Map<string, RecordData>, database: Map<string, RecordData>) {
  const byExternal = record.parentExternalId ? external.get(String(record.parentExternalId)) : undefined;
  const byDatabase = record.parentDatabaseId ? database.get(String(record.parentDatabaseId)) : undefined;
  return record.parentExternalId && record.parentDatabaseId ? byExternal && byExternal === byDatabase : Boolean(byExternal || byDatabase);
}

export function createPackageService({ rpc, storage, sign, barcodeConflicts }: Dependencies) {
  async function readPlan(id: string) {
    if (!sha256.test(id)) throw new WorkflowError('Invalid import reference.', 400);
    const stored = await storage.read(planPath(id));
    return stored ? JSON.parse(stored.toString('utf8')) as WorkflowPlan : null;
  }

  const requirePlan = async (id: string) => {
    const plan = await readPlan(id);
    if (!plan) throw new WorkflowError('This import was not found. Check import history.', 404);
    return plan;
  };

  async function progress(plan: WorkflowPlan): Promise<WorkflowProgress> {
    const datasets = await Promise.all(plan.datasets.map(async dataset => {
      const existing = await rpc('find', metadata(plan, dataset)) as ExistingJob;
      const job = existing.id ? await rpc('job', { job: existing.id }) as ImportJob : null;
      const { key, name, kind, expected } = dataset;
      return { key, name, kind, expected, job };
    }));
    return { id: plan.id, filename: plan.filename, source: plan.source, status: workflowStatus(datasets), datasets };
  }

  async function review(bytes: Buffer, filename: string, sourceOverride: string, settings: DatasetSettings[]): Promise<ReviewResponse> {
    const mime = mimeTypes[extension(filename) ?? ''];
    if (!mime) throw new WorkflowError('Choose a CSV, XLSX, JSON or ZIP export.', 400);
    const { prepared, images, source: detected } = await prepareImport(bytes, filename, settings);
    const source = sourceOverride || detected;
    if (!sourceKey.test(source)) throw new WorkflowError('Use 2–64 letters, numbers or hyphens for the source key.', 400);
    const hash = digest(bytes);
    const id = digest('golden-rose-import-v1:' + source + ':' + hash);
    const plan: WorkflowPlan = { id, filename, source, hash, datasets: [] };
    const existing = await readPlan(id);
    if (existing) return { source, images, datasets: [], existing: await progress(existing) };

    const brandIds = new Set<string>();
    const categoryIds = new Set<string>();
    const templateIds = new Map<string, RecordData>();
    const templateDatabaseIds = new Map<string, RecordData>();
    for (const item of prepared) {
      if (item.error || !item.kind) continue;
      const matches = await matchRows(rpc, source, item);
      if (item.kind === 'template') {
        const dependent = item.records.flatMap(record => {
          const match = matches.get(record.row);
          if (!(match?.message.startsWith(unresolved.brand) || match?.message.startsWith(unresolved.category))) return [];
          const candidate = { ...record };
          if (brandIds.has(String(candidate.brandExternalId))) delete candidate.brandExternalId;
          if (categoryIds.has(String(candidate.categoryExternalId))) delete candidate.categoryExternalId;
          return candidate.brandExternalId !== record.brandExternalId || candidate.categoryExternalId !== record.categoryExternalId
            ? [candidate] : [];
        });
        for (const [row, match] of await matchRows(rpc, source, item, dependent)) {
          matches.set(row, match.status === 'invalid' ? match : { ...match, message: 'Ready after related brands or categories are imported.' });
        }
      }
      if (item.kind === 'variant') {
        const deferred = item.records.filter(record =>
          matches.get(record.row)?.message.startsWith(unresolved.parent) &&
          pendingTemplateReference(record, templateIds, templateDatabaseIds));
        const conflicts = deferred.length ? await barcodeConflicts(deferred) : new Set<number>();
        for (const record of deferred) {
          matches.set(record.row, conflicts.has(record.row)
            ? { row: record.row, status: 'invalid', message: 'SKU or barcode already belongs to another Golden Rose variant.' }
            : { row: record.row, status: 'new', message: 'Ready after its product template is imported.' });
        }
      }

      mergeMatches(item, matches);
      for (const record of item.records) {
        if (item.results[record.row - 2].status === 'invalid') continue;
        if (item.kind === 'brand' && record.externalId) brandIds.add(String(record.externalId));
        if (item.kind === 'category' && record.externalId) categoryIds.add(String(record.externalId));
        if (item.kind === 'template') {
          if (record.externalId) templateIds.set(String(record.externalId), record);
          if (record.databaseId) templateDatabaseIds.set(String(record.databaseId), record);
        }
      }
      plan.datasets.push({
        key: item.key, name: item.name, entry: item.entry, kind: item.kind, mapping: item.mapping,
        currency: item.currency, expected: item.results.length, decisions: decisions(item, matches),
      });
    }

    const datasets = prepared.map(item => ({
      key: item.key, name: item.name, kind: item.kind, headers: item.headers, mapping: item.mapping,
      generated: item.generated, error: item.error, counts: summarize(item.results),
      rows: item.results.slice(0, 10),
      issues: item.results.filter(row => row.status === 'invalid' || row.status === 'skipped')
        .map(({ row, status, message }) => ({ row, status, message })),
    }));
    for (const dataset of plan.datasets) {
      const already = await rpc('find', metadata(plan, dataset)) as ExistingJob;
      if (already.status !== 'complete') continue;
      const job = await rpc('job', { job: already.id }) as ImportJob;
      const report = datasets.find(item => item.key === dataset.key)!;
      if (job.invalid > 0) report.error = 'This dataset was previously imported with failed rows. Correct them in a fresh export.';
      else {
        report.counts = { new: 0, updated: 0, skipped: job.expected, invalid: 0, unverified: 0 };
        report.rows = [];
        report.issues = [];
      }
    }
    const eligible = plan.datasets.length > 0 && datasets.every(item =>
      !item.error && !item.counts.invalid && !item.counts.unverified);
    if (!eligible) return { source, images, datasets };
    await storage.put(sourcePath(plan), bytes, mime);
    return { source, images, datasets, approval: { plan, signature: sign(JSON.stringify(plan)) } };
  }

  async function start(plan: WorkflowPlan, signature: string) {
    if (!plan || !sha256.test(signature) ||
      !timingSafeEqual(Buffer.from(sign(JSON.stringify(plan)), 'hex'), Buffer.from(signature, 'hex'))) {
      throw new WorkflowError('Review the current export before confirming the import.', 400);
    }
    const previous = await readPlan(plan.id);
    if (previous) return progress(previous);
    await storage.put(planPath(plan.id), Buffer.from(JSON.stringify(plan)), textMime);
    return progress(plan);
  }

  async function stage(plan: WorkflowPlan, dataset: DatasetPlan) {
    const bytes = await storage.read(sourcePath(plan));
    if (!bytes || bytes.length > MAX_UPLOAD || digest(bytes) !== plan.hash) throw new WorkflowError('The verified source is missing or changed. Choose the export again.');
    const settings = plan.datasets.map(item => ({
      key: item.key, kind: item.kind, mapping: item.mapping,
    }));
    const { prepared } = await prepareImport(bytes, plan.filename, settings);
    const item = prepared.find(item => item.key === dataset.key);
    if (!item || item.error) throw new WorkflowError('The stored dataset could not be validated.');
    const matches = await matchRows(rpc, plan.source, item);
    mergeMatches(item, matches);
    if (decisions(item, matches) !== dataset.decisions) {
      throw new WorkflowError(dataset.name + ': catalogue matches changed after review. Correct or re-export the affected data.');
    }
    const review = digest(JSON.stringify([plan.id, dataset.key, dataset.decisions]));
    const job = await rpc('begin', { ...metadata(plan, dataset), filename: plan.filename, review }) as ExistingJob;
    if (job.status !== 'uploading') return;
    if (!job.id || !job.objectPath) throw new WorkflowError('The import service returned an invalid job.', 502);
    await storage.copy(sourcePath(plan), job.objectPath, plan.hash);
    const records = new Map(item.records.map(row => [row.row, row]));
    for (const group of batches(batches(item.results), 4)) {
      await Promise.all(group.map(rows => rpc('stage', {
        job: job.id, review,
        rows: rows.map(({ row, status, message }) => ({
          row, status, message,
          data: status === 'new' || status === 'updated' ? records.get(row) : null,
          targetId: matches.get(row)?.targetId ?? null,
        })),
      })));
    }
    await rpc('ready', { job: job.id, review });
  }

  async function step(id: string) {
    const plan = await requirePlan(id);
    const state = await progress(plan);
    if (state.status === 'failed' || state.status === 'complete') return state;
    const index = state.datasets.findIndex(({ job }) => job?.status !== 'complete');
    const { job } = state.datasets[index];
    if (!job || job.status === 'uploading') await stage(plan, plan.datasets[index]);
    else if (job.status === 'cancelled') await rpc('resume', { job: job.id });
    else await rpc('apply', { job: job.id });
    return progress(plan);
  }

  return {
    review, start, step,
    get: async (id: string) => progress(await requirePlan(id)),
    recent: async () => {
      const plans = await Promise.all((await storage.recent()).map(readPlan));
      return plans.flatMap(plan => plan ? [{ id: plan.id, filename: plan.filename, source: plan.source }] : []);
    },
  };
}
