
'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import Link from 'next/link';

import {
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Keyboard,
  ScanBarcode,
  Trash2,
  XCircle,
} from 'lucide-react';

interface ScanRecord {
  id: number;
  value: string;
  at: string;
}

export function BarcodeScannerTest() {
  const [value, setValue] = useState('');
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scanId = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function focusScanner() {
    inputRef.current?.focus();
  }

  function recordScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const barcode = value.trim();

    if (!barcode || barcode.length > 128) {
      setError('Scan a barcode containing 1–128 characters.');
      focusScanner();
      return;
    }

    if (/[\u0000-\u001f\u007f]/.test(barcode)) {
      setError('The scanner returned unsupported control characters.');
      focusScanner();
      return;
    }

    scanId.current += 1;

    const entry: ScanRecord = {
      id: scanId.current,
      value: barcode,
      at: new Date().toLocaleTimeString('en-NG'),
    };

    setRecords(previous => [entry, ...previous].slice(0, 20));
    setValue('');
    setError('');
    setCopied(false);

    focusScanner();
  }

  async function copyLast() {
    if (!records[0]) return;

    try {
      await navigator.clipboard.writeText(records[0].value);
      setCopied(true);
    } catch {
      setError('Clipboard access is unavailable. Copy the code manually.');
    }
  }

  return (
    <main className="grscanner">
      <header className="grscanner-header">
        <div>
          <Link href="/workspace/pos" className="grscanner-back">
            <ArrowLeft size={17} />
            Back to Point of Sale
          </Link>

          <p className="grscanner-eyebrow">
            REGISTER HARDWARE / DIAGNOSTICS
          </p>

          <h1>Barcode scanner test</h1>

          <p>
            Connect your scanner and verify that Golden Rose
            receives the barcode correctly.
          </p>
        </div>

        <span className="grscanner-badge">
          <ScanBarcode size={17} />
          Local hardware test
        </span>
      </header>

      <div className="grscanner-grid">
        <section className="grscanner-card">
          <div className="grscanner-card-title">
            <ScanBarcode size={20} />
            <h2>Scan a barcode</h2>
          </div>

          <p>
            Plug your USB scanner into the laptop. Configure
            it for keyboard/HID wedge mode and, preferably,
            an Enter-key suffix.
          </p>

          <form onSubmit={recordScan}>
            <label htmlFor="grscanner-input">
              Scanner input
            </label>

            <div className="grscanner-input-wrap">
              <Keyboard size={19} />

              <input
                ref={inputRef}
                id="grscanner-input"
                type="text"
                value={value}
                onChange={event => setValue(event.target.value)}
                placeholder="Focus here and scan a product barcode"
                autoComplete="off"
                spellCheck={false}
                maxLength={128}
              />
            </div>

            <div className="grscanner-actions">
              <button
                type="button"
                onClick={focusScanner}
                className="grscanner-secondary"
              >
                Focus scanner
              </button>

              <button type="submit" className="grscanner-primary">
                Record test scan
              </button>
            </div>
          </form>

          {error && (
            <p className="grscanner-error" role="alert">
              <XCircle size={17} />
              {error}
            </p>
          )}

          {records.length > 0 && (
            <div className="grscanner-success" role="status">
              <CheckCircle2 size={20} />
              <div>
                <strong>Barcode captured successfully</strong>
                <span>Last result: {records[0].value}</span>
              </div>
            </div>
          )}

          <div className="grscanner-info">
            <strong>How the test works</strong>
            <p>
              A keyboard-wedge scanner types characters into
              the focused input, just like a keyboard. If it
              sends Enter after scanning, the test records the
              result automatically.
            </p>
          </div>
        </section>

        <section className="grscanner-card">
          <div className="grscanner-card-title grscanner-space-between">
            <div className="grscanner-inline">
              <ScanBarcode size={20} />
              <h2>Captured scans</h2>
            </div>

            <span className="grscanner-count">
              {records.length}
            </span>
          </div>

          {!records.length ? (
            <div className="grscanner-empty">
              <ScanBarcode size={38} />
              <h3>No scans recorded yet</h3>
              <p>
                Your scanned barcode values will appear here.
                No product or inventory records are changed.
              </p>
            </div>
          ) : (
            <>
              <div className="grscanner-results">
                {records.map((record, index) => (
                  <div className="grscanner-result" key={record.id}>
                    <div>
                      <span>
                        {index === 0 ? 'Latest scan' : 'Scan'}
                      </span>
                      <strong>{record.value}</strong>
                      <small>{record.at}</small>
                    </div>

                    {index === 0 && (
                      <CheckCircle2 size={19} />
                    )}
                  </div>
                ))}
              </div>

              <div className="grscanner-actions">
                <button
                  type="button"
                  className="grscanner-secondary"
                  onClick={copyLast}
                >
                  <Clipboard size={16} />
                  {copied ? 'Copied' : 'Copy latest'}
                </button>

                <button
                  type="button"
                  className="grscanner-secondary"
                  onClick={() => {
                    setRecords([]);
                    setCopied(false);
                    focusScanner();
                  }}
                >
                  <Trash2 size={16} />
                  Clear results
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
