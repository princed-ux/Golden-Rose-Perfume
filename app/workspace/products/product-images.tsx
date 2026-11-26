
'use client';

import {
  useRef,
  useState,
  type FormEvent,
} from 'react';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

import {
  ArrowUpRight,
  ImagePlus,
  LoaderCircle,
  Trash2,
} from 'lucide-react';

import {
  productImageUrl,
} from '@/src/lib/golden-rose/product-images';

import type {
  ManagedProduct,
} from '@/src/lib/golden-rose/catalogue-management';

type Media =
  NonNullable<ManagedProduct['images']>[number];

type MediaResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  images?: Media[];
};

const MAX_IMAGES = 8;
const MAX_BYTES = 4_000_000;

const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];

interface ProductImagesProps {
  productId: string;
  productName: string;
  slug: string;
  published: boolean;
  initialImages?: Media[];
}

export function ProductImages({
  productId,
  productName,
  slug,
  published,
  initialImages = [],
}: ProductImagesProps) {
  const router = useRouter();

  const fileInput =
    useRef<HTMLInputElement>(null);

  const [images, setImages] =
    useState<Media[]>(initialImages);

  const [description, setDescription] =
    useState(productName);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function upload(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      busy ||
      images.length >= MAX_IMAGES
    ) {
      return;
    }

    const input = fileInput.current;
    const file = input?.files?.[0];

    if (!file) {
      setError('Choose a photograph first.');
      return;
    }

    if (
      !file.size ||
      file.size > MAX_BYTES ||
      !IMAGE_TYPES.includes(file.type)
    ) {
      setError(
        'Choose a JPG, PNG, WebP or AVIF image smaller than 4 MB.',
      );
      return;
    }

    const data = new FormData();

    data.set('productId', productId);
    data.set('image', file);

    data.set(
      'altText',
      description.trim().slice(0, 180),
    );

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(
        '/workspace/products/images',
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          body: data,
        },
      );

      const result =
        await response.json() as MediaResponse;

      if (
        !response.ok ||
        !result.success ||
        !Array.isArray(result.images)
      ) {
        setError(
          result.error ||
            'The photograph could not be saved.',
        );
        return;
      }

      setImages(result.images);

      setMessage(
        result.message ||
          'Photograph added to this product.',
      );

      if (input) {
        input.value = '';
      }

      router.refresh();
    } catch {
      setError(
        'The photograph upload could not be confirmed. Check your connection and retry.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(
    storagePath: string,
  ) {
    if (
      busy ||
      !window.confirm(
        'Remove this photograph from the product gallery?',
      )
    ) {
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(
        '/workspace/products/images',
        {
          method: 'DELETE',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productId,
            storagePath,
          }),
        },
      );

      const result =
        await response.json() as MediaResponse;

      if (
        !response.ok ||
        !result.success ||
        !Array.isArray(result.images)
      ) {
        setError(
          result.error ||
            'The photograph could not be removed.',
        );
        return;
      }

      setImages(result.images);

      setMessage(
        result.message ||
          'Photograph removed.',
      );

      router.refresh();
    } catch {
      setError(
        'Could not confirm photo removal. Refresh the product to check its current images.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="grid min-w-0 gap-4 border-t border-gr-border pt-5"
      aria-labelledby="gr-product-photo-heading"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="gr-product-photo-heading"
            className="m-0 font-serif text-xl text-gr-text"
          >
            Product photography
          </h3>

          <p className="mt-1 text-sm text-gr-muted">
            Add up to eight photographs of this perfume.
            The first photograph is its storefront cover.
            Images appear in the customer shop when
            the product is published.
          </p>
        </div>

        {published && (
          <Link
            href={
              '/shop/' +
              encodeURIComponent(
                slug || productId,
              )
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gr-border bg-gr-surface px-3 text-sm font-semibold text-gr-text"
          >
            View customer listing

            <ArrowUpRight
              size={16}
              aria-hidden="true"
            />
          </Link>
        )}
      </header>

      {images.length > 0 ? (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
          aria-label="Product photographs"
        >
          {images.map((image, index) => {
            const url = productImageUrl(
              image.storagePath,
            );

            return (
              <article
                key={image.storagePath}
                className="overflow-hidden rounded-xl border border-gr-border bg-gr-surface"
              >
                <div className="relative aspect-square bg-gr-surface-alt">
                  {url ? (
                    <Image
                      src={url}
                      alt={
                        image.altText ||
                        productName
                      }
                      fill
                      sizes="(max-width: 640px) 42vw, 190px"
                      className="object-contain"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-gr-muted">
                      Photo unavailable
                    </div>
                  )}

                  {index === 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-gr-strong px-2 py-1 text-[10px] font-bold text-gr-on-strong">
                      Cover
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 p-2">
                  <span
                    className="min-w-0 truncate text-xs text-gr-muted"
                    title={
                      image.altText ||
                      productName
                    }
                  >
                    {image.altText ||
                      'Perfume photograph'}
                  </span>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void remove(
                        image.storagePath,
                      )
                    }
                    aria-label={
                      `Remove photograph ${index + 1}`
                    }
                    className="inline-grid size-9 flex-none place-items-center rounded-lg border border-gr-border text-gr-danger hover:bg-gr-surface-alt disabled:opacity-50"
                  >
                    <Trash2
                      size={15}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-gr-border bg-gr-surface px-4 py-6 text-sm text-gr-muted">
          This product does not have photographs
          yet. The customer shop will display
          the default product placeholder.
        </p>
      )}

      {images.length < MAX_IMAGES && (
        <form
          onSubmit={(event) =>
            void upload(event)
          }
          aria-busy={busy}
          className="grid gap-3 rounded-xl border border-gr-border bg-gr-surface p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
        >
          <label className="grid min-w-0 gap-2 text-xs font-semibold text-gr-text">
            Photograph (maximum 4 MB)

            <input
              ref={fileInput}
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              required
              disabled={busy}
              className="w-full min-w-0 rounded-lg border border-gr-border bg-gr-surface p-2 text-sm"
            />
          </label>

          <label className="grid min-w-0 gap-2 text-xs font-semibold text-gr-text">
            Image description

            <input
              value={description}
              onChange={(event) =>
                setDescription(
                  event.target.value,
                )
              }
              maxLength={180}
              disabled={busy}
              placeholder="e.g. Front view of perfume bottle"
              className="min-h-11 w-full min-w-0 rounded-lg border border-gr-border bg-gr-surface px-3 text-sm"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gr-strong-hover px-4 text-sm font-bold text-gr-on-strong hover:bg-gr-strong-hover disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle
                size={17}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <ImagePlus
                size={17}
                aria-hidden="true"
              />
            )}

            {busy
              ? 'Uploading…'
              : 'Add photograph'}
          </button>
        </form>
      )}

      {message && (
        <p
          role="status"
          className="text-sm text-gr-success"
        >
          {message}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="text-sm text-gr-danger"
        >
          {error}
        </p>
      )}
    </section>
  );
}
