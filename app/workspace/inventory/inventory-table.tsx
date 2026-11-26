
'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  PackageSearch,
  Search,
} from 'lucide-react';

import type {
  StockBalance,
} from '@/src/lib/golden-rose/contracts';
import { showStockQuantity, stockLabels, stockState, type StockState } from '@/src/lib/golden-rose/stock-evidence';

import {
  workspaceInput,
  workspaceSecondary,
} from '@/src/components/workspace/page-layout';

type StockFilter = 'all' | 'low' | StockState;

const stateLabels: Record<StockFilter, string> = {
  all: 'All stock',
  ...stockLabels,
  low: 'Low stock',
};

export function InventoryTable({
  items,
  offset,
  pageSize,
  hasNext,
}: {
  items: StockBalance[];
  offset: number;
  pageSize: number;
  hasNext: boolean;
}) {
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('all');
  const [filter, setFilter] = useState<StockFilter>('all');

  const locations = useMemo(() => {
    const unique = new Map<string, string>();

    for (const item of items) {
      unique.set(item.locationId, item.locationName);
    }

    return [...unique].sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [items]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return items.filter(item => {
      if (
        location !== 'all' &&
        item.locationId !== location
      ) {
        return false;
      }

      if (
        filter !== 'all' &&
        (filter === 'low' ? item.available <= 0 || item.available > 5 : stockState(item) !== filter)
      ) {
        return false;
      }

      if (!needle) return true;

      return [
        item.name,
        item.sku ?? '',
        item.locationName,
        item.sizeMl?.toString() ?? '',
      ].some(value =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [items, search, location, filter]);

  const previousOffset = Math.max(0, offset - pageSize);
  const nextOffset = offset + pageSize;

  return (
    <section
      aria-label="Inventory balances"
      className="grid min-w-0"
    >
      <div className="grid gap-3 border-b border-gr-border p-4 lg:grid-cols-[minmax(0,1fr)_12rem_11rem]">
        <label className="relative min-w-0">
          <span className="sr-only">
            Filter stock by product or SKU
          </span>

          <Search
            size={17}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3.5 text-gr-gold"
          />

          <input
            className={workspaceInput + ' pl-10'}
            type="search"
            value={search}
            onChange={event =>
              setSearch(event.target.value)
            }
            placeholder="Search this page by fragrance or SKU"
          />
        </label>

        <label className="min-w-0">
          <span className="sr-only">
            Filter by location
          </span>

          <select
            className={workspaceInput}
            value={location}
            onChange={event =>
              setLocation(event.target.value)
            }
          >
            <option value="all">
              All locations on page
            </option>

            {locations.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="relative min-w-0">
          <span className="sr-only">
            Filter by availability
          </span>

          <Filter
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3.5 text-gr-gold"
          />

          <select
            className={workspaceInput + ' pl-9'}
            value={filter}
            onChange={event =>
              setFilter(event.target.value as StockFilter)
            }
          >
            {Object.entries(stateLabels).map(
              ([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="grid justify-items-center gap-3 px-5 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-gr-surface-alt text-gr-gold">
            <PackageSearch
              size={25}
              aria-hidden="true"
            />
          </span>

          <h3 className="font-serif text-xl text-gr-text">
            No matching stock records
          </h3>

          <p className="max-w-md text-sm leading-6 text-gr-muted">
            {items.length === 0
              ? 'No inventory rows are available on this page.'
              : 'Try another filter or search term. Only the currently loaded page is being searched.'}
          </p>

          {(search || filter !== 'all' ||
            location !== 'all') && (
            <button
              type="button"
              className={workspaceSecondary}
              onClick={() => {
                setSearch('');
                setLocation('all');
                setFilter('all');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div
          className="w-full overflow-x-auto"
          role="region"
          aria-label="Stock table"
          tabIndex={0}
        >
          <table className="w-full min-w-[740px] border-collapse text-left">
            <thead>
              <tr className="bg-gr-surface-alt text-[11px] font-bold uppercase tracking-wider text-gr-muted">
                <th scope="col" className="px-5 py-4">
                  Fragrance
                </th>
                <th scope="col" className="px-4 py-4">
                  Location
                </th>
                <th scope="col" className="px-4 py-4 text-right">
                  On hand
                </th>
                <th scope="col" className="px-4 py-4 text-right">
                  Reserved
                </th>
                <th scope="col" className="px-4 py-4 text-right">
                  Available
                </th>
                <th scope="col" className="px-5 py-4">
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gr-border">
              {filtered.map(item => {
                const status = stockState(item);
                const low = status === 'available' && item.available <= 5;
                const quantity = (value: number) => showStockQuantity(item) ? value.toLocaleString('en-NG') : '—';

                return (
                  <tr
                    key={
                      item.variantId +
                      ':' +
                      item.locationId
                    }
                    className="bg-gr-surface transition-colors hover:bg-gr-surface-alt"
                  >
                    <td className="px-5 py-4">
                      <div className="grid gap-1">
                        <strong className="text-sm font-semibold text-gr-text">
                          {item.name}
                        </strong>

                        <span className="text-xs text-gr-muted">
                          {[
                            item.sku,
                            item.sizeMl
                              ? `${item.sizeMl} ml`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Variant'}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-sm text-gr-muted">
                      {item.locationName}
                    </td>

                    <td className="px-4 py-4 text-right text-sm tabular-nums text-gr-muted">
                      {quantity(item.onHand)}
                    </td>

                    <td className="px-4 py-4 text-right text-sm tabular-nums text-gr-muted">
                      {quantity(item.reserved)}
                    </td>

                    <td className="px-4 py-4 text-right text-sm font-bold tabular-nums text-gr-text">
                      {quantity(item.available)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={
                          'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ' +
                          (status === 'available' && !low
                            ? 'bg-gr-success-bg text-gr-success'
                            : low || status === 'unverified-zero' || status === 'not-counted'
                              ? 'bg-gr-surface-alt text-gr-gold'
                              : 'bg-gr-surface-alt text-gr-text')
                        }
                      >
                        {low ? 'Available · low stock' : stockLabels[status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gr-border bg-gr-surface px-5 py-4">
        <p className="text-xs text-gr-muted">
          Showing {filtered.length} of {items.length}{' '}
          records on this page.
          {' '}
          {items.length > 0 &&
            `Loaded records ${offset + 1}–${offset + items.length}.`}
        </p>

        <nav
          aria-label="Inventory pagination"
          className="flex items-center gap-2"
        >
          {offset > 0 && (
            <Link
              href={
                `/workspace/inventory?offset=${previousOffset}` +
                '#inventory-balances'
              }
              className={workspaceSecondary}
            >
              <ChevronLeft size={16} />
              Previous
            </Link>
          )}

          {hasNext && (
            <Link
              href={
                `/workspace/inventory?offset=${nextOffset}` +
                '#inventory-balances'
              }
              className={workspaceSecondary}
            >
              Next
              <ChevronRight size={16} />
            </Link>
          )}
        </nav>
      </footer>
    </section>
  );
}
