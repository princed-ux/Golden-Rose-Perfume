import { NextResponse } from 'next/server';

/* =========================================================
   GOLDEN ROSE PERFUME — CONTACT API

   Compatible with Next.js Cache Components.

   POST requests are handled dynamically without
   incompatible route-segment configuration exports.
   ========================================================= */

const EMAIL =
  /^[^\s@\r\n<>]+@[^\s@\r\n<>]+\.[^\s@\r\n<>]+$/;

const MAX_BODY_BYTES = 16_384;

type Enquiry = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown;
};

/* =========================================================
   FIELD VALIDATION
   ========================================================= */

function field(
  value: unknown,
  max: number,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim();

  return (
    cleaned &&
    cleaned.length <= max
  )
    ? cleaned
    : null;
}

/* =========================================================
   LIMITED REQUEST BODY

   Reject oversized bodies while reading, rather than
   allocating an arbitrarily large request in memory.
   ========================================================= */

async function limitedJsonBody(
  request: Request,
): Promise<string | null> {
  if (!request.body) {
    return null;
  }

  const reader =
    request.body.getReader();

  const chunks: Uint8Array[] = [];

  let total = 0;

  try {
    while (true) {
      const {
        done,
        value,
      } = await reader.read();

      if (done) {
        break;
      }

      total += value.byteLength;

      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(
          () => undefined,
        );

        return null;
      }

      chunks.push(value);
    }

    const bytes =
      new Uint8Array(total);

    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);

      offset += chunk.byteLength;
    }

    return new TextDecoder().decode(bytes);

  } finally {
    reader.releaseLock();
  }
}

/* =========================================================
   STANDARD ERROR RESPONSE
   ========================================================= */

function response(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      ok: false,
      message,
    },
    {
      status,

      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

/* =========================================================
   CONTACT FORM SUBMISSION

   Customer messages are sent through the configured
   email provider.

   Provider credentials remain on the server.

   Success is returned only after the provider accepts
   the message. Acceptance does not guarantee delivery
   to the recipient's inbox.
   ========================================================= */

export async function POST(
  request: Request,
) {
  const apiKey =
    process.env.RESEND_API_KEY?.trim();

  const to =
    process.env.GOLDEN_ROSE_CONTACT_TO_EMAIL?.trim();

  const from =
    process.env.GOLDEN_ROSE_CONTACT_FROM_EMAIL?.trim();

  /* Verify server configuration. */

  if (
    !apiKey ||
    !to ||
    !from ||
    !EMAIL.test(to) ||
    !EMAIL.test(from)
  ) {
    return response(
      'Online messaging is not configured yet. Please use one of the direct contact options.',
      503,
    );
  }

  /* Accept JSON submissions only. */

  const contentType =
    request.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();

  if (contentType !== 'application/json') {
    return response(
      'Invalid message format.',
      415,
    );
  }

  /* Early request-size validation. */

  const reportedLength = Number(
    request.headers.get(
      'content-length',
    ) ?? 0,
  );

  if (
    Number.isFinite(reportedLength) &&
    reportedLength > MAX_BODY_BYTES
  ) {
    return response(
      'Your message is too long.',
      413,
    );
  }

  /* Parse the submitted enquiry. */

  let payload: Enquiry;

  try {
    const raw =
      await limitedJsonBody(request);

    if (raw === null) {
      return response(
        'Your message is too long.',
        413,
      );
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return response(
        'Please check the contact form.',
        400,
      );
    }

    payload =
      parsed as Enquiry;

  } catch {
    return response(
      'Please check the contact form.',
      400,
    );
  }

  /* =======================================================
     HONEYPOT

     The website field is hidden from legitimate users.
     Automated submissions that fill it are rejected.
     ======================================================= */

  if (payload.website) {
    return response(
      'Invalid submission.',
      400,
    );
  }

  /* =======================================================
     CUSTOMER DETAILS
     ======================================================= */

  const name =
    field(payload.name, 100);

  const email =
    field(payload.email, 254);

  const phone =
    typeof payload.phone === 'string'
      ? payload.phone.trim()
      : '';

  const subject =
    field(payload.subject, 140);

  const message =
    field(payload.message, 4000);

  if (
    !name ||
    name.length < 2 ||
    !email ||
    !EMAIL.test(email) ||
    !subject ||
    !message ||
    message.length < 10 ||
    phone.length > 40
  ) {
    return response(
      'Please enter a valid name, email address, subject and message.',
      422,
    );
  }

  /* =======================================================
     EMAIL CONTENT

     Use plain text and sanitize line breaks from fields
     intended for single-line display.
     ======================================================= */

  const safeSubject =
    subject
      .replace(/[\r\n\t]+/g, ' ')
      .trim();

  const safeName =
    name.replace(/[\r\n]+/g, ' ');

  const safePhone =
    phone.replace(/[\r\n]+/g, ' ');

  const text = [
    'New enquiry from the Golden Rose Perfume website',

    '',

    `Name: ${safeName}`,

    `Email: ${email}`,

    ...(safePhone
      ? [`Phone: ${safePhone}`]
      : []),

    `Subject: ${safeSubject}`,

    '',

    'Message:',

    message,
  ].join('\n');

  /* =======================================================
     EMAIL PROVIDER REQUEST
     ======================================================= */

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    10_000,
  );

  try {
    const delivered = await fetch(
      'https://api.resend.com/emails',
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          'Content-Type':
            'application/json',
        },

        body: JSON.stringify({
          from,

          to: [to],

          reply_to: email,

          subject:
            `Golden Rose website enquiry: ${safeSubject}`,

          text,
        }),

        signal:
          controller.signal,

        cache:
          'no-store',
      },
    );

    if (!delivered.ok) {
      return response(
        'We could not send your message. Please try again or use a direct contact option.',
        502,
      );
    }

    const data: unknown =
      await delivered.json().catch(
        () => null,
      );

    if (
      !data ||
      typeof data !== 'object' ||
      !('id' in data) ||
      typeof data.id !== 'string' ||
      !data.id.trim()
    ) {
      return response(
        'We could not confirm your message was accepted. Please contact the boutique directly.',
        502,
      );
    }

    /* =====================================================
       CONFIRMED PROVIDER ACCEPTANCE
       ===================================================== */

    return NextResponse.json(
      {
        ok: true,

        message:
          'Your message has been received for delivery. Golden Rose can reply to your email address.',
      },
      {
        status: 200,

        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );

  } catch {
    return response(
      'The contact service is temporarily unavailable. Please try again.',
      502,
    );

  } finally {
    clearTimeout(timeout);
  }
}