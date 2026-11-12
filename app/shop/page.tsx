import { Suspense } from 'react';
import { connection } from 'next/server';
import { listCatalog } from '@/src/lib/golden-rose/edge';
import { ShopView } from './shop-view';

async function Catalog() {
  await connection();
  const items = await listCatalog().catch(() => null);
  return <ShopView items={items ?? []} unavailable={items === null} />;
}

export default function ShopPage() {
  return <Suspense fallback={<ShopView items={null} />}><Catalog /></Suspense>;
}
