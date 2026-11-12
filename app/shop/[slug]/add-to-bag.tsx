'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { formatPrice, UUID, type CatalogVariant } from '@/src/lib/golden-rose/contracts';
import { MAX_QUANTITY, setBagQuantity } from '@/src/lib/customer/bag';
import { updateShoppingBag } from '@/src/components/use-shopping-bag';

export function AddToBag({ variants }: { variants: CatalogVariant[] }) {
  const [notice, setNotice] = useState('');
  const options = variants.filter(variant => variant.currency === 'NGN' && UUID.test(variant.id) &&
    Number.isSafeInteger(variant.priceMinor) && variant.priceMinor >= 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get('variant'));
    const quantity = Number(form.get('quantity'));
    if (!options.some(variant => variant.id === id) || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      setNotice('Choose a variant and a valid quantity.');
      return;
    }
    const changed = updateShoppingBag(lines => {
      const previous = lines.find(line => line.variantId === id)?.quantity ?? 0;
      if (previous + quantity > MAX_QUANTITY) return lines;
      return setBagQuantity(lines, id, previous + quantity);
    });
    setNotice(changed ? 'Added to your shopping bag.' : 'Your bag has reached its limit for this fragrance or for distinct items.');
  }

  if (!options.length) return <p>This fragrance is currently unavailable to add to your bag.</p>;

  return (
    <form className="gr-bag-form mt-6" onSubmit={submit} onChange={() => setNotice('')}>
      <label>Variant
        <select name="variant" aria-label="Fragrance variant">
          {options.map(variant => <option key={variant.id} value={variant.id}>
            {variant.sizeMl ? variant.sizeMl + ' ml' : variant.sku ?? 'Standard'} · {formatPrice(variant.priceMinor)}
            {variant.sizeMl && variant.sku ? ' · ' + variant.sku : ''}
          </option>)}
        </select>
      </label>
      <label>Quantity<input name="quantity" type="number" defaultValue={1} min={1} max={MAX_QUANTITY} step={1} required /></label>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="gr-bag-primary"><ShoppingBag size={16} aria-hidden="true" /> Add to bag</button>
        <Link className="text-link" href="/cart">View bag</Link>
      </div>
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
