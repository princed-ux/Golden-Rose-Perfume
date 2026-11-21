'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ImagePlus, LoaderCircle, Trash2, ArrowUpRight } from 'lucide-react';

import { productImageUrl } from '@/src/lib/golden-rose/product-images';
import type { ManagedProduct } from '@/src/lib/golden-rose/catalogue-management';

type Media = NonNullable<ManagedProduct['images']>[number];
type ImageResult = {
  success?: boolean;
  error?: string;
  message?: string;
  images?: Media[];
};

const IMAGE_LIMIT = 8;
const MAX_BYTES = 4_000_000;

export function ProductImages({
  productId,
  productName,
  slug,
  published,
  initialImages = [],
}: {
  productId: string;
  productName: string;
  slug: string;
  published: boolean;
  initialImages?: Media[];
}) {
  const [images, setImages] = useState<Media[]>(initialImages);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [altText, setAltText] = useState(productName);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || images.length >= IMAGE_LIMIT) return;
    const input = fileInput.current;
    const file = input?.files?.[0];
    if (!file) {
      setError('Choose a photograph first.');
      return;
    }
    if (!file.size || file.size > MAX_BYTES ||
        !['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) {
      setError('Choose a JPG, PNG, WebP or AVIF image smaller than 4 MB.');
      return;
    }

    const data = new FormData();
    data.set('productId', productId);
    data.set('image', file);
    data.set('altText', altText.trim().slice(0, 180));

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const reply = await fetch('/workspace/products/images', {
        method: 'POST',
        body: data,
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const result = await reply.json() as ImageResult;
      if (!reply.ok || !result.success || !Array.isArray(result.images)) {
        setError(result.error || 'Product photo could not be saved.');
        return;
      }
      setImages(result.images);
      setMessage(result.message || 'Photo added to this product.');
      if (input) input.value = '';
      router.refresh();
    } catch {
      setError('The upload could not be confirmed. Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(path: string) {
    if (busy || !window.confirm('Remove this photograph from the product gallery?')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const reply = await fetch('/workspace/products/images', {
        method: 'DELETE',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, storagePath: path }),
      });
      const result = await reply.json() as ImageResult;
      if (!reply.ok || !result.success || !Array.isArray(result.images)) {
        setError(result.error || 'This photograph could not be removed.');
        return;
      }
      setImages(result.images);
      setMessage(result.message || 'Photograph removed.');
      router.refresh();
    } catch {
      setError('Could not confirm removal. Refresh the product to check its photos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid min-w-0 gap-4 border-t border-[#eaded8] pt-5" aria-labelledby="gr-product-photography-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="gr-product-photography-title" className="m-0 font-serif text-xl text-[#4b1f38]">
            Product photography
          </h3>
          <p className="mt-1 text-sm text-[#796570]">
            Upload up to eight photographs. The first image is the storefront cover.
            Photos only appear in customer listings after you publish the product.
          </p>
        </div>
        {published && (
          <Link
            href={'/shop/' + encodeURIComponent(slug || productId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#e5d1c7] bg-white px-3 text-sm font-semibold text-[#54213a]"
          >
            View customer listing <ArrowUpRight size={16} />
          </Link>
        )}
      </div>

      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Attached product photographs">
          {images.map((image, index) => {
            const url = productImageUrl(image.storagePath);
            return (
              <article className="overflow-hidden rounded-xl border border-[#eaded8] bg-white" key={image.storagePath}>
                <div className="relative aspect-square bg-[#f7f1ee]">
                  {url ? <Image src={url} alt={image.altText || productName} fill sizes="(max-width: 640px) 42vw, 190px" className="object-contain" /> :
                    <span className="grid h-full place-items-center text-xs text-[#796570]">Photo unavailable</span>}
                  {index === 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-[#4b1f38] px-2 py-1 text-[10px] font-bold text-white">
                      Cover
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 p-2">
                  <span className="min-w-0 truncate text-xs text-[#796570]" title={image.altText || productName}>
                    {image.altText || 'Perfume photograph'}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={'Remove photo ' + (index + 1)}
                    onClick={() => void remove(image.storagePath)}
                    className="inline-grid size-9 flex-none place-items-center rounded-lg border border-[#eaded8] text-[#97465c] hover:bg-[#fff2f3] disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[#dac9c5] bg-[#fbf7f4] px-4 py-6 text-sm text-[#796570]">
          No product photos yet. The customer shop will display its default image placeholder.
        </p>
      )}

      {images.length < IMAGE_LIMIT && (
        <form onSubmit={(event) => void upload(event)} className="grid gap-3 rounded-xl border border-[#eaded8] bg-[#fffdf9] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="grid min-w-0 gap-2 text-xs font-semibold text-[#54213a]">
            Select image (JPG, PNG, WebP or AVIF; max 4 MB)
            <input
              ref={fileInput}
              required
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={busy}
              className="w-full min-w-0 rounded-lg border border-[#eaded8] bg-white p-2 text-sm"
            />
          </label>
          <label className="grid min-w-0 gap-2 text-xs font-semibold text-[#54213a]">
            Image description
            <input
              value={altText}
              onChange={event => setAltText(event.target.value)}
              maxLength={180}
              disabled={busy}
              className="min-h-11 w-full min-w-0 rounded-lg border border-[#eaded8] bg-white px-3 text-sm"
              placeholder="e.g. Front view of perfume bottle"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#54213a] px-4 text-sm font-bold text-white hover:bg-[#6b304b] disabled:opacity-50"
          >
            {busy ? <LoaderCircle size={17} className="animate-spin" /> : <ImagePlus size={17} />}
            {busy ? 'Saving…' : 'Add photo'}
          </button>
        </form>
      )}

      {message && <p role="status" className="text-sm text-[#2d7149]">{message}</p>}
      {error && <p role="alert" className="text-sm text-[#9f394f]">{error}</p>}
    </section>
  );
}
