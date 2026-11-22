
import 'server-only';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import {
  canManageStockSetup,
  UUID,
} from '@/src/lib/golden-rose/contracts';

import {
  getStaffAccess,
} from '@/src/lib/golden-rose/staff';

import {
  createClient,
} from '@/src/lib/supabase/server';

const BUCKET = 'golden-rose-products';

const MAX_FILE_BYTES = 4_000_000;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 100_000;
const MAX_ALT_TEXT = 180;

const STORAGE_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|avif)$/i;

interface ImageRecord {
  storagePath: string;
  altText: string | null;
}

interface MediaResult {
  images?: ImageRecord[];
}

function response(
  payload: object,
  status = 200,
): Response {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
    },
  });
}

function allowedOrigin(request: Request): boolean {
  try {
    const origin = request.headers.get('origin');

    return Boolean(
      origin &&
      new URL(origin).origin ===
        new URL(request.url).origin,
    );
  } catch {
    return false;
  }
}

/**
 * Returns a Response when authorization fails,
 * or null when the staff member is authorized.
 *
 * An explicit return type prevents undefined
 * from reaching either HTTP handler.
 */
async function authorizationError(): Promise<Response | null> {
  const access = await getStaffAccess();

  if ('reason' in access) {
    return response(
      {
        error:
          access.reason === 'unavailable'
            ? 'Staff verification is temporarily unavailable.'
            : 'Sign in with an active staff account.',
      },
      access.reason === 'unavailable' ? 503 : 401,
    );
  }

  if (!canManageStockSetup(access.role)) {
    return response(
      {
        error:
          'Only owners and managers can manage product photos.',
      },
      403,
    );
  }

  return null;
}

/**
 * Limit the complete HTTP body before parsing multipart.
 * This prevents an oversized request from reaching
 * request.formData() without a size limit.
 */
async function boundedMultipart(
  request: Request,
): Promise<FormData> {
  const type =
    request.headers.get('content-type') ?? '';

  if (
    !/^multipart\/form-data;\s*boundary=/i.test(type)
  ) {
    throw new Error(
      'Upload an image using the product photo form.',
    );
  }

  const declared = Number(
    request.headers.get('content-length'),
  );

  if (
    Number.isFinite(declared) &&
    declared > MAX_BODY_BYTES
  ) {
    throw new Error(
      'Choose an image smaller than 4 MB.',
    );
  }

  if (!request.body) {
    throw new Error(
      'Choose a product photograph.',
    );
  }

  const reader = request.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let received = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      received += value.byteLength;

      if (received > MAX_BODY_BYTES) {
        await reader.cancel(
          'Product photo upload too large.',
        );

        throw new Error(
          'Choose an image smaller than 4 MB.',
        );
      }

      const chunk = new Uint8Array(
        new ArrayBuffer(value.byteLength),
      );

      chunk.set(value);
      chunks.push(chunk.buffer);
    }
  } finally {
    reader.releaseLock();
  }

  const multipart = new Response(
    new Blob(chunks, { type }),
  );

  return multipart.formData();
}

/**
 * Detect the file type from its binary signature.
 * Do not trust a filename extension alone.
 */
function imageType(
  bytes: Uint8Array,
): {
  mime: string;
  extension: string;
} | null {
  if (bytes.length < 16) {
    return null;
  }

  // JPEG
  if (
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return {
      mime: 'image/jpeg',
      extension: 'jpg',
    };
  }

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      mime: 'image/png',
      extension: 'png',
    };
  }

  const ascii = (
    start: number,
    end: number,
  ): string =>
    String.fromCharCode(
      ...bytes.subarray(start, end),
    );

  // WebP
  if (
    ascii(0, 4) === 'RIFF' &&
    ascii(8, 12) === 'WEBP'
  ) {
    return {
      mime: 'image/webp',
      extension: 'webp',
    };
  }

  // AVIF
  if (
    ascii(4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(ascii(8, 12))
  ) {
    return {
      mime: 'image/avif',
      extension: 'avif',
    };
  }

  return null;
}

function mediaError(code?: string): Response {
  if (
    code === 'PGRST202' ||
    code === '42883'
  ) {
    return response(
      {
        error:
          'Product photography is not installed in the database.',
      },
      503,
    );
  }

  if (
    code === 'GR403' ||
    code === '42501'
  ) {
    return response(
      {
        error:
          'This account is not authorized to manage product photos.',
      },
      403,
    );
  }

  if (code === 'GR404') {
    return response(
      {
        error:
          'The product or photograph was not found.',
      },
      404,
    );
  }

  if (code === 'GR409') {
    return response(
      {
        error:
          'The photograph is already attached or the product has reached its photo limit.',
      },
      409,
    );
  }

  if (code === 'GR422') {
    return response(
      {
        error:
          'The uploaded photograph could not be verified.',
      },
      422,
    );
  }

  return response(
    {
      error:
        'The product photo could not be saved. Refresh and try again.',
    },
    502,
  );
}

function refreshProductPages(): void {
  revalidatePath('/workspace/products');
  revalidatePath('/shop');
  revalidatePath('/shop/[slug]', 'page');
  revalidatePath('/');
}

/**
 * Upload a photograph and attach it to an existing,
 * active catalogue product.
 */
export async function POST(
  request: Request,
): Promise<Response> {
  if (!allowedOrigin(request)) {
    return response(
      { error: 'Invalid upload origin.' },
      403,
    );
  }

  const denied = await authorizationError();

  if (denied) {
    return denied;
  }

  let form: FormData;

  try {
    form = await boundedMultipart(request);
  } catch (error) {
    return response(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Invalid image upload.',
      },
      413,
    );
  }

  const productId = form.get('productId');
  const description = form.get('altText');
  const file = form.get('image');

  if (
    typeof productId !== 'string' ||
    !UUID.test(productId) ||
    (
      description !== null &&
      typeof description !== 'string'
    ) ||
    (
      typeof description === 'string' &&
      description.length > MAX_ALT_TEXT
    ) ||
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > MAX_FILE_BYTES
  ) {
    return response(
      {
        error:
          'Choose a valid product and a photograph smaller than 4 MB.',
      },
      400,
    );
  }

  const bytes = new Uint8Array(
    await file.arrayBuffer(),
  );

  const type = imageType(bytes);

  if (
    !type ||
    (
      file.type &&
      file.type !== type.mime
    )
  ) {
    return response(
      {
        error:
          'Only genuine JPG, PNG, WebP and AVIF photographs are accepted.',
      },
      415,
    );
  }

  const storagePath =
    `${productId}/${randomUUID()}.${type.extension}`;

  const client = await createClient();

  const uploaded = await client.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: type.mime,
      upsert: false,
      cacheControl: '3600',
    });

  if (uploaded.error) {
    return response(
      {
        error:
          'Photo storage rejected the upload. Verify the product photography migration and staff permissions.',
      },
      502,
    );
  }

  try {
    const { data, error } = await client.rpc(
      'gr_manage_product_media',
      {
        p_action: 'attach',
        p_product_id: productId,
        p_storage_path: storagePath,
        p_alt_text:
          typeof description === 'string' &&
          description.trim()
            ? description.trim()
            : null,
      },
    );

    if (
      error ||
      !data ||
      !Array.isArray(
        (data as MediaResult).images,
      )
    ) {
      // An uploaded object alone does not represent
      // a valid catalogue photograph.
      await client.storage
        .from(BUCKET)
        .remove([storagePath]);

      return mediaError(error?.code);
    }

    refreshProductPages();

    return response({
      success: true,
      message:
        'Photograph saved. It will appear in the customer shop when this product is published.',
      images: (data as MediaResult).images,
    });
  } catch {
    await client.storage
      .from(BUCKET)
      .remove([storagePath]);

    return response(
      {
        error:
          'The photograph could not be attached. Refresh before retrying.',
      },
      502,
    );
  }
}

/**
 * Detach the product photo before deleting the
 * underlying storage object. Customer listings
 * stop referencing it immediately.
 */
export async function DELETE(
  request: Request,
): Promise<Response> {
  if (!allowedOrigin(request)) {
    return response(
      { error: 'Invalid request origin.' },
      403,
    );
  }

  const denied = await authorizationError();

  if (denied) {
    return denied;
  }

  const length = Number(
    request.headers.get('content-length'),
  );

  if (
    Number.isFinite(length) &&
    length > 2048
  ) {
    return response(
      { error: 'Invalid photo request.' },
      413,
    );
  }

  let payload: Record<string, unknown>;

  try {
    const raw = await request.text();

    if (raw.length > 2048) {
      return response(
        { error: 'Invalid photo request.' },
        413,
      );
    }

    const parsed: unknown = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return response(
        { error: 'Invalid photo request.' },
        400,
      );
    }

    payload = parsed as Record<string, unknown>;
  } catch {
    return response(
      { error: 'Invalid photo request.' },
      400,
    );
  }

  const productId = payload.productId;
  const storagePath = payload.storagePath;

  if (
    typeof productId !== 'string' ||
    !UUID.test(productId) ||
    typeof storagePath !== 'string' ||
    !STORAGE_PATH.test(storagePath) ||
    !storagePath.startsWith(`${productId}/`)
  ) {
    return response(
      { error: 'Invalid photo selection.' },
      400,
    );
  }

  const client = await createClient();

  const { data, error } = await client.rpc(
    'gr_manage_product_media',
    {
      p_action: 'remove',
      p_product_id: productId,
      p_storage_path: storagePath,
      p_alt_text: null,
    },
  );

  if (
    error ||
    !data ||
    !Array.isArray(
      (data as MediaResult).images,
    )
  ) {
    return mediaError(error?.code);
  }

  const deleted = await client.storage
    .from(BUCKET)
    .remove([storagePath]);

  refreshProductPages();

  return response({
    success: true,
    message: deleted.error
      ? 'Photo removed from the product. Storage cleanup requires administrator review.'
      : 'Photo removed successfully.',
    images: (data as MediaResult).images,
  });
}
