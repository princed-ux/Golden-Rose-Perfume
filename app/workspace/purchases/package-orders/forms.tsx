
'use client';

import {
  useActionState,
  useEffect,
  useState,
} from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Plus,
  Trash2,
} from 'lucide-react';

import {
  approvePackagedOrder,
  createPackagedOrder,
  receivePackagedLine,
  type PurchaseFeedback,
} from './actions';

export type PackageOption = {
  id: string;
  unitName: string;
  unitsPerPackage: number;
  active: boolean;
};

export type ProductOption = {
  id: string;
  sku: string;
  name: string;
  sizeMl: number | null;
  packages: PackageOption[];
};

type Choice = {
  id: string;
  name: string;
  active?: boolean;
};

type PurchaseRow = {
  key: number;
  sku: string;
  packageId: string;
  quantity: string;
  unitCost: string;
};

const idle: PurchaseFeedback = {
  status: 'idle',
  message: '',
};

const input =
  'min-h-11 w-full min-w-0 rounded-xl border border-[#dfd0c8] bg-white px-3 py-2.5 text-sm text-[#432338] focus-visible:outline-2 focus-visible:outline-[#b68a51]';

const primary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#54213a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#42182d] disabled:cursor-not-allowed disabled:opacity-60';

const secondary =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#dfd0c8] bg-white px-4 py-2 text-sm font-semibold text-[#54213a] hover:bg-[#fff6ed] disabled:opacity-50';

const label =
  'grid min-w-0 gap-1.5 text-sm font-semibold text-[#543446]';

const money = (value: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(value);

function SubmitButton({
  text,
  pendingText,
}: {
  text: string;
  pendingText: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={primary}
      disabled={pending}
      aria-busy={pending}
    >
      {pending && (
        <LoaderCircle
          size={17}
          className="animate-spin"
          aria-hidden="true"
        />
      )}
      {pending ? pendingText : text}
    </button>
  );
}

function Feedback({
  result,
}: {
  result: PurchaseFeedback;
}) {
  if (result.status === 'idle' || !result.message) {
    return null;
  }

  const success = result.status === 'success';

  return (
    <div
      role={success ? 'status' : 'alert'}
      className={
        'flex items-start gap-2 rounded-xl border p-3 text-sm ' +
        (success
          ? 'border-[#b2d6bd] bg-[#f2fff5] text-[#28633c]'
          : 'border-[#e7c2cc] bg-[#fff3f4] text-[#8d3149]')
      }
    >
      {success ? (
        <CheckCircle2
          size={18}
          className="shrink-0"
          aria-hidden="true"
        />
      ) : (
        <AlertCircle
          size={18}
          className="shrink-0"
          aria-hidden="true"
        />
      )}
      <span>{result.message}</span>
    </div>
  );
}

export function PackageOrderForm({
  suppliers,
  locations,
  products,
  requestKey,
}: {
  suppliers: Choice[];
  locations: Choice[];
  products: ProductOption[];
  requestKey: string;
}) {
  const router = useRouter();

  const [result, action] = useActionState(
    createPackagedOrder,
    idle,
  );

  const [rows, setRows] = useState<PurchaseRow[]>([
    {
      key: 1,
      sku: '',
      packageId: '',
      quantity: '1',
      unitCost: '',
    },
  ]);

  const [nextKey, setNextKey] = useState(2);

  const saved = result.status === 'success';

  useEffect(() => {
    if (result.status === 'success') {
      router.refresh();
    }
  }, [result, router]);

  function updateRow(
    key: number,
    update: Partial<PurchaseRow>,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, ...update } : row,
      ),
    );
  }

  function addRow() {
    if (rows.length >= 40) return;

    setRows((current) => [
      ...current,
      {
        key: nextKey,
        sku: '',
        packageId: '',
        quantity: '1',
        unitCost: '',
      },
    ]);

    setNextKey((value) => value + 1);
  }

  const totalPreview = rows.reduce((sum, row) => {
    const product = products.find(
      (item) =>
        item.sku.toLowerCase() ===
        row.sku.trim().toLowerCase(),
    );

    const selectedPackage = product?.packages.find(
      (item) => item.id === row.packageId,
    );

    const multiplier =
      selectedPackage?.unitsPerPackage ?? 1;

    const amount =
      Number(row.quantity) *
      multiplier *
      Number(row.unitCost);

    return Number.isFinite(amount)
      ? sum + amount
      : sum;
  }, 0);

  if (saved) {
    return (
      <section className="grid gap-4 rounded-xl border border-[#bddac1] bg-[#f4fff5] p-5">
        <Feedback result={result} />

        <p className="text-sm text-[#3e6449]">
          The new purchase order is a draft.
          Stock has not been increased.
          Approve the order before recording delivery.
        </p>

        {result.id && (
          <p className="break-all text-xs text-[#51765d]">
            Purchase ID: {result.id}
          </p>
        )}

        <Link
          href="/workspace/purchases"
          className={secondary + ' w-fit'}
        >
          Open purchase register
        </Link>
      </section>
    );
  }

  return (
    <form action={action} className="grid gap-5">
      <input
        type="hidden"
        name="requestKey"
        value={requestKey}
      />

      <input
        type="hidden"
        name="linesJson"
        value={JSON.stringify(
          rows.map((row) => ({
            sku: row.sku.trim(),
            packageId: row.packageId,
            quantity: row.quantity,
            unitCost: row.unitCost,
          })),
        )}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <label className={label}>
          Supplier
          <select
            name="supplierId"
            required
            defaultValue=""
            className={input}
          >
            <option value="" disabled>
              Choose supplier
            </option>

            {suppliers
              .filter((item) => item.active !== false)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>

        <label className={label}>
          Receiving location
          <select
            name="locationId"
            required
            defaultValue=""
            className={input}
          >
            <option value="" disabled>
              Choose location
            </option>

            {locations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label className={label}>
          Expected delivery date
          <input
            name="expectedDate"
            type="date"
            className={input}
          />
        </label>

        <label className={label}>
          Order notes
          <input
            name="note"
            maxLength={500}
            className={input}
            placeholder="Supplier reference or delivery instructions"
          />
        </label>
      </div>

      <div className="grid gap-4">
        <div>
          <h3 className="font-serif text-xl text-[#512238]">
            Products being purchased
          </h3>
          <p className="mt-1 text-sm text-[#806d78]">
            Select the SKU, packaging and ordered quantity.
            Enter the purchase cost of one individual
            inventory unit, not the cost of the entire carton.
          </p>
        </div>

        <datalist id="golden-rose-purchase-skus">
          {products.map((product) => (
            <option
              key={product.id}
              value={product.sku}
              label={product.name}
            />
          ))}
        </datalist>

        {rows.map((row, index) => {
          const product = products.find(
            (item) =>
              item.sku.toLowerCase() ===
              row.sku.trim().toLowerCase(),
          );

          const availablePackages =
            product?.packages.filter(
              (item) => item.active,
            ) ?? [];

          const selectedPackage =
            availablePackages.find(
              (item) => item.id === row.packageId,
            );

          const factor =
            selectedPackage?.unitsPerPackage ?? 1;

          const baseQuantity =
            Number(row.quantity) * factor;

          return (
            <section
              key={row.key}
              className="grid gap-3 rounded-xl border border-[#e9ddd5] bg-[#fffaf5] p-4"
            >
              <div className="flex justify-between gap-3">
                <h4 className="font-semibold text-[#552c42]">
                  Product {index + 1}
                </h4>

                {rows.length > 1 && (
                  <button
                    type="button"
                    className={secondary}
                    onClick={() =>
                      setRows((current) =>
                        current.filter(
                          (item) => item.key !== row.key,
                        ),
                      )
                    }
                    aria-label={`Remove product ${index + 1}`}
                  >
                    <Trash2 size={16} />
                    Remove
                  </button>
                )}
              </div>

              <div className="grid gap-3 lg:grid-cols-4">
                <label className={label}>
                  Product SKU
                  <input
                    className={input}
                    list="golden-rose-purchase-skus"
                    placeholder="GRQA-00803"
                    value={row.sku}
                    onChange={(event) =>
                      updateRow(row.key, {
                        sku: event.target.value,
                        packageId: '',
                      })
                    }
                    required
                  />
                </label>

                <label className={label}>
                  Purchase unit
                  <select
                    className={input}
                    value={row.packageId}
                    onChange={(event) =>
                      updateRow(row.key, {
                        packageId: event.target.value,
                      })
                    }
                  >
                    <option value="">
                      Individual piece / bottle
                    </option>

                    {availablePackages.map((pkg) => (
                      <option
                        key={pkg.id}
                        value={pkg.id}
                      >
                        {pkg.unitName} (
                        {pkg.unitsPerPackage} units)
                      </option>
                    ))}
                  </select>
                </label>

                <label className={label}>
                  Quantity ordered
                  <input
                    type="number"
                    className={input}
                    min={1}
                    max={100000}
                    step={1}
                    value={row.quantity}
                    onChange={(event) =>
                      updateRow(row.key, {
                        quantity: event.target.value,
                      })
                    }
                    required
                  />
                </label>

                <label className={label}>
                  Cost per individual unit (₦)
                  <input
                    type="number"
                    className={input}
                    min="0.01"
                    step="0.01"
                    placeholder="1000.00"
                    value={row.unitCost}
                    onChange={(event) =>
                      updateRow(row.key, {
                        unitCost: event.target.value,
                      })
                    }
                    required
                  />
                </label>
              </div>

              <p className="text-xs text-[#806d78]">
                {product
                  ? `${product.name}${product.sizeMl !== null ? ` · ${product.sizeMl} mL` : ''}`
                  : 'Search for a SKU above to find configured packs and cartons.'}
                {' · '}
                {Number.isFinite(baseQuantity)
                  ? `${baseQuantity.toLocaleString('en-NG')} individual inventory units`
                  : 'Enter a valid quantity'}
              </p>
            </section>
          );
        })}

        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= 40}
          className={secondary + ' w-fit'}
        >
          <Plus size={17} />
          Add another product
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#f5eee7] p-4">
        <div>
          <p className="text-xs font-semibold text-[#806d78]">
            Estimated purchase total
          </p>
          <p className="font-serif text-2xl text-[#54213a]">
            {money(totalPreview)}
          </p>
        </div>

        <SubmitButton
          text="Create draft purchase order"
          pendingText="Saving purchase order…"
        />
      </div>

      <Feedback result={result} />
    </form>
  );
}

export function PackageApprovalForm({
  purchaseId,
}: {
  purchaseId: string;
}) {
  const router = useRouter();

  const [result, action] = useActionState(
    approvePackagedOrder,
    idle,
  );

  useEffect(() => {
    if (result.status === 'success') {
      router.refresh();
    }
  }, [result, router]);

  return (
    <form action={action} className="grid gap-2">
      <input
        type="hidden"
        name="id"
        value={purchaseId}
      />

      <SubmitButton
        text="Approve order"
        pendingText="Approving…"
      />

      <Feedback result={result} />
    </form>
  );
}

export function PackageReceiptForm({
  lineId,
  unitName,
  remaining,
  requestKey,
}: {
  lineId: string;
  unitName: string;
  remaining: number;
  requestKey: string;
}) {
  const router = useRouter();

  const [result, action] = useActionState(
    receivePackagedLine,
    idle,
  );

  useEffect(() => {
    if (result.status === 'success') {
      router.refresh();
    }
  }, [result, router]);

  if (remaining < 1) {
    return null;
  }

  return (
    <form
      action={action}
      className="mt-3 grid gap-2 border-t border-[#ecded3] pt-3"
    >
      <input
        type="hidden"
        name="lineId"
        value={lineId}
      />

      <input
        type="hidden"
        name="requestKey"
        value={requestKey}
      />

      <label className={label}>
        {`Receive ${unitName} quantity`}
        <input
          type="number"
          name="quantity"
          min={1}
          max={remaining}
          defaultValue={remaining}
          required
          className={input + ' max-w-40'}
        />
      </label>

      <p className="text-xs text-[#806d78]">
        Record only the quantity actually delivered.
        You can receive less than the outstanding amount.
      </p>

      <div>
        <SubmitButton
          text="Confirm delivery received"
          pendingText="Receiving stock…"
        />
      </div>

      <Feedback result={result} />
    </form>
  );
}
