
'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';

const ENDPOINT =
  '/workspace/migration/odoo-sales/api';

const MAX_FILE_BYTES = 4_000_000;

const fieldOrder = [
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

type Field = (typeof fieldOrder)[number];

type Mapping = Partial<
  Record<Field, number>
>;

type Review = {
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

type Batch = {
  id: string;
  filename: string;
  rowCount: number;
  matched: number;
  unmatched: number;
  status: string;
  createdAt: string;
};

type History = {
  batches: Batch[];
};

type StagingResult = {
  ok: boolean;
  id: string;
  rowCount?: number;
  matched?: number;
  unmatched?: number;
  alreadyStaged?: boolean;
  postedToRevenue?: boolean;
  inventoryChanged?: boolean;
};

type Notice = {
  kind: 'success' | 'error' | 'info';
  message: string;
};

type UploadAction = 'review' | 'stage';

const primary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#54213a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6b304b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b68a51] disabled:cursor-not-allowed disabled:opacity-50';

const secondary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#dfd0c8] bg-white px-4 py-2.5 text-sm font-semibold text-[#54213a] transition hover:bg-[#fff7ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b68a51] disabled:cursor-not-allowed disabled:opacity-50';

const fieldClass =
  'min-h-11 w-full min-w-0 rounded-xl border border-[#dfd0c8] bg-white px-3 py-2 text-sm text-[#54213a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b68a51]';

async function request<T>(
  body?: FormData,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    body,
    signal,
  });

  const value: unknown = await response
    .json()
    .catch(() => null);

  if (!value || typeof value !== 'object') {
    throw new Error(
      'The server returned an invalid response.',
    );
  }

  const result = value as {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      result.error ??
        'The import request could not complete.',
    );
  }

  return value as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The request could not complete.';
}

function makeForm(
  file: File,
  action: UploadAction,
  mapping: Mapping | null,
  confirmNgn: boolean,
  sourceConfirmed: boolean,
  reviewedHash?: string,
): FormData {
  const form = new FormData();

  form.set('file', file);
  form.set('action', action);
  form.set('confirmNgn', String(confirmNgn));
  form.set(
    'sourceConfirmed',
    String(sourceConfirmed),
  );

  if (mapping !== null) {
    form.set(
      'mapping',
      JSON.stringify(mapping),
    );
  }

  if (reviewedHash) {
    form.set('expectedHash', reviewedHash);
  }

  return form;
}

function Banner({
  notice,
}: {
  notice: Notice;
}) {
  const ok = notice.kind === 'success';
  const neutral = notice.kind === 'info';

  return (
    <div
      role={ok || neutral ? 'status' : 'alert'}
      className={
        'flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 ' +
        (ok
          ? 'border-[#b8d8bf] bg-[#f1fff5] text-[#28643c]'
          : neutral
            ? 'border-[#e3d6c7] bg-[#fff8eb] text-[#72512f]'
            : 'border-[#e7c4cc] bg-[#fff3f4] text-[#92394f]')
      }
    >
      {ok ? (
        <CheckCircle2
          size={19}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
      ) : (
        <AlertCircle
          size={19}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
      )}

      <span>{notice.message}</span>
    </div>
  );
}

export function OdooHistoricalSalesImport() {
  const fileInput =
    useRef<HTMLInputElement>(null);

  const inFlight = useRef(false);

  const [file, setFile] =
    useState<File | null>(null);

  const [review, setReview] =
    useState<Review | null>(null);

  const [mapping, setMapping] =
    useState<Mapping | null>(null);

  const [confirmNgn, setConfirmNgn] =
    useState(false);

  const [sourceConfirmed, setSourceConfirmed] =
    useState(false);

  const [busy, setBusy] =
    useState<UploadAction | null>(null);

  const [history, setHistory] =
    useState<Batch[]>([]);

  const [historyLoading, setHistoryLoading] =
    useState(true);

  const [historyError, setHistoryError] =
    useState('');

  const [notice, setNotice] =
    useState<Notice | null>(null);

  // Initial loading updates state only after
  // the asynchronous request has completed.
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const result = await request<History>(
          undefined,
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        if (!Array.isArray(result.batches)) {
          throw new Error(
            'Invalid import history.',
          );
        }

        setHistory(result.batches);
        setHistoryError('');
      } catch (error) {
        if (!controller.signal.aborted) {
          setHistoryError(
            errorMessage(error),
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setHistoryLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, []);

  async function reloadHistory() {
    setHistoryLoading(true);

    try {
      const result = await request<History>();

      if (!Array.isArray(result.batches)) {
        throw new Error(
          'Invalid import history.',
        );
      }

      setHistory(result.batches);
      setHistoryError('');
    } catch (error) {
      setHistoryError(
        errorMessage(error),
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  function clearFile() {
    if (inFlight.current) {
      return;
    }

    setFile(null);
    setReview(null);
    setMapping(null);
    setConfirmNgn(false);
    setSourceConfirmed(false);
    setNotice(null);

    if (fileInput.current) {
      fileInput.current.value = '';
    }
  }

  function invalidateReview(message: string) {
    setReview((previous) =>
      previous
        ? {
            ...previous,
            ready: false,
            issues: [message],
            issueCount: 1,
          }
        : null,
    );

    setNotice({
      kind: 'info',
      message,
    });
  }

  function changeField(
    field: Field,
    rawValue: string,
  ) {
    if (!review) {
      return;
    }

    const next: Mapping = {
      ...(mapping ?? {}),
    };

    if (!rawValue) {
      delete next[field];
    } else {
      next[field] = Number(rawValue);
    }

    setMapping(next);

    invalidateReview(
      'Column mapping changed. Review the updated mapping before staging.',
    );
  }

  function changeCurrency(checked: boolean) {
    setConfirmNgn(checked);

    invalidateReview(
      'Currency confirmation changed. Review the file again.',
    );
  }

  async function reviewFile(
    event?: FormEvent<HTMLFormElement>,
  ) {
    event?.preventDefault();

    if (!file || inFlight.current) {
      return;
    }

    if (
      file.size === 0 ||
      file.size > MAX_FILE_BYTES
    ) {
      setNotice({
        kind: 'error',
        message:
          'Choose a non-empty file of up to 4 MB.',
      });
      return;
    }

    inFlight.current = true;
    setBusy('review');

    setReview((previous) =>
      previous
        ? { ...previous, ready: false }
        : null,
    );

    setNotice(null);

    try {
      const result = await request<Review>(
        makeForm(
          file,
          'review',
          mapping,
          confirmNgn,
          false,
        ),
      );

      if (
        !Array.isArray(result.headers) ||
        !Array.isArray(result.issues) ||
        !Array.isArray(result.preview) ||
        typeof result.fileHash !== 'string' ||
        typeof result.ready !== 'boolean'
      ) {
        throw new Error(
          'The review service returned incomplete information.',
        );
      }

      setReview(result);
      setMapping(result.mapping);

      setNotice(
        result.ready
          ? {
              kind: 'success',
              message:
                `${result.rowCount} sale line(s) validated. ` +
                'No database records were created.',
            }
          : {
              kind: 'info',
              message:
                `Review the column mapping and ${result.issueCount} issue(s). ` +
                'Nothing has been staged.',
            },
      );
    } catch (error) {
      setReview((previous) =>
        previous
          ? { ...previous, ready: false }
          : null,
      );

      setNotice({
        kind: 'error',
        message: errorMessage(error),
      });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function stageFile() {
    if (
      !file ||
      !review?.ready ||
      !mapping ||
      !sourceConfirmed ||
      inFlight.current
    ) {
      return;
    }

    inFlight.current = true;
    setBusy('stage');
    setNotice(null);

    try {
      const result = await request<StagingResult>(
        makeForm(
          file,
          'stage',
          mapping,
          confirmNgn,
          sourceConfirmed,
          review.fileHash,
        ),
      );

      if (
        result.ok !== true ||
        typeof result.id !== 'string'
      ) {
        throw new Error(
          'The database did not confirm the staging operation.',
        );
      }

      if (
        result.inventoryChanged === true ||
        result.postedToRevenue === true
      ) {
        throw new Error(
          'Unexpected financial posting result. Contact the system administrator.',
        );
      }

      setNotice({
        kind: 'success',
        message: result.alreadyStaged
          ? 'This exact file has already been staged. No duplicate batch was created.'
          : `${result.rowCount ?? 0} historical lines staged. ` +
            `${result.matched ?? 0} matched SKUs; ` +
            `${result.unmatched ?? 0} require reconciliation. ` +
            'No live revenue, payment or inventory was posted.',
      });

      setFile(null);
      setReview(null);
      setMapping(null);
      setConfirmNgn(false);
      setSourceConfirmed(false);

      if (fileInput.current) {
        fileInput.current.value = '';
      }

      await reloadHistory();
    } catch (error) {
      setNotice({
        kind: 'error',
        message: errorMessage(error),
      });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const readyToStage = Boolean(
    review?.ready &&
      mapping &&
      file &&
      sourceConfirmed &&
      !busy,
  );

  const needsCurrencyConfirmation =
    review !== null &&
    mapping?.currency === undefined;

  return (
    <div className="grid min-w-0 gap-6">
      <section className="grid gap-4 rounded-2xl border border-[#e9dad1] bg-white p-5">
        <div className="flex items-start gap-3">
          <Upload
            size={24}
            className="mt-1 shrink-0 text-[#a17741]"
            aria-hidden="true"
          />

          <div className="min-w-0">
            <h2 className="font-serif text-2xl text-[#54213a]">
              Review Odoo historical sales
            </h2>

            <p className="mt-1 text-sm leading-6 text-[#806b77]">
              Import CSV, XLSX, JSON or ZIP
              containing one data export. Column
              order does not matter. Fields are
              detected by their Odoo headings,
              and you can correct any mapping
              before staging.
            </p>
          </div>
        </div>

        <form
          onSubmit={reviewFile}
          className="grid gap-4"
        >
          <label className="grid gap-2 text-sm font-semibold text-[#54213a]">
            Historical sales file (maximum 4 MB)

            <input
              ref={fileInput}
              type="file"
              name="file"
              required
              accept=".csv,.xlsx,.json,.zip"
              disabled={busy !== null}
              onChange={(event) => {
                setFile(
                  event.target.files?.[0] ?? null,
                );
                setReview(null);
                setMapping(null);
                setConfirmNgn(false);
                setSourceConfirmed(false);
                setNotice(null);
              }}
              className="min-h-12 w-full rounded-xl border border-[#e2d3ca] bg-[#fffaf6] p-3 text-sm text-[#54213a] file:mr-4 file:rounded-lg file:border-0 file:bg-[#54213a] file:px-4 file:py-2 file:text-white"
            />
          </label>

          {file && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#faf4ee] px-4 py-3 text-sm text-[#715765]">
              <span className="min-w-0 break-all">
                {file.name} (
                {(file.size / 1024).toFixed(1)} KB)
              </span>

              <button
                type="button"
                onClick={clearFile}
                disabled={busy !== null}
                className={secondary}
              >
                <X
                  size={16}
                  aria-hidden="true"
                />
                Clear selection
              </button>
            </div>
          )}

          <p className="text-xs leading-5 text-[#806b77]">
            Legacy XLS must be converted to CSV
            or XLSX. Each staging file may contain
            up to 1,000 sale lines; large exports
            can be split into non-overlapping
            batches. Reviewing makes no database
            changes.
          </p>

          <button
            type="submit"
            disabled={!file || busy !== null}
            aria-busy={busy === 'review'}
            className={primary + ' w-fit'}
          >
            {busy === 'review' ? (
              <LoaderCircle
                size={17}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <SearchCheck
                size={17}
                aria-hidden="true"
              />
            )}

            {busy === 'review'
              ? 'Reviewing file…'
              : 'Review file — no database changes'}
          </button>
        </form>

        {notice && (
          <Banner notice={notice} />
        )}
      </section>

      {review && (
        <section className="grid gap-5 rounded-2xl border border-[#e9dad1] bg-white p-5">
          <div>
            <h2 className="font-serif text-2xl text-[#54213a]">
              Match Odoo columns
            </h2>

            <p className="mt-1 text-sm leading-6 text-[#806b77]">
              {review.rowCount} source line(s).
              Match each Golden Rose field to
              the correct Odoo column. Required
              fields are marked with an asterisk.
              A sale-line ID must identify a
              unique line, not just its order.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {fieldOrder.map((field) => (
              <label
                key={field}
                className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#54213a]"
              >
                <span>
                  {review.fields[field]}
                  {review.requiredFields.includes(
                    field,
                  )
                    ? ' *'
                    : ''}
                </span>

                <select
                  value={mapping?.[field] ?? ''}
                  onChange={(event) =>
                    changeField(
                      field,
                      event.target.value,
                    )
                  }
                  disabled={busy !== null}
                  className={fieldClass}
                >
                  <option value="">
                    Not mapped
                  </option>

                  {review.headers.map(
                    (header, index) => (
                      <option
                        key={`${index}:${header}`}
                        value={index}
                      >
                        {header} (column {index + 1})
                      </option>
                    ),
                  )}
                </select>
              </label>
            ))}
          </div>

          {needsCurrencyConfirmation && (
            <label className="flex items-start gap-3 rounded-xl border border-[#e9dac7] bg-[#fff8ed] p-4 text-sm leading-6 text-[#54213a]">
              <input
                type="checkbox"
                checked={confirmNgn}
                onChange={(event) =>
                  changeCurrency(
                    event.target.checked,
                  )
                }
                disabled={busy !== null}
                className="mt-1 shrink-0"
              />

              <span>
                I have checked the source export
                and confirm all monetary values
                are Nigerian naira (NGN). The
                application must not assume an
                exchange rate or silently convert
                another currency.
              </span>
            </label>
          )}

          {review.issueCount > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-[#e5c0cc] bg-[#fff3f5] p-4 text-sm leading-6 text-[#92394f]"
            >
              <strong>
                {review.issueCount} issue(s)
                require attention
              </strong>

              <ul className="mt-2 list-inside list-disc space-y-1">
                {review.issues.map(
                  (issue, index) => (
                    <li
                      key={`${index}:${issue}`}
                    >
                      {issue}
                    </li>
                  ),
                )}
              </ul>

              {review.issueCount >
                review.issues.length && (
                <p className="mt-2">
                  Only the first{' '}
                  {review.issues.length} issues
                  are displayed.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3">
            <h3 className="font-serif text-xl text-[#54213a]">
              Source preview (first five lines)
            </h3>

            <p className="text-xs text-[#806b77]">
              Preview values come from the selected
              file. Nothing is posted to inventory
              or revenue.
            </p>

            <div className="max-w-full overflow-x-auto rounded-xl border border-[#e9ddd5]">
              <table className="min-w-max border-collapse text-left text-xs">
                <thead className="bg-[#faf4ee] text-[#67485a]">
                  <tr>
                    <th className="border-b border-[#e9ddd5] px-3 py-3">
                      Row
                    </th>

                    {review.headers.map(
                      (header, i) => (
                        <th
                          key={`${header}:${i}`}
                          className="border-b border-[#e9ddd5] px-3 py-3 font-semibold"
                        >
                          {header}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>

                <tbody>
                  {review.preview.map(
                    (row, index) => (
                      <tr
                        key={index}
                        className="border-b border-[#f1e7e0] text-[#735868]"
                      >
                        <td className="px-3 py-3">
                          {index + 2}
                        </td>

                        {review.headers.map(
                          (header, column) => (
                            <td
                              key={`${header}:${column}`}
                              className="max-w-60 truncate px-3 py-3"
                              title={
                                row[column] ?? ''
                              }
                            >
                              {row[column] ?? ''}
                            </td>
                          ),
                        )}
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-[#eee2db] pt-4">
            <button
              type="button"
              onClick={() =>
                void reviewFile()
              }
              disabled={busy !== null}
              className={secondary}
            >
              {busy === 'review' ? (
                <LoaderCircle
                  size={17}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <RefreshCw
                  size={17}
                  aria-hidden="true"
                />
              )}

              Review current mapping
            </button>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-[#e9dac7] bg-[#fff8ed] p-4 text-sm leading-6 text-[#54213a]">
            <input
              type="checkbox"
              checked={sourceConfirmed}
              onChange={(event) =>
                setSourceConfirmed(
                  event.target.checked,
                )
              }
              disabled={
                busy !== null ||
                !review.ready
              }
              className="mt-1 shrink-0"
            />

            <span>
              <strong>
                I confirm this file contains
                genuine Odoo business records.
              </strong>{' '}
              I understand staging stores source
              information for reconciliation only;
              it does not verify payment, increase
              stock or add POS revenue.
            </span>
          </label>

          <button
            type="button"
            disabled={!readyToStage}
            onClick={() =>
              void stageFile()
            }
            aria-busy={busy === 'stage'}
            className={primary + ' w-fit'}
          >
            {busy === 'stage' ? (
              <LoaderCircle
                size={17}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <ShieldCheck
                size={17}
                aria-hidden="true"
              />
            )}

            {busy === 'stage'
              ? 'Staging historical records…'
              : 'Approve and stage historical lines'}
          </button>
        </section>
      )}

      <section className="grid gap-4 rounded-2xl border border-[#e9dad1] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl text-[#54213a]">
              Staged import history
            </h2>

            <p className="mt-1 text-sm text-[#806b77]">
              Staged records are not posted
              to financial reports.
            </p>
          </div>

          <button
            type="button"
            disabled={
              historyLoading ||
              busy !== null
            }
            onClick={() =>
              void reloadHistory()
            }
            className={secondary}
          >
            <RefreshCw
              size={17}
              className={
                historyLoading
                  ? 'animate-spin'
                  : ''
              }
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>

        {historyError && (
          <p
            role="alert"
            className="text-sm text-[#92394f]"
          >
            {historyError}
          </p>
        )}

        {historyLoading && (
          <p
            role="status"
            className="text-sm text-[#806b77]"
          >
            Loading import history…
          </p>
        )}

        {!historyLoading &&
          history.length === 0 &&
          !historyError && (
            <p className="rounded-xl bg-[#faf4ee] p-4 text-sm text-[#806b77]">
              No historical sales have
              been staged.
            </p>
          )}

        {history.length > 0 && (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="text-[#806b77]">
                <tr className="border-b border-[#e9dad1]">
                  <th className="py-3 pr-3">
                    File / uploaded at
                  </th>
                  <th className="py-3 text-right">
                    Lines
                  </th>
                  <th className="py-3 text-right">
                    Matched
                  </th>
                  <th className="py-3 text-right">
                    Unmatched
                  </th>
                  <th className="py-3 text-right">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {history.map((batch) => (
                  <tr
                    key={batch.id}
                    className="border-b border-[#f1e8e2]"
                  >
                    <td className="py-3 pr-3">
                      <p className="break-all font-semibold text-[#54213a]">
                        {batch.filename}
                      </p>

                      <p className="mt-1 text-xs text-[#806b77]">
                        {new Date(
                          batch.createdAt,
                        ).toLocaleString('en-NG')}
                      </p>
                    </td>

                    <td className="py-3 text-right tabular-nums">
                      {batch.rowCount}
                    </td>

                    <td className="py-3 text-right tabular-nums">
                      {batch.matched}
                    </td>

                    <td className="py-3 text-right tabular-nums">
                      {batch.unmatched}
                    </td>

                    <td className="py-3 text-right capitalize text-[#846034]">
                      {batch.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-[#eadfd7] bg-[#fffdfa] p-4 text-xs leading-6 text-[#806b77]">
        <FileSpreadsheet
          size={18}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />

        <p>
          Keep the original Odoo export
          unchanged for reconciliation. The
          imported sale-line ID and source
          currency must be traceable to
          Odoo. Missing historical cost and
          unpaid order status are never
          converted into verified business
          profit or payment.
        </p>
      </div>
    </div>
  );
}
