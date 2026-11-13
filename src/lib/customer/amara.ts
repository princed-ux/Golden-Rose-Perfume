export const AMARA_TOPICS = [
  {
    id: 'variants',
    title: 'Sizes and variants',
    reply: 'Open a fragrance to see its published sizes and prices. Choose your preferred variant and quantity before adding it to your bag.',
    links: [{ label: 'Browse fragrances', href: '/shop' }],
  },
  {
    id: 'checkout',
    title: 'How WhatsApp checkout works',
    reply: 'Review your bag and prepare a WhatsApp enquiry. Send it to Golden Rose in WhatsApp so the boutique can confirm availability, the final price and delivery.',
    links: [{ label: 'Open my bag', href: '/cart' }],
  },
  {
    id: 'account',
    title: 'Find my account and favourites',
    reply: 'Sign in to find your saved fragrances, order enquiries and appearance settings in My Account.',
    links: [{ label: 'My Account', href: '/account' }, { label: 'Saved fragrances', href: '/account/wishlist' }],
  },
] as const;

export function isAmaraPage(path: string) {
  return path === '/' || ['/shop', '/cart', '/checkout', '/account'].some(base =>
    path === base || path.startsWith(base + '/'));
}
