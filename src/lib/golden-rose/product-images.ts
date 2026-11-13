const projectOrigin = 'https://eixbmsethgrtezhdmgsh.supabase.co';
export const PRODUCT_IMAGE_PREFIX = projectOrigin + '/storage/v1/object/public/golden-rose-products/';

export function productImageUrl(path: unknown) {
  if (typeof path !== 'string' || path.length > 512) return null;
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || !/^[\p{L}\p{N} ._-]+$/u.test(part))) return null;
  if (!/\.(?:avif|webp|jpe?g|png)$/i.test(path)) return null;
  return PRODUCT_IMAGE_PREFIX + parts.map(encodeURIComponent).join('/');
}
