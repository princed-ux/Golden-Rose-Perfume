'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { AlertCircle, Check, Download, FileSpreadsheet, History, Package, RefreshCw, Upload } from 'lucide-react';
import { fieldNames, fields, guessMapping, importLabels, MAX_UPLOAD, supportedKinds, type Field, type ImportKind, type Issue } from '@/src/lib/imports/model';
import type { DatasetReview, DatasetSettings, ImportJob, ReviewResponse, WorkflowProgress } from '@/src/lib/imports/workflow';

const endpoint = '/workspace/migration/api';
const activeImport = 'golden-rose:active-import';
const stepNames = ['Upload file', 'Review products', 'Import'];
const jobLabels: Record<ImportJob['status'], string> = {
  uploading: 'Staging', ready: 'Staged', processing: 'Importing', complete: 'Imported', cancelled: 'Paused',
};
type HistoryResponse = {
  jobs: ImportJob[];
  packages: { id: string; filename: string; source: string }[];
  packageError?: string;
};

async function request<T>(query = '', body?: FormData | object, signal?: AbortSignal): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch(endpoint + query, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: body && !form ? { 'Content-Type': 'application/json' } : undefined,
    body: form ? body : body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Data Management could not complete the request. Try again.');
  }
  return data as T;
}

function setSavedImport(id: string) {
  try { localStorage.setItem(activeImport, id); } catch { /* Cloud history remains available. */ }
}

function issueText(error: unknown) {
  return error instanceof Error ? error.message : 'The import could not continue. Try again.';
}

function downloadIssues(issues: Array<Issue & { dataset?: string }>) {
  const cell = (value: string | number) => {
    const text = String(value);
    const safe = /^[\s]*[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const rows = [['Dataset', 'Row', 'Status', 'Message'], ...issues.map(item => [item.dataset ?? '', item.row, item.status, item.message])];
  const url = URL.createObjectURL(new Blob([rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'golden-rose-import-issues.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function JobBadge({ job }: { job: ImportJob }) {
  const failed = job.status === 'complete' && job.invalid > 0;
  const tone = failed ? 'danger' : job.status === 'complete' ? 'success' : 'progress';
  return <span className={'gr-import-status gr-import-status--' + tone}><span />{failed ? 'Completed with errors' : jobLabels[job.status]}</span>;
}

function JobCounts({ job }: { job: ImportJob }) {
  return <div className="gr-import-job-stats">
    <span>{job.staged} staged</span><span>{job.new + job.updated} imported</span>
    <span>{job.invalid} failed</span><span>{job.skipped} skipped</span>
  </div>;
}

export function MigrationCentre() {
  const input = useRef<HTMLInputElement>(null);
  const pause = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [progress, setProgress] = useState<WorkflowProgress | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('Restoring import history…');
  const [source, setSource] = useState('');
  const [settings, setSettings] = useState<DatasetSettings[]>([]);
  const [changed, setChanged] = useState(false);
  const [dragging, setDragging] = useState(false);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await request<HistoryResponse>());
      setHistoryError('');
    } catch (cause) {
      setHistoryError(issueText(cause));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    pause.current = false;
    async function restore() {
      try {
        const saved = await request<HistoryResponse>('', undefined, signal);
        if (signal.aborted) return;
        setHistory(saved);
        let remembered: string | null = null;
        try { remembered = localStorage.getItem(activeImport); } catch { /* Use cloud history. */ }
        const id = remembered || saved.packages[0]?.id;
        if (id) {
          const current = await request<WorkflowProgress>('?workflow=' + encodeURIComponent(id), undefined, signal);
          if (!signal.aborted && (remembered || current.status === 'in progress' || current.status === 'paused')) setProgress(current);
        }
      } catch (cause) {
        if (!signal.aborted) setHistoryError(issueText(cause));
      } finally {
        if (!signal.aborted) setBusy('');
      }
    }
    void restore();
    return () => { pause.current = true; controller.abort(); };
  }, []);

  async function reviewFile(next: File, sourceKey = '', overrides: DatasetSettings[] = []) {
    setError('');
    setBusy('Reading and validating the export…');
    try {
      const form = new FormData();
      form.set('file', next);
      form.set('source', sourceKey);
      form.set('settings', JSON.stringify(overrides));
      const result = await request<ReviewResponse>('', form);
      setReview(result);
      setSource(result.source);
      setChanged(false);
      if (result.existing) {
        setProgress(result.existing);
        setSavedImport(result.existing.id);
      }
    } catch (cause) {
      setError(issueText(cause));
    } finally {
      setBusy('');
    }
  }

  function chooseFile(next: File | undefined) {
    if (!next || busy) return;
    setProgress(null);
    setJob(null);
    setReview(null);
    setSettings([]);
    setSource('');
    setChanged(false);
    setError('');
    setFile(next);
    if (!/\.(csv|xlsx|json|zip)$/i.test(next.name) || !next.size || next.size > MAX_UPLOAD) {
      setError('Choose a CSV, XLSX, JSON or ZIP file up to 4 MB.');
      return;
    }
    void reviewFile(next);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  }

  function changeColumns(item: DatasetReview, patch: Omit<DatasetSettings, 'key'>) {
    setChanged(true);
    setSettings(current => [
      ...current.filter(entry => entry.key !== item.key),
      { ...current.find(entry => entry.key === item.key), ...patch, key: item.key },
    ]);
  }

  async function showImport(id: string) {
    setError('');
    setBusy('Loading saved import…');
    try {
      const current = await request<WorkflowProgress>('?workflow=' + encodeURIComponent(id));
      setProgress(current);
      setJob(null);
      setSavedImport(current.id);
    } catch (cause) {
      setError(issueText(cause));
    } finally {
      setBusy('');
    }
  }

  async function runImport(current?: WorkflowProgress) {
    const approval = review?.approval;
    if (!current && (!approval || changed)) return;
    pause.current = false;
    setError('');
    setJob(null);
    setBusy('Importing confirmed records…');
    try {
      if (!current && approval) {
        setSavedImport(approval.plan.id);
        current = await request<WorkflowProgress>('', { action: 'start', ...approval });
        setProgress(current);
      }
      while (current && !pause.current && (current.status === 'in progress' || current.status === 'paused')) {
        const next = await request<WorkflowProgress>('', { action: 'step', id: current.id });
        if (JSON.stringify(next) === JSON.stringify(current)) throw new Error('Import progress paused. Resume to retry the current batch.');
        current = next;
        setProgress(current);
      }
    } catch (cause) {
      setError(issueText(cause));
    } finally {
      await refreshHistory();
      setBusy('');
    }
  }

  async function showJob(id: string) {
    setError('');
    setBusy('Loading saved job…');
    try {
      setJob(await request<ImportJob>('?job=' + encodeURIComponent(id)));
      setProgress(null);
    } catch (cause) {
      setError(issueText(cause));
    } finally {
      setBusy('');
    }
  }

  async function resumeJob(current: ImportJob) {
    pause.current = false;
    setBusy('Importing saved records…');
    setError('');
    try {
      if (current.status === 'cancelled') {
        current = await request<ImportJob>('', { action: 'resume', job: current.id });
        setJob(current);
      }
      while (!pause.current && (current.status === 'ready' || current.status === 'processing')) {
        current = await request<ImportJob>('', { action: 'apply', job: current.id });
        setJob(current);
      }
      setJob(await request<ImportJob>('?job=' + encodeURIComponent(current.id)));
    } catch (cause) {
      setError(issueText(cause));
    } finally {
      await refreshHistory();
      setBusy('');
    }
  }

  const step = progress || job ? 2 : review ? 1 : 0;
  const totals = review?.datasets.reduce((sum, { counts }) => ({
    ready: sum.ready + counts.new + counts.updated,
    skipped: sum.skipped + counts.skipped,
    invalid: sum.invalid + counts.invalid,
  }), { ready: 0, skipped: 0, invalid: 0 });
  const reviewIssues = review?.datasets.flatMap(item => item.issues.map(issue => ({ ...issue, dataset: item.name }))) ?? [];
  const importIssues = progress?.datasets.flatMap(item => item.job?.issues.map(issue => ({ ...issue, dataset: item.name })) ?? []) ?? [];
  const brokenDatasets = review?.datasets.filter(item => item.error) ?? [];

  return (
    <div className="gr-import">
      <header className="gr-import-heading">
        <div>
          <p className="gr-import-eyebrow">Data Management</p>
          <h1>Import <span>Data</span></h1>
          <p>Bring products and related records into the Golden Rose catalogue.</p>
        </div>
        <span className="gr-import-heading-mark"><Package aria-hidden="true" size={25} /></span>
      </header>

      <ol className="gr-import-steps" aria-label="Import steps">
        {stepNames.map((name, index) => <li key={name}
          className={'gr-import-step' + (step === index ? ' is-active' : step > index ? ' is-complete' : '')}
          aria-current={step === index ? 'step' : undefined}>
          <span className="gr-import-step-number">{step > index ? <Check aria-hidden="true" size={16} /> : index + 1}</span>
          <span className="gr-import-step-copy"><strong>{name}</strong></span>
        </li>)}
      </ol>

      <section className="owner-panel gr-import-panel gr-import-flow-panel" aria-labelledby="gr-import-upload">
        <h2 id="gr-import-upload">Upload file</h2>
        <div className={'gr-import-dropzone' + (dragging ? ' is-dragging' : '') + (file ? ' has-file' : '')}
          onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)} onDrop={drop}>
          <input ref={input} className="gr-import-file-input" type="file" accept=".csv,.xlsx,.json,.zip"
            aria-label="Upload import file" tabIndex={-1} disabled={Boolean(busy)} onChange={event => {
              chooseFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }} />
          <span className="gr-import-drop-icon"><FileSpreadsheet aria-hidden="true" size={24} /></span>
          <strong>{file?.name ?? 'Drop your export here'}</strong>
          <p>CSV, XLSX, JSON or ZIP · Up to 4 MB</p>
          <button type="button" className="gr-import-secondary" disabled={Boolean(busy)} onClick={() => input.current?.click()}>
            <Upload aria-hidden="true" size={16} />{file ? 'Choose another file' : 'Choose file'}
          </button>
        </div>
      </section>

      {busy && <p className="gr-import-working" role="status"><RefreshCw aria-hidden="true" className="gr-import-spin" size={17} />{busy}</p>}
      {error && <div className="gr-import-error" role="alert"><AlertCircle aria-hidden="true" size={18} /><p>{error}</p></div>}

      {review && !progress && totals && <section className="owner-panel gr-import-panel gr-import-flow-panel" aria-labelledby="gr-import-review">
        <h2 id="gr-import-review">Review products</h2>
        <p>{review.datasets.length} {review.datasets.length === 1 ? 'dataset' : 'datasets'} detected. Variants use Nigerian naira.</p>
        <dl className="gr-import-counts">
          <div><dt>Validated</dt><dd>{totals.ready}</dd></div>
          <div><dt>Skipped</dt><dd>{totals.skipped}</dd></div>
          <div><dt>Errors</dt><dd>{totals.invalid}</dd></div>
        </dl>
        <ul className="gr-import-progress-list" aria-label="Dataset review">
          {review.datasets.map(item => <li key={item.key}>
            <strong>{item.kind ? importLabels[item.kind] : item.name}</strong>
            <span>{item.error ? 'Needs review' :
              `${item.counts.new + item.counts.updated} validated · ${item.counts.skipped} skipped · ${item.counts.invalid} errors`}</span>
          </li>)}
        </ul>
        {brokenDatasets.map(item => <p key={item.key} className="gr-import-field-error">
          {item.name} · {item.error}
        </p>)}
        {reviewIssues.find(issue => issue.status === 'invalid') && <p className="gr-import-meta">
          {reviewIssues.find(issue => issue.status === 'invalid')?.message}
        </p>}
        {review.images > 0 && <p className="gr-import-meta">The ZIP contains {review.images} images. Product photos can be attached separately.</p>}
        <details className="gr-import-advanced" open={brokenDatasets.length ? true : undefined}>
          <summary>Advanced Options</summary>
          <label>Source key
            <input value={source} onChange={event => { setSource(event.target.value); setChanged(true); }} maxLength={64} />
            <small>Reuse the same key for exports from the same system.</small>
          </label>
          {review.datasets.map(item => {
            const override = settings.find(entry => entry.key === item.key);
            const mapping = override?.mapping ?? item.mapping;
            const kind = override?.kind ?? item.kind;
            return <details className="gr-import-dataset" key={item.key}>
              <summary>{kind ? importLabels[kind] : 'Record type needed'} · {item.name}</summary>
              <p>{item.counts.new} new · {item.counts.updated} updates · {item.counts.skipped} skipped · {item.counts.invalid} errors</p>
              {item.headers.length > 0 && <>
                {!item.generated && <label>Record type
                  <select value={kind ?? ''} onChange={event => {
                    const chosen = event.target.value as ImportKind;
                    changeColumns(item, { kind: chosen, mapping: guessMapping(item.headers, chosen, 'odoo') });
                  }}>
                    <option value="" disabled>Choose a record type</option>
                    {supportedKinds.map(option => <option key={option} value={option}>{importLabels[option]}</option>)}
                  </select>
                </label>}
                {kind && <div className="gr-import-mapping-grid">
                  {fieldNames(kind).map(field => <label key={field}>{fields[field][0]}
                    <select value={mapping[field] ?? ''} onChange={event => {
                      const next = { ...mapping };
                      if (event.target.value === '') delete next[field as Field];
                      else next[field] = Number(event.target.value);
                      changeColumns(item, { mapping: next });
                    }}>
                      <option value="">Unmapped</option>
                      {item.headers.map((header, index) => <option key={header} value={index}>{header}</option>)}
                    </select>
                  </label>)}
                </div>}
              </>}
              {item.rows.length > 0 && <ul className="gr-import-preview-rows">
                {item.rows.map(row => <li key={row.row}>{row.name || 'Row ' + row.row} · {row.message}</li>)}
              </ul>}
            </details>;
          })}
        </details>
        <div className="gr-import-actions">
          {reviewIssues.length > 0 && <button type="button" className="gr-import-secondary" onClick={() => downloadIssues(reviewIssues)}>
            <Download aria-hidden="true" size={16} /> Download review report
          </button>}
          {changed && file && <button type="button" className="gr-import-secondary" disabled={Boolean(busy)} onClick={() => void reviewFile(file, source, settings)}>Review changes</button>}
          {review.approval && !changed && <button type="button" className="gr-import-button" disabled={Boolean(busy)} onClick={() => void runImport()}>Import reviewed records</button>}
        </div>
      </section>}

      {progress && <section className="owner-panel gr-import-panel gr-import-flow-panel" aria-labelledby="gr-import-progress">
        <h2 id="gr-import-progress">Import</h2>
        <p>{progress.filename} · {progress.status === 'failed' ? 'One or more datasets failed. Remaining datasets have been held.' :
          progress.status === 'complete' ? 'Import complete.' : 'Progress is saved. You can return here to continue.'}</p>
        <ul className="gr-import-progress-list">
          {progress.datasets.map(item => <li key={item.key}>
            <strong>{importLabels[item.kind]}</strong>
            {item.job ? <><JobBadge job={item.job} /><JobCounts job={item.job} /></> : <span>Waiting · {item.expected} reviewed rows</span>}
          </li>)}
        </ul>
        <div className="gr-import-actions">
          {(progress.status === 'in progress' || progress.status === 'paused') && (busy ?
            <button type="button" className="gr-import-secondary" onClick={() => { pause.current = true; }}>Pause after current batch</button> :
            <button type="button" className="gr-import-button" onClick={() => void runImport(progress)}>Resume import</button>)}
          {importIssues.length > 0 && <button type="button" className="gr-import-secondary" onClick={() => downloadIssues(importIssues)}>Download import report</button>}
        </div>
      </section>}

      <section className="owner-panel gr-import-panel gr-import-flow-panel" aria-labelledby="gr-import-history">
        <div className="gr-import-history-top">
          <h2 id="gr-import-history"><History aria-hidden="true" size={19} /> Import history</h2>
          <button type="button" className="gr-import-secondary" disabled={Boolean(busy)} onClick={() => void refreshHistory()}>Refresh</button>
        </div>
        {historyError && <p role="alert">{historyError}</p>}
        {history?.packageError && <p role="alert">{history.packageError}</p>}
        {job && <div className="gr-import-job">
          <div className="gr-import-job-header"><strong>{job.filename}</strong><JobBadge job={job} /></div>
          <JobCounts job={job} />
          {job.status === 'uploading' && <p>Choose the same export and source key to finish staging this job.</p>}
          <div className="gr-import-actions">
            {['ready', 'processing', 'cancelled'].includes(job.status) && <button type="button" className="gr-import-button"
              disabled={Boolean(busy)} onClick={() => void resumeJob(job)}>Resume dataset</button>}
            {job.issues.length > 0 && <button type="button" className="gr-import-secondary" onClick={() => downloadIssues(job.issues)}>Download job report</button>}
          </div>
        </div>}
        {history && !history.jobs.length && !history.packages.length && !history.packageError && <p>No import jobs yet</p>}
        {history && (history.jobs.length > 0 || history.packages.length > 0) && <ul className="gr-import-jobs">
          {history.packages.map(item => <li key={item.id}>
            <div><strong className="gr-import-history-file">{item.filename}</strong><small>Package · {item.source}</small></div>
            <button type="button" className="gr-import-secondary" disabled={Boolean(busy)} onClick={() => void showImport(item.id)}>View import</button>
          </li>)}
          {history.jobs.map(item => <li key={item.id}>
            <div><strong className="gr-import-history-file">{item.filename}</strong><small>{importLabels[item.kind]} · {item.source}</small></div>
            <JobBadge job={item} />
            <button type="button" className="gr-import-secondary" disabled={Boolean(busy)} onClick={() => void showJob(item.id)}>View dataset</button>
          </li>)}
        </ul>}
      </section>
    </div>
  );
}
