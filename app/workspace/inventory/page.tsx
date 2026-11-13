import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canViewModule } from '@/src/domain/permissions';
import { requireStaff } from '@/src/lib/golden-rose/staff';
import { EdgeError, getInventoryPage, listAdminProducts } from '@/src/lib/golden-rose/edge';
import { canManageStockSetup, canReceiveStock, LOCATION_TYPES } from '@/src/lib/golden-rose/contracts';
import { createLocation } from '../actions';
import { OperationForm } from '../operation-form';
import { ReceivingForm } from './receiving-form';

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ offset?: string }> }) {
  const { token, role, userId } = await requireStaff();
  if (!canViewModule(role, 'inventory')) notFound();
  const { offset: rawOffset } = await searchParams;
  const offset = typeof rawOffset === 'string' && /^\d{1,7}$/.test(rawOffset) && Number(rawOffset) <= 1_000_000
    ? Number(rawOffset) : 0;
  const receiveAllowed = canReceiveStock(role);
  const [snapshot, products] = await Promise.allSettled([
    getInventoryPage(token, offset),
    receiveAllowed ? listAdminProducts(token) : Promise.resolve([]),
  ]);
  const inventory = snapshot.status === 'fulfilled' ? snapshot.value : null;
  const loadError = snapshot.status === 'rejected' && snapshot.reason instanceof EdgeError
    ? snapshot.reason.message : 'Inventory could not be loaded.';
  const variants = products.status === 'fulfilled' ? products.value.filter(product => product.active).flatMap(product =>
    product.variants.filter(variant => variant.active).map(variant => ({
      id: variant.variantId,
      label: [product.name, variant.sizeMl && variant.sizeMl + ' ml', variant.sku].filter(Boolean).join(' · '),
    }))
  ) : [];

  return (
    <div className="workspace-page gr-live">
      <div className="workspace-page__heading">
        <div><h1>Inventory</h1><p>Review available stock and record deliveries by location.</p></div>
        <Link className="gr-live-secondary" href="/workspace/products">Manage products</Link>
      </div>

      {canManageStockSetup(role) && (
        <section className="panel gr-live-panel" aria-labelledby="create-location">
          <h2 id="create-location">Create a location</h2>
          <OperationForm runAction={createLocation} label="Create location">
            <label>Name<input name="name" required minLength={2} maxLength={150} /></label>
            <label>Location code<input name="code" required minLength={2} maxLength={32} /></label>
            <label>Type<select name="type">{LOCATION_TYPES.map(type => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
          </OperationForm>
        </section>
      )}
      {!inventory ? <p className="gr-live-result" data-status="error" role="alert">{loadError} <Link href="/workspace/inventory">Reload inventory</Link></p> : <>
        {receiveAllowed ? (
          <section className="panel gr-live-panel" aria-labelledby="receive-stock">
            <h2 id="receive-stock">Receive stock</h2>
            {products.status === 'rejected' && <p className="gr-live-result" data-status="error" role="alert">Product variants could not be loaded. <Link href="/workspace/inventory">Reload inventory</Link></p>}
            <ReceivingForm key={userId} userId={userId} locations={inventory.locations} variants={variants} />
          </section>
        ) : <p className="gr-live-note">Only owners, managers and inventory staff can receive stock.</p>}

        <section className="panel gr-live-panel" aria-labelledby="locations">
          <h2 id="locations">Locations</h2>
          {inventory.locations.length ? <ul className="gr-live-locations">{inventory.locations.map(location =>
            <li key={location.id}><strong>{location.name}</strong><span>{location.code} · {location.type}{!location.active ? ' · Inactive' : ''}</span></li>
          )}</ul> : <p>No locations have been created yet.</p>}
        </section>

        <section className="panel gr-live-panel" aria-labelledby="balances">
          <h2 id="balances">Stock balances</h2>
          {inventory.items.length ? (
            <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Stock balances by location">
              <table className="data-table gr-live-table">
                <thead><tr><th>Fragrance</th><th>Location</th><th>On hand</th><th>Reserved</th><th>Available</th></tr></thead>
                <tbody>{inventory.items.map(item => <tr key={item.variantId + ':' + item.locationId}>
                  <td><strong>{item.name}</strong><br />{[item.sku, item.sizeMl && item.sizeMl + ' ml'].filter(Boolean).join(' · ')}</td>
                  <td>{item.locationName}</td><td>{item.onHand}</td><td>{item.reserved}</td><td><strong>{item.available}</strong></td>
                </tr>)}</tbody>
              </table>
            </div>
          ) : <p>{offset ? 'No balances on this page.' : 'Balances appear once a product variant and location exist.'}</p>}
          {(offset > 0 || inventory.hasNext) && <nav className="gr-live-buttons" aria-label="Inventory pages">
            {offset > 0 && <Link className="gr-live-secondary" href={'/workspace/inventory?offset=' + Math.max(0, offset - inventory.pageSize)}>Previous</Link>}
            {inventory.hasNext && <Link className="gr-live-secondary" href={'/workspace/inventory?offset=' + (offset + inventory.pageSize)}>Next</Link>}
          </nav>}
        </section>
      </>}
    </div>
  );
}
