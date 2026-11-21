import 'server-only';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { canManageStockSetup, UUID } from '@/src/lib/golden-rose/contracts';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';
import { createClient } from '@/src/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'golden-rose-products';
const MAX_FILE_BYTES = 4_000_000;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 100_000;
const NAME_LIMIT = 180;

type Image = { storagePath: string; altText: string | null };
type MediaResult = { images?: Image[] };

function response(payload: object, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function allowedOrigin(request: Request) {
  try {
    const origin = request.headers.get('origin');
    return !!origin && new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function authorized() {
  const access = await getStaffAccess();
  if ('reason' in access) {
    return { error: response(
      { error: access.reason === 'unavailable' ? 'Staff verification is unavailable.' : 'Sign in with an active staff account.' },
      access.reason === 'unavailable' ? 503 : 401,
    ) };
  }
  if (!canManageStockSetup(access.role)) {
    return { error: response({ error: 'Only owners and managers can manage product photos.' }, 403) };
  }
  return { access };
}

async function boundedMultipart(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) {
    throw new Error('Upload an image using a multipart form.');
  }
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Error('Choose a photo smaller than 4 MB.');
  }
  if (!request.body) throw new Error('Choose an image to upload.');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > MAX_BODY_BYTES) {
        await reader.cancel('Image upload exceeded the size limit.');
        throw new Error('Choose a photo smaller than 4 MB.');
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }

  // Parsing happens only after the entire request passes the size limit.
  const parts = new Response(new Blob(chunks, { type: contentType }));
  return parts.formData();
}

function fileType(buffer: Uint8Array): { mime: string; ext: string } | null {
  if (buffer.length < 16) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e &&
    buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a &&
    buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return { mime: 'image/png', ext: 'png' };
  if (
    String.fromCharCode(...buffer.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...buffer.subarray(8, 12)) === 'WEBP'
  ) return { mime: 'image/webp', ext: 'webp' };
  if (
    String.fromCharCode(...buffer.subarray(4, 8)) === 'ftyp' &&
    ['avif', 'avis'].includes(String.fromCharCode(...buffer.subarray(8, 12)))
  ) return { mime: 'image/avif', ext: 'avif' };
  return null;
}

function mediaError(code?: string) {
  if (code === 'PGRST202' || code === '42883') {
    return response({ error: 'Product photo management is awaiting its reviewed database migration.' }, 503);
  }
  if (code === 'GR403' || code === '42501') {
    return response({ error: 'This staff account is not authorized to manage product photos.' }, 403);
  }
  if (code === 'GR404') return response({ error: 'This product or photo was not found.' }, 404);
  if (code === 'GR409') return response({ error: 'Photo limit or duplicate image. Refresh the product and try again.' }, 409);
  return response({ error: 'The product photo could not be saved. Refresh and retry.' }, 502);
}

function refreshProductPages() {
  revalidatePath('/workspace/products');
  revalidatePath('/shop');
  revalidatePath('/shop/[slug]', 'page');
  revalidatePath('/');
}

export async function POST(request: Request) {
  if (!allowedOrigin(request)) return response({ error: 'Invalid upload origin.' }, 403);
  const auth = await authorized();
  if ('error' in auth) return auth.error;

  let form: FormData;
  try {
    form = await boundedMultipart(request);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Invalid image upload.' }, 413);
  }

  const id = form.get('productId');
  const alt = form.get('altText');
  const file = form.get('image');

  if (typeof id !== 'string' || !UUID.test(id) ||
      (alt !== null && typeof alt !== 'string') ||
      (typeof alt === 'string' && alt.length > NAME_LIMIT) ||
      !(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES) {
    return response({ error: 'Choose a valid product and photo smaller than 4 MB.' }, 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = fileType(bytes);
  if (!detected || (file.type && file.type !== detected.mime)) {
    return response({ error: 'Only genuine JPG, PNG, WebP and AVIF product photos are accepted.' }, 415);
  }

  const storagePath = id + '/' + randomUUID() + '.' + detected.ext;
  const client = await createClient();
  const uploaded = await client.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: detected.mime,
    upsert: false,
    cacheControl: '3600',
  });
  if (uploaded.error) {
    return response({ error: 'Photo upload failed. Verify the media storage migration and try again.' }, 502);
  }

  try {
    const { data, error } = await client.rpc('gr_manage_product_media', {
      p_action: 'attach',
      p_product_id: id,
      p_storage_path: storagePath,
      p_alt_text: (typeof alt === 'string' && alt.trim()) ? alt.trim() : null,
    });
    if (error || !data || !Array.isArray((data as MediaResult).images)) {
      // Fail closed: an object alone must never appear as an attached photo.
      await client.storage.from(BUCKET).remove([storagePath]);
      return mediaError(error?.code);
    }
    refreshProductPages();
    return response({
      success: true,
      message: 'Product photo saved. It will appear online when the product is published.',
      images: (data as MediaResult).images,
    });
  } catch {
    await client.storage.from(BUCKET).remove([storagePath]);
    return response({ error: 'Photo upload could not be confirmed. Retry after refreshing.' }, 502);
  }
}

export async function DELETE(request: Request) {
  if (!allowedOrigin(request)) return response({ error: 'Invalid request origin.' }, 403);
  const auth = await authorized();
  if ('error' in auth) return auth.error;
  if (Number(request.headers.get('content-length') ?? 0) > 2048) {
    return response({ error: 'Invalid photo request.' }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ error: 'Invalid photo request.' }, 400);
  }
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const id = payload.productId;
  const storagePath = payload.storagePath;

  if (typeof id !== 'string' || !UUID.test(id) ||
      typeof storagePath !== 'string' ||
      !storagePath.startsWith(id + '/') ||
      !new RegExp('^[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|png|webp|avif)$','i').test(storagePath)) {
    return response({ error: 'Invalid product photo selection.' }, 400);
  }

  const client = await createClient();
  const { data, error } = await client.rpc('gr_manage_product_media', {
    p_action: 'remove',
    p_product_id: id,
    p_storage_path: storagePath,
    p_alt_text: null,
  });
  if (error || !data || !Array.isArray((data as MediaResult).images)) {
    return mediaError(error?.code);
  }

  // Metadata removal is authoritative. Storage cleanup happens afterward.
  // Never restore a deleted catalogue association after a cleanup error.
  const removed = await client.storage.from(BUCKET).remove([storagePath]);
  refreshProductPages();
  return response({
    success: true,
    message: removed.error
      ? 'Photo removed from the product. Storage cleanup needs administrator review.'
      : 'Photo removed from the product.',
    images: (data as MediaResult).images,
  });
}
