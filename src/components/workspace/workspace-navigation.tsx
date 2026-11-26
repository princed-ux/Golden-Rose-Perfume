'use client';

import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';

import Image from 'next/image';

import {
  usePathname,
  useRouter,
} from 'next/navigation';

import {
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';

import type {
  SuiteModuleId,
  WorkspaceModule,
} from './workspace-model';

import type {
  DelegatedModuleId,
} from '@/src/domain/workspace-delegation';

/* =========================================================
   GOLDEN ROSE — WORKSPACE NAVIGATION
   ========================================================= */

interface DelegatedNavigationItem {
  id: DelegatedModuleId;
  label: string;
  href: string;
  icon: LucideIcon;
}

const delegatedItems: readonly DelegatedNavigationItem[] = [
  {
    id: 'wholesale',
    label: 'Wholesale Sales',
    href: '/workspace/wholesale',
    icon: PackageCheck,
  },
  {
    id: 'dispatch',
    label: 'Dispatch Management',
    href: '/workspace/dispatch',
    icon: Truck,
  },
  {
    id: 'invoices',
    label: 'Invoices & Quotes',
    href: '/workspace/invoices',
    icon: ReceiptText,
  },
  {
    id: 'permissions',
    label: 'Staff Permissions',
    href: '/workspace/permissions',
    icon: ShieldCheck,
  },
];

/* =========================================================
   VERIFIED SERVER NAVIGATION CONTEXT
   ========================================================= */

const DelegatedNavigationContext =
  createContext<
    readonly DelegatedModuleId[] | null
  >(null);

export function WorkspaceNavigationAccess({
  modules,
  children,
}: {
  modules: readonly DelegatedModuleId[];
  children: ReactNode;
}) {
  return (
    <DelegatedNavigationContext.Provider value={modules}>
      {children}
    </DelegatedNavigationContext.Provider>
  );
}

/* =========================================================
   WORKSPACE BRANDING
   ========================================================= */

export function WorkspaceBrand() {
  return (
    <div className="owner-brand">
      <span className="owner-brand-logo">
        <Image
          src="/assets/brand/golden-rose-logo.png"
          alt=""
          width={40}
          height={44}
        />
      </span>

      <span className="owner-wordmark">
        Golden Rose
      </span>

      <span className="owner-brand-tagline">
        Beauty of Fragrance
      </span>
    </div>
  );
}

/* =========================================================
   ROUTE MATCHING
   ========================================================= */

function matchesRoute(
  pathname: string | null,
  href: string,
): boolean {
  return Boolean(
    pathname &&
    (
      pathname === href ||
      pathname.startsWith(href + '/')
    ),
  );
}

/* =========================================================
   NAVIGATION BUTTON
   ========================================================= */

function NavigationButton({
  label,
  icon: Icon,
  active,
  navigate,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  navigate: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={navigate}
    >
      <Icon
        size={18}
        strokeWidth={1.65}
        aria-hidden="true"
      />

      <span>{label}</span>
    </button>
  );
}

/* =========================================================
   WORKSPACE NAVIGATION
   ========================================================= */

export function WorkspaceNavigation({
  label,
  modules,
  active,
  onNavigate,
}: {
  label: string;
  modules: readonly WorkspaceModule[];
  active: SuiteModuleId;
  onNavigate: (id: SuiteModuleId) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const delegated = useContext(
    DelegatedNavigationContext,
  );

  /*
   * The preview workspace has no authenticated
   * permission context. Preserve its role preview.
   */

  const livePermissions = delegated !== null;

  const authorized = new Set(
    delegated ?? [],
  );

  /*
   * Invoice permissions may override the original
   * role in either direction.
   */

  const visibleModules = modules.filter(item => {
    if (
      livePermissions &&
      item.id === 'invoices'
    ) {
      return authorized.has('invoices');
    }

    return true;
  });

  const isDelegatedRoute =
    livePermissions &&
    delegatedItems.some(item =>
      matchesRoute(pathname, item.href),
    );

  function renderDelegated(
    id: DelegatedModuleId,
  ) {
    const item = delegatedItems.find(
      entry => entry.id === id,
    );

    if (!item || !authorized.has(id)) {
      return null;
    }

    return (
      <NavigationButton
        key={item.id}
        label={item.label}
        icon={item.icon}
        active={matchesRoute(pathname, item.href)}
        navigate={() => {
          if (authorized.has(id)) {
            router.push(item.href);
          }
        }}
      />
    );
  }

  const hasOrders = visibleModules.some(
    item => item.id === 'orders',
  );

  const hasInvoices = visibleModules.some(
    item => item.id === 'invoices',
  );

  const hasStaff = visibleModules.some(
    item => item.id === 'staff',
  );

  return (
    <nav
      className="owner-nav"
      aria-label={label}
    >
      {visibleModules.flatMap(item => {
        /*
         * Invoice navigation must use the verified
         * permission rather than the old role guard.
         */

        if (
          livePermissions &&
          item.id === 'invoices'
        ) {
          return [renderDelegated('invoices')];
        }

        const entries = [
          <NavigationButton
            key={item.id}
            label={item.label}
            icon={item.icon}
            active={
              !isDelegatedRoute &&
              active === item.id
            }
            navigate={() => onNavigate(item.id)}
          />,
        ];

        if (item.id === 'orders') {
          return [
            ...entries,
            renderDelegated('wholesale'),
            renderDelegated('dispatch'),
            !hasInvoices
              ? renderDelegated('invoices')
              : null,
          ];
        }

        if (item.id === 'staff') {
          return [
            ...entries,
            renderDelegated('permissions'),
          ];
        }

        return entries;
      })}

      {/*
       * Employees without Sales & Orders may still
       * receive wholesale, dispatch or invoice access.
       */}

      {!hasOrders && (
        <>
          {renderDelegated('wholesale')}
          {renderDelegated('dispatch')}

          {!hasInvoices &&
            renderDelegated('invoices')}
        </>
      )}

      {!hasStaff &&
        renderDelegated('permissions')}
    </nav>
  );
}