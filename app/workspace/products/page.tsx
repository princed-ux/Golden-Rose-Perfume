import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { EdgeError, listAdminProducts } from '@/src/lib/golden-rose/edge';
import { canManageStockSetup, formatPrice, type AdminProduct } from '@/src/lib/golden-rose/contracts';
import { createProduct, setPublication } from '../actions';
import { OperationForm } from '../operation-form';

export default async function ProductsPage() {
  const { token, role } = await requireStaff();
  if (!canViewModule(role, 'products')) notFound();
  const canManage = canManageStockSetup(role);
  let products: AdminProduct[] = [];
  let error = '';
  try {
    products = await listAdminProducts(token);
  } catch (cause) {
    error = cause instanceof EdgeError ? cause.message : 'Products could not be loaded.';
  }

  return (
    <div className="workspace-page gr-live">
      <div className="workspace-page__heading">
        <div><h1>Products</h1><p>Manage fragrances, sizes, prices and storefront publication.</p></div>
        <Link className="gr-live-secondary" href="/shop">View shop</Link>
      </div>
      {canManage ? (
        <section className="panel gr-live-panel" aria-labelledby="create-product">
          <h2 id="create-product">Create a perfume</h2>
          <p>New products are saved as drafts. Publish them when they are ready for the shop.</p>
          <OperationForm runAction={createProduct} label="Create draft">
            <label>Name<input name="name" required minLength={2} maxLength={200} /></label>
            <label>Brand<input name="brandName" required maxLength={150} /></label>
            <label>Category<input name="categoryName" required maxLength={150} /></label>
            <label>SKU<input name="sku" required minLength={2} maxLength={80} /></label>
            <label>Barcode (optional)<input name="barcode" minLength={3} maxLength={128} /></label>
            <label>Bottle size (ml)<input name="sizeMl" type="number" required min="0.01" max="99999999.99" step="0.01" /></label>
            <label>Selling price (₦)<input name="price" type="number" required min="0" step="0.01" /></label>
            <label>URL slug (optional)<input name="slug" placeholder="Generated from name" maxLength={240} /></label>
            <label className="gr-live-wide">Description (optional)<textarea name="description" rows={3} maxLength={5000} /></label>
          </OperationForm>
        </section>
      ) : <p className="gr-live-note">Only owners and managers can create or publish products.</p>}

      <section className="panel gr-live-panel" aria-labelledby="product-list">
        <h2 id="product-list">Product catalogue</h2>
        {error ? <p className="gr-live-result" data-status="error" role="alert">{error} <Link href="/workspace/products">Reload products</Link></p>
          : !products.length ? <p>No products have been created yet.</p>
            : <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Products and publication status">
              <table className="data-table gr-live-table">
                <thead><tr><th>Fragrance</th><th>Variants</th><th>Status</th>{canManage && <th>Publication</th>}</tr></thead>
                <tbody>
                  {products.map(product => {
                    const hasActiveVariant = product.variants.some(variant => variant.active);
                    return (
                      <tr key={product.productId}>
                        <td><strong>{product.name}</strong><br />{[product.brand, product.category].filter(Boolean).join(' · ')}</td>
                        <td>
                          {product.variants.length ? <ul className="gr-live-list">{product.variants.map(variant => (
                            <li key={variant.variantId}>
                              {variant.sku ?? 'No SKU'}{variant.sizeMl ? ' · ' + variant.sizeMl + ' ml' : ''} · {formatPrice(variant.priceMinor, variant.currency)}
                              {variant.barcode ? ' · ' + variant.barcode : ''}{!variant.active ? ' · Inactive' : ''}
                            </li>
                          ))}</ul> : 'No variants'}
                        </td>
                        <td><span className="status-label">{!product.active ? 'Inactive' : product.published ? 'Published' : 'Draft'}</span></td>
                        {canManage && <td>
                          {product.active && (product.published || hasActiveVariant) ? (
                            <OperationForm key={String(product.published)} runAction={setPublication} label={product.published ? 'Unpublish' : 'Publish'} inline>
                              <input type="hidden" name="productId" value={product.productId} />
                              <input type="hidden" name="published" value={String(!product.published)} />
                            </OperationForm>
                          ) : <span>{product.active ? 'Needs an active variant' : 'Inactive'}</span>}
                        </td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>}
      </section>
    </div>
  );
}
