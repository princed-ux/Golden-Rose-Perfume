'use client';

import { usePathname } from 'next/navigation';
import { SiteHeader } from '@/src/components/site-header';
import './public-header-bridge.css';

/**
 * Compatibility boundary for the three editorial pages with legacy inline
 * headers. Other customer pages already import SiteHeader directly.
 *
 * This does not change public shopping logic, page data or workspace screens.
 * When those three pages are fully refactored, replace their inline Header
 * functions with SiteHeader and remove this bridge and its CSS.
 */
export function PublicHeaderBridge() {
  const pathname = usePathname();
  if (pathname !== '/' && pathname !== '/shop' && pathname !== '/about') {
    return null;
  }

  return (
    <div className="gr-public-header-bridge">
      <SiteHeader />
    </div>
  );
}