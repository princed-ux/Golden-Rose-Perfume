import type { Metadata } from 'next';
import { Suspense } from 'react';
import ThemeProvider, { SyncAccountAppearance } from '@/src/components/theme-provider';
import { Amara } from '@/src/components/amara';
import { getWhatsAppNumber } from '@/src/lib/customer/bag';
import { getCustomer } from '@/src/lib/customer/session';
import './globals.css';
import './starter.css';

export const metadata: Metadata = {
  applicationName: 'Golden Rose Perfume',
  title: {
    default: 'Golden Rose Perfume — Beauty Of Fragrance',
    template: '%s | Golden Rose Perfume',
  },
  description: 'An online destination for perfumes and fragrances.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const number = getWhatsAppNumber();
  return <html lang="en" data-scroll-behavior="smooth"><body><ThemeProvider>
    {children}
    <Suspense fallback={null}><AccountAppearance /></Suspense>
    <Suspense fallback={null}><Amara supportHref={number ? 'https://wa.me/' + number : null} /></Suspense>
  </ThemeProvider></body></html>;
}

async function AccountAppearance() {
  const customer = await getCustomer().catch(() => null);
  return customer ? <SyncAccountAppearance appearance={customer.appearance} /> : null;
}
