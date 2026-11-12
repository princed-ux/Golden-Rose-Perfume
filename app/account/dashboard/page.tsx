import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, House, Package, Settings2, ShoppingBag, UserRound } from 'lucide-react';
import { requireCustomer } from '@/src/lib/customer/session';
import { CustomerSignOut } from '@/src/components/customer-auth-form';
import { AuthNotice } from '../auth-notice';
import './page.css';

const navigation = [
  { label: 'Overview', href: '/account/dashboard', Icon: House },
  { label: 'My orders', href: '/account/orders', Icon: Package },
  { label: 'Account settings', href: '/account/settings', Icon: Settings2 },
];

async function CustomerOverview({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const customer = await requireCustomer();

  return (
    <div className="gr-customer-dashboard min-h-screen pb-20">
      <header className="gr-account-header">
        <div className="mx-auto flex min-h-20 max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 sm:px-7 lg:px-9">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="Golden Rose Perfume homepage">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#b89554]/60 bg-black p-1">
              <Image src="/assets/brand/golden-rose-logo.png" alt="" width={42} height={46} className="h-full w-auto object-contain" />
            </span>
            <span className="gr-account-wordmark flex min-w-0 flex-col gap-1 font-serif text-[15px] tracking-[.1em] sm:text-xl">
              GOLDEN ROSE<small className="font-sans text-[7px] tracking-[.23em]">BEAUTY OF FRAGRANCE</small>
            </span>
          </Link>
          <nav aria-label="Store navigation" className="flex items-center gap-4 sm:gap-7">
            <Link href="/shop" className="flex min-h-11 items-center gap-2 text-xs">Shop</Link>
            <Link href="/cart" aria-label="Shopping bag" className="flex min-h-11 items-center gap-2 text-xs">
              <ShoppingBag size={18} aria-hidden="true" /><span className="hidden sm:inline">Bag</span>
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="gr-account-sidebar flex min-w-0 flex-col px-3 py-3 lg:px-4 lg:pt-7">
          <div className="hidden px-3 lg:block"><h2 className="font-serif text-2xl">My Account</h2><span className="gr-account-rule mt-4 mb-6 block h-px w-9" /></div>
          <nav aria-label="Customer account navigation" className="flex flex-wrap gap-1.5 lg:flex-col">
            {navigation.map(({ label, href, Icon }, index) =>
              <Link key={href} href={href} aria-current={index === 0 ? 'location' : undefined}
                className="gr-account-nav-link flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-xs">
                <Icon size={18} strokeWidth={1.4} aria-hidden="true" />{label}
              </Link>
            )}
          </nav>
          <div className="gr-sidebar-botanical pointer-events-none mt-auto hidden select-none pt-12 lg:block" aria-hidden="true">
            <div className="gr-dashboard-rose" />
          </div>
        </aside>
        <main className="min-w-0 px-4 pt-6 sm:px-6 lg:px-7 lg:pt-7 xl:px-8">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="max-w-full break-words font-serif text-3xl sm:text-4xl">Welcome{customer.name ? ', ' + customer.name : ' back'}.</h1>
            <CustomerSignOut />
          </header>
          <AuthNotice searchParams={searchParams} />
          <div className="grid gap-5 xl:grid-cols-2">
            <section className="gr-account-panel min-w-0 rounded-xl p-5 sm:p-6" aria-labelledby="profile-heading">
              <h2 id="profile-heading" className="flex items-center gap-3 font-serif text-xl">
                <UserRound size={21} className="gr-account-gold" aria-hidden="true" /> Your account
              </h2>
              <dl className="mt-4 grid gap-3 text-sm">
                {customer.name && <div><dt className="gr-account-muted">Name</dt><dd className="break-words">{customer.name}</dd></div>}
                {customer.email && <div><dt className="gr-account-muted">Signed-in email</dt><dd className="break-all">{customer.email}</dd></div>}
              </dl>
              <Link href="/account/settings" className="gr-account-text-link mt-4 inline-flex items-center gap-2 text-sm">
                Account settings <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </section>
            <section className="gr-account-panel rounded-xl p-5 sm:p-6">
              <h2 className="font-serif text-xl">Order updates</h2>
              <p className="gr-account-muted mt-3 text-sm leading-7">For orders requested through WhatsApp, check your conversation with Golden Rose for confirmation and delivery updates.</p>
              <Link href="/shop" className="gr-account-text-link mt-4 inline-flex items-center gap-2 text-sm">
                Explore fragrances <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function Dashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  return <Suspense fallback={<p className="container page-spacing" role="status">Loading your account…</p>}>
    <CustomerOverview searchParams={searchParams} />
  </Suspense>;
}
