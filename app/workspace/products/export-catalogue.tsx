import { Download } from 'lucide-react';
import type { CataloguePublication } from '@/src/lib/golden-rose/catalogue-management';

export function ExportCatalogue({ q, publication }: { q: string; publication: CataloguePublication }) {
  const url = (format: 'csv' | 'json') =>
    '/workspace/products/export?' + new URLSearchParams({ q, publication, format }).toString();

  return (
    <div className="grid min-w-0 gap-1 sm:justify-items-end">
      <div className="flex flex-wrap gap-2">
        <a className="catalogue-btn catalogue-btn--ghost" href={url('csv')}>
          <Download size={16} aria-hidden="true" />
          Export catalogue (CSV)
        </a>
        <a className="catalogue-btn catalogue-btn--ghost" href={url('json')}>Export JSON</a>
      </div>
      <span className="text-xs text-[#796570]">Import SKU and barcode columns as text in spreadsheets.</span>
    </div>
  );
}
