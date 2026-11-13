'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ArrowRight, Database, Download, FileSpreadsheet, History, Upload } from 'lucide-react';
import { fields, fieldNames, guessMapping, importLabels, isKind, MAX_UPLOAD, supportedKinds,
  type Field, type ImportKind, type Issue, type Mapping, type RowResult, type RowStatus } from '@/src/lib/imports/model';

type Inspection = { headers: string[]; rowCount: number; detected?: string; entry?: string; files: string[]; images: number };
type Preview = { verified: boolean; fingerprint: string; review: string; counts: Record<RowStatus, number>; rows: RowResult[]; issues: Issue[] };
type Job = { id: string; status: string; source: string; filename: string; kind: ImportKind; expected: number; staged: number;
  pending: number; new: number; updated: number; invalid: number; skipped: number; issues: Issue[] };
const endpoint = '/workspace/migration/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error ?? 'The request could not be completed. Try again.');
  return data as T;
}

function exportIssues(issues: Issue[]) {
  const escape = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  const csv = ['Row,Status,Reason', ...issues.map(row => [row.row, row.status, escape(row.message)].join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'golden-rose-import-errors.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function MigrationCentre() {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [entry, setEntry] = useState('');
  const [kind, setKind] = useState<ImportKind | ''>('');
  const [preset, setPreset] = useState('auto');
  const [source, setSource] = useState('');
  const [currency, setCurrency] = useState('');
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<{ available: boolean; jobs: Job[] } | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const stop = useRef(false);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await request(endpoint));
      setHistoryError('');
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : 'Import history is unavailable.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    request<{ available: boolean; jobs: Job[] }>(endpoint, { signal: controller.signal }).then(setHistory, cause => {
      if (!controller.signal.aborted) setHistoryError(cause instanceof Error ? cause.message : 'Import history is unavailable.');
    });
    return () => controller.abort();
  }, []);

  function chooseMapping(next: ImportKind | '', headers = inspection?.headers ?? [], mode = preset) {
    setKind(next);
    setMapping(next && mode !== 'manual' ? guessMapping(headers, next, mode) : {});
    setPreview(null);
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setInspection(null);
    setEntry('');
    chooseMapping('');
    setError(next && next.size > MAX_UPLOAD ? 'Choose an export of up to 4 MB.' : '');
  }

  async function fileAction(action: 'inspect' | 'validate' | 'stage') {
    if (!file || busy || file.size > MAX_UPLOAD) return;
    setBusy(action);
    setError('');
    if (action !== 'stage') setPreview(null);
    const data = new FormData();
    data.set('file', file);
    data.set('action', action);
    if (entry) data.set('entry', entry);
    data.set('kind', kind);
    data.set('source', source);
    data.set('currency', currency);
    data.set('mapping', JSON.stringify(mapping));
    if (action === 'stage' && preview) {
      data.set('fingerprint', preview.fingerprint);
      data.set('review', preview.review);
    }
    try {
      const options = { method: 'POST', body: data };
      if (action === 'inspect') {
        const result = await request<Inspection>(endpoint, options);
        setInspection(result);
        setEntry(result.entry ?? '');
        chooseMapping(isKind(result.detected) ? result.detected : '', result.headers);
      } else if (action === 'validate') setPreview(await request<Preview>(endpoint, options));
      else {
        setJob(await request<Job>(endpoint, options));
        void refreshHistory();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The export could not be processed.');
      if (action === 'stage') void refreshHistory();
    } finally {
      setBusy('');
    }
  }

  async function jobAction(action: 'apply' | 'cancel' | 'resume', id: string) {
    return request<Job>(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, job: id }),
    });
  }

  async function openJob(id: string) {
    try {
      setError('');
      setJob(await request<Job>(endpoint + '?job=' + encodeURIComponent(id)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Import job unavailable.'); }
  }

  async function processJob(current: Job) {
    if (busy) return;
    stop.current = false;
    setBusy('apply');
    setError('');
    try {
      let next = current.status === 'cancelled' ? await jobAction('resume', current.id) : current;
      setJob(next);
      while (!stop.current && ['ready','processing'].includes(next.status)) {
        next = await jobAction('apply', next.id);
        if (!stop.current) setJob(next);
      }
      if (!stop.current) await openJob(current.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import paused. Continue the job to retry.');
    } finally {
      setBusy('');
      void refreshHistory();
    }
  }

  async function cancelJob(current: Job) {
    stop.current = true;
    setError('');
    try {
      setJob(await jobAction('cancel', current.id));
      void refreshHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The import could not be cancelled.'); }
  }

  const previewReady = Boolean(preview?.verified && preview.counts.new + preview.counts.updated > 0);

  return (
    <div className="gr-import">
      <header className="gr-import-heading">
        <div><p className="owner-kicker">Data Management</p><h1>Import Data</h1>
          <p>Validate and migrate catalogue records from Odoo, spreadsheets, or another ERP or POS export.</p></div>
        <span className="owner-metric-icon"><Database size={22} aria-hidden="true" /></span>
      </header>
      {history?.available === false && <p className="gr-import-notice" role="status">
        File inspection and validation are available. Catalogue matching, private storage and import jobs await the reviewed database migration.
      </p>}
      <section className="owner-panel gr-import-panel" aria-labelledby="upload-export">
        <h2 id="upload-export"><Upload size={19} aria-hidden="true" /> Upload an export</h2>
        <p>CSV, XLSX, JSON or ZIP. Up to 4 MB per upload and 25,000 rows per data file. Product photos are optional.</p>
        <fieldset disabled={Boolean(busy)} className="gr-import-upload">
          <label>Source file<input type="file" accept=".csv,.xlsx,.json,.zip" onChange={event => chooseFile(event.target.files?.[0] ?? null)} /></label>
          {inspection && inspection.files.length > 1 && <label>File inside ZIP
            <select value={entry} onChange={event => {
              setEntry(event.target.value);
              setInspection({ ...inspection, headers: [], rowCount: 0, detected: undefined, entry: undefined });
              chooseMapping('');
            }}>
              <option value="">Choose a data file</option>
              {inspection.files.map(path => <option key={path}>{path}</option>)}
            </select>
          </label>}
          <button type="button" className="gr-import-button" disabled={!file || file.size > MAX_UPLOAD || Boolean(inspection && inspection.files.length > 1 && !entry)}
            onClick={() => void fileAction('inspect')}>{busy === 'inspect' ? 'Inspecting…' : 'Inspect file'} <ArrowRight size={15} aria-hidden="true" /></button>
        </fieldset>
        {inspection && <p className="gr-import-meta">
          {inspection.headers.length ? <><FileSpreadsheet size={15} aria-hidden="true" /> {inspection.rowCount.toLocaleString('en-NG')} rows · Detected {isKind(inspection.detected) ? importLabels[inspection.detected] : inspection.detected}</> : 'Choose a data file from the package and inspect it.'}
          {inspection.images > 0 && <><Archive size={15} aria-hidden="true" /> {inspection.images} optional image entries. Images stay in the source package.</>}
        </p>}
        <p className="gr-import-meta">Supported writes cover brands, categories, product templates and product variants.</p>
      </section>

      {inspection && inspection.headers.length > 0 && (
        <section className="owner-panel gr-import-panel" aria-labelledby="map-columns">
          <h2 id="map-columns">Map source columns</h2>
          <fieldset disabled={Boolean(busy)} className="gr-import-fields">
            <label>Record type
              <select value={kind} onChange={event => chooseMapping(isKind(event.target.value) ? event.target.value : '')}>
                <option value="">Choose a supported type</option>
                {supportedKinds.map(item => <option value={item} key={item}>{importLabels[item]}</option>)}
              </select>
            </label>
            <label>Mapping preset
              <select value={preset} onChange={event => {
                const next = event.target.value;
                setPreset(next);
                chooseMapping(kind, inspection.headers, next);
                if (next === 'odoo' && !source) setSource('odoo');
              }}><option value="auto">Standard headers</option><option value="odoo">Odoo export</option><option value="manual">Manual mapping</option></select>
            </label>
            <label>Stable source key<input value={source} onChange={event => { setSource(event.target.value); setPreview(null); }}
              maxLength={64} placeholder="e.g. shop-erp" autoComplete="off" /></label>
            {kind === 'variant' && <label>Currency when the source field is blank
              <select value={currency} onChange={event => { setCurrency(event.target.value); setPreview(null); }}>
                <option value="">Require a source currency</option><option value="NGN">NGN (confirmed for this file)</option>
              </select>
            </label>}
            {kind && fieldNames(kind).map(field => (
              <label key={field}>{fields[field][0]}
                <select value={mapping[field] ?? ''} onChange={event => {
                  const value = event.target.value;
                  setMapping(current => Object.fromEntries([
                    ...Object.entries(current).filter(([key]) => key !== field),
                    ...(value ? [[field as Field, Number(value)]] : []),
                  ]));
                  setPreview(null);
                }}><option value="">Unmapped</option>
                  {inspection.headers.map((header, index) => <option key={header} value={index}>{header}</option>)}
                </select>
              </label>
            ))}
            <button type="button" className="gr-import-button" disabled={!kind || !source.trim()} onClick={() => void fileAction('validate')}>
              {busy === 'validate' ? 'Validating…' : 'Validate and preview'} <ArrowRight size={15} aria-hidden="true" />
            </button>
          </fieldset>
          {!kind && inspection.detected && !isKind(inspection.detected) && <p className="gr-import-meta">Detected records of this type are awaiting a destination mapping.</p>}
        </section>
      )}

      {preview && <section className="owner-panel gr-import-panel" aria-labelledby="review-import">
        <h2 id="review-import">Validation preview</h2>
        <dl className="gr-import-counts">
          {Object.entries(preview.counts).map(([status, count]) => <div key={status}>
            <dt>{status === 'unverified' ? 'Awaiting match' : status}</dt><dd>{count.toLocaleString('en-NG')}</dd>
          </div>)}
        </dl>
        {!preview.verified && <p className="gr-import-meta">New and updated counts require a catalogue match. The rows below show format checks.</p>}
        <div className="gr-import-table" tabIndex={0} role="region" aria-label="Scrollable import preview">
          <table><caption>First {preview.rows.length} rows</caption>
            <thead><tr><th>Row</th><th>Record</th><th>Status</th><th>Details</th></tr></thead>
            <tbody>{preview.rows.map(row => <tr key={row.row}><td>{row.row}</td><td>{row.name || '—'}</td><td>{row.status}</td><td>{row.message}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="gr-import-actions">
          <button type="button" className="gr-import-secondary" disabled={!preview.issues.length} onClick={() => exportIssues(preview.issues)}><Download size={16} aria-hidden="true" /> Download error report</button>
          <button type="button" className="gr-import-button" disabled={!previewReady || Boolean(busy)} onClick={() => void fileAction('stage')}>
            {busy === 'stage' ? 'Saving private source and staging…' : 'Confirm and stage valid rows'}
          </button>
        </div>
      </section>}

      {error && <p role="alert" className="gr-import-error">{error}</p>}
      {busy && <p className="gr-import-meta" role="status">{busy === 'apply' ? 'Processing the next import batch…' : 'Working on your import…'}</p>}

      <section className="owner-panel gr-import-panel" aria-labelledby="import-history">
        <h2 id="import-history"><History size={19} aria-hidden="true" /> Import history</h2>
        {job && <div className="gr-import-job">
          <strong>{job.filename} · {job.status}</strong>
          <progress max={job.expected} value={job.status === 'uploading' ? job.staged : job.staged - job.pending} aria-label="Import progress" />
          <p>{job.staged}/{job.expected} staged · {job.new} created · {job.updated} updated · {job.invalid} invalid · {job.skipped} skipped</p>
          {job.status === 'uploading' && <p>Select the same file, source and mapping to finish staging.</p>}
          <div className="gr-import-actions">
            {['ready','processing','cancelled'].includes(job.status) && <button type="button" className="gr-import-button" disabled={Boolean(busy)} onClick={() => void processJob(job)}>
              {job.status === 'ready' ? 'Start import' : 'Resume import'}
            </button>}
            {['uploading','ready','processing'].includes(job.status) && <button type="button" className="gr-import-secondary" onClick={() => void cancelJob(job)}>Cancel job</button>}
            {job.issues?.length > 0 && <button type="button" className="gr-import-secondary" onClick={() => exportIssues(job.issues)}><Download size={15} aria-hidden="true" /> Export job errors</button>}
          </div>
        </div>}
        {historyError ? <p role="alert">{historyError} <button type="button" className="owner-text-action" onClick={() => void refreshHistory()}>Retry</button></p>
          : history?.available === false ? <p>Import history will appear after the cloud infrastructure is installed.</p>
          : !history ? <p role="status">Loading import history…</p>
          : history.jobs.length ? <ul className="gr-import-jobs">{history.jobs.map(item => (
            <li key={item.id}><button type="button" className="gr-import-secondary" disabled={Boolean(busy)} onClick={() => void openJob(item.id)}>
              {item.filename} · {importLabels[item.kind]} · {item.status}
            </button></li>
          ))}</ul> : <p>No import jobs yet.</p>}
      </section>
    </div>
  );
}
