'use client';

import { useState, useTransition } from 'react';
import { Heart } from 'lucide-react';
import Link from 'next/link';
import { changeWishlist } from '@/app/account/shopping-actions';

export function WishlistButton({ productId, saved, signedIn = true, removeOnly = false }: {
  productId: string;
  saved: boolean;
  signedIn?: boolean;
  removeOnly?: boolean;
}) {
  const [selected, setSelected] = useState(saved);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  if (!signedIn) return <Link href="/account/login" className="gr-bag-primary">
    <Heart size={16} aria-hidden="true" /> Sign in to save
  </Link>;
  if (removeOnly && !selected) return <p role="status">Fragrance removed.</p>;

  return <div>
    <button type="button" className="gr-bag-primary" aria-pressed={removeOnly ? undefined : selected} disabled={pending}
      onClick={() => startTransition(async () => {
        setError('');
        try {
          const result = await changeWishlist(productId, !selected);
          if ('saved' in result && typeof result.saved === 'boolean') setSelected(result.saved);
          else setError(result.error ?? 'Try again.');
        } catch {
          setError('Saved fragrances could not be updated. Try again.');
        }
      })}>
      <Heart size={16} fill={selected ? 'currentColor' : 'none'} aria-hidden="true" />
      {pending ? 'Saving…' : selected ? 'Remove from saved fragrances' : 'Save fragrance'}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
