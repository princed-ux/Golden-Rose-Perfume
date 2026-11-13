'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Flower2 } from 'lucide-react';
import type { CatalogProduct } from '@/src/lib/golden-rose/contracts';
import { productImageUrl } from '@/src/lib/golden-rose/product-images';

type ProductImage = NonNullable<CatalogProduct['images']>[number];

export function ProductPhoto({ image, name, sizes, fit = 'contain' }: {
  image?: ProductImage;
  name: string;
  sizes: string;
  fit?: 'cover' | 'contain';
}) {
  const url = productImageUrl(image?.storagePath);
  const [failed, setFailed] = useState<string | null>(null);

  return url && url !== failed ? (
    <Image
      src={url}
      alt={image?.altText?.trim() || name}
      fill
      sizes={sizes}
      style={{ objectFit: fit }}
      onError={() => setFailed(url)}
    />
  ) : (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-3 text-center text-xs text-[var(--gr-theme-muted)]">
      <Flower2 size={32} strokeWidth={1.15} aria-hidden="true" className="text-[var(--gr-theme-gold)]" />
      <span>Photo unavailable</span>
    </div>
  );
}

export function ProductGallery({ product }: { product: CatalogProduct }) {
  const images = (product.images ?? []).filter(image => productImageUrl(image?.storagePath));
  const [index, setIndex] = useState(0);
  return <section aria-label={product.name + ' photographs'} className="min-w-0">
    <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface)]">
      <ProductPhoto image={images[index]} name={product.name} sizes="(max-width: 800px) 95vw, 50vw" />
    </div>
    {images.length > 1 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Choose a product photo">
      {images.map((image, position) => <button key={image.storagePath + position}
        type="button" onClick={() => setIndex(position)} aria-label={`Show photo ${position + 1}`}
        aria-pressed={index === position}
        className="relative h-16 w-16 overflow-hidden rounded border border-[var(--gr-theme-border)] aria-pressed:border-[var(--gr-theme-gold)] focus-visible:outline-2 focus-visible:outline-offset-2">
        <ProductPhoto image={{ ...image, altText: '' }} name={product.name} sizes="64px" />
      </button>)}
    </div>}
  </section>;
}
