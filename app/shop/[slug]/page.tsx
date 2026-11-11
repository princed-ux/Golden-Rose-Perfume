import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { SiteHeader } from '@/src/components/site-header';
import { BottleArt } from '@/src/components/bottle-art';
import { featuredProducts, formatNaira } from '@/src/lib/demo-data';

export function generateStaticParams() { return featuredProducts.map(p => ({ slug: p.id })); }

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = featuredProducts.find(p => p.id === slug);
  if (!product) notFound();
  const variant = product.variants[0];
  return <><div className="preview-ribbon">PREVIEW · Product and price are not real</div><SiteHeader/><main className="container page-spacing">
    <Link href="/shop" className="text-link"><ArrowLeft size={16}/> Back to collection</Link>
    <div className="detail-layout"><div className="detail-art"><BottleArt variant={2}/></div><div className="detail-copy"><span className="overline">{product.category} / SAMPLE PRODUCT</span><h1>{product.name}</h1><p className="detail-price">{formatNaira(variant?.priceMinor ?? 0)}</p><p>{product.description}</p><div className="detail-pill">{variant?.sizeMl} ml <span>·</span> Eau de Parfum</div><div className="callout"><CheckCircle2 size={18}/> Variant, barcode, price and stock will come from the real product database.</div><Link href="/cart" className="button button--dark">View cart preview</Link><p className="muted">Cart and checkout are not functional yet.</p></div></div>
  </main></>;
}

