
import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  ArrowRight,
  Box,
  CheckCircle2,
  ClipboardList,
  MapPin,
  ScanBarcode,
  ShieldCheck,
  ShoppingBag,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';

import { canViewModule } from '@/src/domain/permissions';
import { WorkspacePageHeader } from '@/src/components/workspace/page-layout';
import { requireStaff } from '@/src/lib/golden-rose/staff';

import {
  getAdminProductsPage,
  getInventoryPage,
} from '@/src/lib/golden-rose/edge';

import './executive-overview.css';

type CheckState =
  | 'ready'
  | 'needs-setup'
  | 'unavailable'
  | 'restricted';

export default async function WorkspaceOverview() {
  const { role, token } = await requireStaff();

  if (!canViewModule(role, 'overview')) {
    redirect(
      canViewModule(role, 'pos')
        ? '/workspace/pos'
        : '/staff/login',
    );
  }

  const catalogueAllowed = canViewModule(role, 'products');
  const inventoryAllowed = canViewModule(role, 'inventory');

  // Read a small catalogue page rather than downloading
  // thousands of products simply to render the dashboard.
  const [catalogue, inventory] = await Promise.all([
    catalogueAllowed
      ? getAdminProductsPage(token, 0, 1)
          .then(items => ({
            available: true,
            hasProducts: items.length > 0,
          }))
          .catch(() => ({
            available: false,
            hasProducts: false,
          }))
      : Promise.resolve(null),

    inventoryAllowed
      ? getInventoryPage(token, 0)
          .then(snapshot => ({
            available: true,
            locations: snapshot.locations,
          }))
          .catch(() => ({
            available: false,
            locations: [],
          }))
      : Promise.resolve(null),
  ]);

  const activeLocations =
    inventory?.available
      ? inventory.locations.filter(location => location.active).length
      : null;

  const catalogueState: CheckState =
    !catalogueAllowed
      ? 'restricted'
      : !catalogue?.available
        ? 'unavailable'
        : catalogue.hasProducts
          ? 'ready'
          : 'needs-setup';

  const locationState: CheckState =
    !inventoryAllowed
      ? 'restricted'
      : !inventory?.available
        ? 'unavailable'
        : activeLocations !== null && activeLocations > 0
          ? 'ready'
          : 'needs-setup';

  const registerState: CheckState =
    !canViewModule(role, 'pos')
      ? 'restricted'
      : locationState === 'needs-setup'
        ? 'needs-setup'
        : locationState === 'unavailable'
          ? 'unavailable'
          : 'ready';

  function stateLabel(state: CheckState) {
    switch (state) {
      case 'ready':
        return 'Connected';
      case 'needs-setup':
        return 'Needs setup';
      case 'restricted':
        return 'Restricted';
      default:
        return 'Unavailable';
    }
  }

  return (
    <section className="gr-executive" aria-labelledby="gr-executive-title">
      <WorkspacePageHeader id="gr-executive-title" level="h2" kicker="Golden Rose / Daily operations"
        title="Your business at a glance" description="Review your connected business systems and jump directly into the work that needs attention."
        actions={<span className="gr-executive-indicator">
          <ShieldCheck size={16} />
          Authenticated workspace
        </span>} />

      <div className="gr-executive-summary">
        <article className="gr-executive-item">
          <span className="gr-executive-item-icon">
            <Box size={20} />
          </span>

          <div>
            <span className="gr-executive-label">
              Product catalogue
            </span>

            <strong>
              {catalogueState === 'ready'
                ? 'Products detected'
                : catalogueState === 'needs-setup'
                  ? 'No products yet'
                  : stateLabel(catalogueState)}
            </strong>

            <small>
              {catalogueState === 'ready'
                ? 'Catalogue records are accessible.'
                : 'Open Products to review catalogue data.'}
            </small>
          </div>

          <span
            className="gr-executive-state"
            data-state={catalogueState}
          >
            {stateLabel(catalogueState)}
          </span>
        </article>

        <article className="gr-executive-item">
          <span className="gr-executive-item-icon">
            <MapPin size={20} />
          </span>

          <div>
            <span className="gr-executive-label">
              Selling locations
            </span>

            <strong>
              {activeLocations !== null
                ? `${activeLocations} active`
                : stateLabel(locationState)}
            </strong>

            <small>
              Physical POS sales require an active location.
            </small>
          </div>

          <span
            className="gr-executive-state"
            data-state={locationState}
          >
            {stateLabel(locationState)}
          </span>
        </article>

        <article className="gr-executive-item">
          <span className="gr-executive-item-icon">
            <ScanBarcode size={20} />
          </span>

          <div>
            <span className="gr-executive-label">
              Point of Sale
            </span>

            <strong>
              {registerState === 'needs-setup'
                ? 'Store setup required'
                : registerState === 'ready'
                  ? 'Open register'
                  : stateLabel(registerState)}
            </strong>

            <small>
              POS transactions require separate payment
              and stock verification.
            </small>
          </div>

          <span
            className="gr-executive-state"
            data-state={registerState}
          >
            {stateLabel(registerState)}
          </span>
        </article>
      </div>

      <div className="gr-executive-workflow">
        <section className="gr-executive-panel">
          <div className="gr-executive-panel-heading">
            <div>
              <h3>Continue your operations</h3>
              <p>Open an authorized business module.</p>
            </div>
            <ClipboardList size={20} />
          </div>

          <div className="gr-executive-links">
            {canViewModule(role, 'products') && (
              <Link href="/workspace/products">
                <Box size={18} />
                <span>
                  <strong>Review products</strong>
                  <small>Catalogue, variants and barcodes</small>
                </span>
                <ArrowRight size={17} />
              </Link>
            )}

            {canViewModule(role, 'inventory') && (
              <Link href="/workspace/inventory">
                <MapPin size={18} />
                <span>
                  <strong>Manage inventory</strong>
                  <small>Locations and stock receiving</small>
                </span>
                <ArrowRight size={17} />
              </Link>
            )}

            {canViewModule(role, 'pos') && (
              <Link href="/workspace/pos">
                <ScanBarcode size={18} />
                <span>
                  <strong>Open Point of Sale</strong>
                  <small>Register, barcode scanner and calculator</small>
                </span>
                <ArrowRight size={17} />
              </Link>
            )}

            {role === 'owner' && (
              <Link href="/workspace/staff">
                <UsersRound size={18} />
                <span>
                  <strong>Staff Management</strong>
                  <small>Owner-controlled employee access</small>
                </span>
                <ArrowRight size={17} />
              </Link>
            )}

            {canViewModule(role, 'orders') && (
              <Link href="/workspace/orders">
                <ShoppingBag size={18} />
                <span>
                  <strong>Sales &amp; Orders</strong>
                  <small>Sales records and order operations</small>
                </span>
                <ArrowRight size={17} />
              </Link>
            )}
          </div>
        </section>

        <section className="gr-executive-panel">
          <div className="gr-executive-panel-heading">
            <div>
              <h3>Business readiness</h3>
              <p>What still needs to be connected.</p>
            </div>
            <ShieldCheck size={20} />
          </div>

          <div className="gr-executive-checks">
            <div>
              {catalogueState === 'ready' ? (
                <CheckCircle2 size={19} className="is-ready" />
              ) : (
                <TriangleAlert size={19} />
              )}

              <span>
                <strong>Catalogue access</strong>
                <small>
                  {catalogueState === 'ready'
                    ? 'Available for staff catalogue operations.'
                    : 'Requires a valid catalogue connection or data.'}
                </small>
              </span>
            </div>

            <div>
              {locationState === 'ready' ? (
                <CheckCircle2 size={19} className="is-ready" />
              ) : (
                <TriangleAlert size={19} />
              )}

              <span>
                <strong>Physical store location</strong>
                <small>
                  {locationState === 'ready'
                    ? 'An active location is configured.'
                    : 'Check Inventory to configure a location.'}
                </small>
              </span>
            </div>

            <div>
              <TriangleAlert size={19} />

              <span>
                <strong>Financial reporting</strong>
                <small>
                  Revenue, profit and sales charts must use
                  verified transaction data.
                </small>
              </span>
            </div>
          </div>

          <p className="gr-executive-note">
            These checks indicate system connectivity and
            setup. They are not a certification that cash
            settlement, stock accounting or reporting
            integrations have passed acceptance testing.
          </p>
        </section>
      </div>
    </section>
  );
}
