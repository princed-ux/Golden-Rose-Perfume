import type { Metadata } from 'next';
import ThemeProvider from '@/src/components/theme-provider';
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
  return <html lang="en" data-scroll-behavior="smooth"><body><ThemeProvider>{children}</ThemeProvider></body></html>;
}
