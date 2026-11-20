'use client';
import { ActionButton, useActionNotice } from '@/src/components/action-feedback';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { workspaceInput, workspaceLabel, workspacePrimary } from '@/src/components/workspace/page-layout';
import { INITIAL_RESULT } from '@/src/lib/golden-rose/contracts';
import type { CatalogueCommand, CatalogueOperation, ManagedProduct, ManagedVariant } from '@/src/lib/golden-rose/catalogue-management';
import { changeCatalogue } from './management-actions';

function CatalogueForm({
  action, label, children, onSuccess, compact = false, reset = false, submitClass = workspacePrimary,
}: {
  action: CatalogueCommand;
  label: string;
  children: ReactNode;
  onSuccess?: (result: CatalogueOperation, form: FormData) => void;
  compact?: boolean;
  reset?: boolean;
  submitClass?: string;
}) {
  const [result, setResult] = useState(INITIAL_RESULT);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const router = useRouter();

  useActionNotice(result);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const fingerprint = JSON.stringify(Array.from(data.entries()));
    const id = request.current?.fingerprint === fingerprint ? request.current.id : crypto.randomUUID();
    request.current = { fingerprint, id };
    data.set('requestId', id);
    busy.current = true;
    setPending(true);
    setResult(INITIAL_RESULT);
    try {
      const saved = await changeCatalogue(action, data);
      setResult(saved);
      if (saved.status !== 'success') return;
      request.current = null;
      if (reset) form.reset();
      onSuccess?.(saved, data);
      router.refresh();
    } catch {
      setResult({ status: 'error', message: 'Could not confirm this change. Retry with the same details or refresh the catalogue.' });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} aria-busy={pending} className={compact ? 'min-w-0' : 'grid min-w-0 gap-3'}>
      <fieldset disabled={pending} className={compact ? 'm-0 min-w-0 border-0 p-0' : 'm-0 grid min-w-0 gap-4 border-0 p-0'}>
        {children}
        <ActionButton pending={pending} pendingLabel="Saving…" type="submit" className={submitClass}>{pending ? 'Saving…' : label}
          {compact && !pending && action === 'publication' && label === 'Publish' && <ArrowUpRight size={15} aria-hidden="true" />}
        </ActionButton>
      </fieldset>
      {result.message && <p className={'m-0 break-words text-sm ' + (result.status === 'error' ? 'text-[#8e3147]' : 'text-[#2b6041]')}
        role={result.status === 'error' ? 'alert' : 'status'}>{result.message}</p>}
    </form>
  );
}

function ProductFields({ product }: { product?: ManagedProduct }) {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <label className={workspaceLabel}>Product name
        <input className={workspaceInput} name="name" required minLength={2} maxLength={200} defaultValue={product?.name} />
      </label>
      <label className={workspaceLabel}>URL slug
        <input className={workspaceInput} name="slug" maxLength={240} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={product?.slug}
          placeholder="Generated from the name if blank" />
      </label>
      <label className={workspaceLabel}>Brand
        <input className={workspaceInput} name="brandName" required={!product} maxLength={150} defaultValue={product?.brand ?? ''} />
      </label>
      <label className={workspaceLabel}>Category
        <input className={workspaceInput} name="categoryName" required={!product} maxLength={150} defaultValue={product?.category ?? ''} />
      </label>
      <label className={workspaceLabel + ' md:col-span-2'}>Description
        <textarea className={workspaceInput + ' min-h-24'} name="description" maxLength={5000} defaultValue={product?.description ?? ''} />
      </label>
    </div>
  );
}

function VariantFields({ variant, extended }: { variant?: ManagedVariant; extended: boolean }) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      {extended && <>
        <label className={workspaceLabel}>Variant name
          <input className={workspaceInput} name="variantName" maxLength={150} defaultValue={variant?.name ?? ''} />
        </label>
        <label className={workspaceLabel}>Concentration
          <input className={workspaceInput} name="concentration" maxLength={100} defaultValue={variant?.concentration ?? ''} placeholder="e.g. Eau de Parfum" />
        </label>
      </>}
      <label className={workspaceLabel}>SKU
        <input className={workspaceInput} name="sku" autoComplete="off" required minLength={2} maxLength={80} defaultValue={variant?.sku ?? ''} />
      </label>
      <label className={workspaceLabel}>Barcode (optional)
        <input className={workspaceInput} name="barcode" autoComplete="off" minLength={3} maxLength={128} defaultValue={variant?.barcode ?? ''} />
      </label>
      <label className={workspaceLabel}>Bottle size (mL)
        <input className={workspaceInput} name="sizeMl" inputMode="decimal" required={!variant || variant.sizeMl !== null}
          defaultValue={variant?.sizeMl ?? ''} maxLength={11} placeholder="e.g. 50" />
      </label>
      <label className={workspaceLabel}>Selling price (₦)
        <input className={workspaceInput} name="price" inputMode="decimal" required maxLength={13}
          defaultValue={variant ? (variant.priceMinor / 100).toFixed(2) : ''} placeholder="0.00" />
      </label>
    </div>
  );
}

export function PublicationForm({ productId, revision, published, onSuccess }: {
  productId: string; revision?: string; published: boolean; onSuccess?: (result: CatalogueOperation) => void;
}) {
  return (
    <CatalogueForm action="publication" label={published ? 'Unpublish' : 'Publish'} compact onSuccess={onSuccess}
      submitClass={'catalogue-btn ' + (published ? 'catalogue-btn--soft' : 'catalogue-btn--primary')}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="revision" value={revision ?? ''} />
      <input type="hidden" name="published" value={String(!published)} />
    </CatalogueForm>
  );
}

export function AddProductForm({ extended }: { extended: boolean }) {
  const [created, setCreated] = useState<{ productId?: string; name: string } | null>(null);
  return (
    <section className="grid min-w-0 gap-5 rounded-2xl border border-[#eaded8] bg-[#fffdf9] p-4 sm:p-6" aria-labelledby="add-product">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="add-product" className="m-0 font-serif text-2xl text-[#4b1f38]">Add product</h2>
          <p className="m-0 mt-1 text-sm text-[#796570]">New products start as drafts with no stock. Publish when the listing is ready.</p>
        </div>
        <Link className="catalogue-btn catalogue-btn--ghost" href="/workspace/products">Back to catalogue</Link>
      </div>
      <CatalogueForm action="create" label="Create draft product" reset onSuccess={(result, form) =>
        setCreated({ productId: result.productId, name: String(form.get('name') ?? '') })}>
        <ProductFields />
        <h3 className="m-0 font-serif text-lg text-[#4b1f38]">First variant</h3>
        <VariantFields extended={extended} />
      </CatalogueForm>
      {created && <Link className="catalogue-btn catalogue-btn--ghost w-fit"
        href={extended && created.productId ? '/workspace/products?manage=' + created.productId :
          '/workspace/products?' + new URLSearchParams({q:created.name})}>
        {extended && created.productId ? 'Manage created product' : 'Find created product'}
      </Link>}
    </section>
  );
}

export function ProductEditor({ initial }: { initial: ManagedProduct }) {
  const [saved, setSaved] = useState<{ base: string; product: ManagedProduct } | null>(null);
  const [variantId, setVariantId] = useState(initial.variants[0]?.variantId ?? '');
  const product = saved?.base === initial.revision ? saved.product : initial;
  const variant = product.variants.find(item => item.variantId === variantId);
  const onSuccess = (result: CatalogueOperation) => {
    if (result.product) setSaved({ base: initial.revision, product: result.product });
  };
  const ids = <>
    <input type="hidden" name="productId" value={product.productId} />
    <input type="hidden" name="revision" value={product.revision} />
  </>;

  return (
    <section className="grid min-w-0 gap-5 rounded-2xl border border-[#eaded8] bg-[#fffdf9] p-4 sm:p-6" aria-labelledby="manage-product">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 break-words">
          <h2 id="manage-product" className="m-0 font-serif text-2xl text-[#4b1f38]">Manage {product.name}</h2>
          <p className="m-0 mt-1 text-sm text-[#796570]">{product.published ? 'Published in the storefront.' : 'Draft listing.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {product.active && <PublicationForm productId={product.productId} revision={product.revision} published={product.published} onSuccess={onSuccess} />}
          <Link className="catalogue-btn catalogue-btn--ghost" href="/workspace/products">Back to catalogue</Link>
        </div>
      </div>
      {product.active ? (
        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <div className="grid min-w-0 content-start gap-3">
            <h3 className="m-0 font-serif text-xl text-[#4b1f38]">Product details</h3>
            <CatalogueForm action="details" label="Save product details" onSuccess={onSuccess}>
              {ids}
              <ProductFields product={product} />
            </CatalogueForm>
          </div>
          <div className="grid min-w-0 content-start gap-3">
            <h3 className="m-0 font-serif text-xl text-[#4b1f38]">Variants</h3>
            <label className={workspaceLabel}>Choose a variant
              <select className={workspaceInput} value={variantId} onChange={event => setVariantId(event.target.value)}>
                <option value="">Add a variant</option>
                {product.variants.map(item => <option key={item.variantId} value={item.variantId}>
                  {item.name || item.sku || 'Variant'}{item.sizeMl ? ' · ' + item.sizeMl + ' mL' : ''}{item.active ? '' : ' · Inactive'}
                </option>)}
              </select>
            </label>
            {variant && variant.currency !== 'NGN' ? <p className="text-sm text-[#8e3147]">This variant uses {variant.currency}. Its existing price is read-only.</p> : (
              <CatalogueForm key={variantId} action="variant" label={variant ? 'Save variant' : 'Add variant'} reset={!variant} onSuccess={onSuccess}>
                {ids}
                <input type="hidden" name="variantId" value={variantId} />
                <VariantFields variant={variant} extended />
                <label className={workspaceLabel}>Availability
                  <select className={workspaceInput} name="active" defaultValue={String(variant?.active ?? true)}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </label>
                <p className="m-0 text-xs text-[#796570]">Inactive variants leave the storefront and POS. Their stock and sale history stay recorded.</p>
              </CatalogueForm>
            )}
          </div>
        </div>
      ) : <p className="text-sm text-[#796570]">This inactive product is read-only.</p>}
    </section>
  );
}
