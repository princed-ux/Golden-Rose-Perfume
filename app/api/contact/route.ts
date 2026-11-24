import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@\r\n<>]+@[^\s@\r\n<>]+\.[^\s@\r\n<>]+$/;
const MAX_BODY_BYTES = 16_384;

type Enquiry = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown;
};

function field(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= max ? cleaned : null;
}

/** Reject oversized bodies while reading, not after allocating an arbitrary payload. */
async function limitedJsonBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function response(message: string, status: number) {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Email contact channel. This endpoint never stores customer correspondence
 * in an unprotected table and never reports success unless the mail provider
 * accepts the message. The sender domain must be verified in Resend.
 */
export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.GOLDEN_ROSE_CONTACT_TO_EMAIL?.trim();
  const from = process.env.GOLDEN_ROSE_CONTACT_FROM_EMAIL?.trim();

  if (!apiKey || !to || !from || !EMAIL.test(to) || !EMAIL.test(from)) {
    return response('Online messaging is not configured yet. Please use one of the direct contact options.', 503);
  }

  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return response('Invalid message format.', 415);
  }

  const reportedLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(reportedLength) && reportedLength > MAX_BODY_BYTES) {
    return response('Your message is too long.', 413);
  }

  let payload: Enquiry;
  try {
    const raw = await limitedJsonBody(request);
    if (raw === null) {
      return response('Your message is too long.', 413);
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return response('Please check the contact form.', 400);
    }
    payload = parsed as Enquiry;
  } catch {
    return response('Please check the contact form.', 400);
  }

  // Honeypot: a filled hidden field indicates an automated submission.
  if (payload.website) return response('Invalid submission.', 400);

  const name = field(payload.name, 100);
  const email = field(payload.email, 254);
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  const subject = field(payload.subject, 140);
  const message = field(payload.message, 4000);

  if (!name || name.length < 2 || !email || !EMAIL.test(email) || !subject || !message || message.length < 10 || phone.length > 40) {
    return response('Please enter a valid name, email address, subject and message.', 422);
  }

  const safeSubject = subject.replace(/[\r\n\t]+/g, ' ').trim();
  const safeName = name.replace(/[\r\n]+/g, ' ');
  const text = [
    'New enquiry from the Golden Rose Perfume website',
    '',
    `Name: ${safeName}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone.replace(/[\r\n]+/g, ' ')}` : '',
    `Subject: ${safeSubject}`,
    '',
    'Message:',
    message,
  ].filter((line, index) => index < 4 || line !== '').join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const delivered = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `Golden Rose website enquiry: ${safeSubject}`,
        text,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!delivered.ok) {
      // Do not expose provider errors, credentials or recipient addresses.
      return response('We could not send your message. Please try again or use a direct contact option.', 502);
    }

    const data: unknown = await delivered.json().catch(() => null);
    if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') {
      return response('We could not confirm your message was accepted. Please contact the boutique directly.', 502);
    }

    return NextResponse.json(
      { ok: true, message: 'Your message has been received for delivery. Golden Rose can reply to your email address.' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return response('The contact service is temporarily unavailable. Please try again.', 502);
  } finally {
    clearTimeout(timeout);
  }
}