
import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Golden Rose Perfume — read-only web release smoke checks.
 *
 * Run the Next.js web server separately, then:
 * node --test tests/web-release-smoke.test.mjs
 *
 * Optional environment variable:
 * GR_WEB_BASE_URL=https://your-staging-domain.com
 *
 * No customers, enquiries, payments, sales or stock
 * records are created or modified by these tests.
 *
 * These checks do NOT replace authenticated
 * browser acceptance or database transaction tests.
 */

const BASE = new URL(
  `${
    (
      process.env.GR_WEB_BASE_URL ||
      'http://127.0.0.1:3000'
    ).replace(/\/+$/, '')
  }/`,
);

const TIMEOUT_MS = 20_000;

async function request(path, options = {}) {
  const url = new URL(
    path.replace(/^\//, ''),
    BASE,
  );

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    redirect: 'manual',
    headers: {
      Accept: options.accept ?? 'text/html',
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const type =
    response.headers.get('content-type') ?? '';

  const body = type.includes('text/html')
    ? await response.text()
    : '';

  return {
    status: response.status,
    type,
    body,
    location:
      response.headers.get('location') ?? '',
    url: url.toString(),
  };
}

function describeFailure(path, response) {
  return (
    `${path}: HTTP ${response.status}; ` +
    `redirect=${response.location || 'none'}`
  );
}

test(
  'Local Golden Rose web server is reachable',
  async () => {
    let response;

    try {
      response = await request('/');
    } catch (error) {
      assert.fail(
        `Golden Rose could not be reached at ` +
        `${BASE.origin}. Start the Next.js ` +
        `web server first. ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }

    assert.equal(
      response.status,
      200,
      describeFailure('/', response),
    );

    assert.match(
      response.body,
      /golden\s*rose/i,
      'Homepage is missing Golden Rose branding.',
    );
  },
);

const publicRoutes = [
  ['Storefront homepage', '/'],
  ['Our Story', '/about'],
  ['Perfume catalogue', '/shop'],
  ['Shopping bag', '/cart'],
  ['WhatsApp checkout', '/checkout'],
  ['Customer registration', '/account/register'],
  ['Customer sign-in', '/account/login'],
  ['Staff sign-in', '/staff/login'],
];

test(
  'Public storefront and authentication pages',
  async (t) => {
    for (const [label, path] of publicRoutes) {
      await t.test(
        `${label} (${path})`,
        async () => {
          const result = await request(path);

          assert.equal(
            result.status,
            200,
            describeFailure(path, result),
          );

          assert.match(
            result.type,
            /text\/html/i,
            `${path} did not return HTML.`,
          );

          assert.ok(
            result.body.length > 100,
            `${path} returned an empty page.`,
          );

          assert.doesNotMatch(
            result.body,
            /<h1[^>]*>\s*Internal Server Error\s*<\/h1>/i,
            `${path} displayed a server error.`,
          );
        },
      );
    }
  },
);

test(
  'Staff login form and invitation link',
  async () => {
    const result = await request(
      '/staff/login',
    );

    assert.equal(
      result.status,
      200,
      describeFailure('/staff/login', result),
    );

    assert.match(
      result.body,
      /business access/i,
    );

    assert.match(
      result.body,
      /staff\/accept-invite/i,
    );

    assert.match(
      result.body,
      /staff-email|work email/i,
    );
  },
);

test(
  'Golden Rose brand and About-page images',
  async (t) => {
    const assets = [
      '/assets/brand/golden-rose-logo.png',
      '/assets/products/telegram-selected/gr-456e486c1d89.jpg',
    ];

    for (const path of assets) {
      await t.test(path, async () => {
        const result = await request(
          path,
          {
            accept: 'image/*',
          },
        );

        assert.equal(
          result.status,
          200,
          describeFailure(path, result),
        );

        assert.match(
          result.type,
          /^image\//i,
          `${path} was not served as an image.`,
        );
      });
    }
  },
);

test(
  'Product photo uploads reject foreign origins',
  async () => {
    const result = await request(
      '/workspace/products/images',
      {
        method: 'POST',
        accept: 'application/json',
        headers: {
          Origin:
            'https://untrusted.example.invalid',
        },
      },
    );

    assert.equal(
      result.status,
      403,
      'Cross-origin uploads must be rejected before storage writes.',
    );
  },
);

/*
 * Next.js Partial Prerendering may initially
 * return an HTTP 200 shell before streaming
 * a login redirect.
 *
 * Therefore, these checks establish that
 * protected routes do not crash on guest access.
 *
 * They do not prove role authorization.
 * That requires real authenticated browser tests.
 */

const guestRoutes = [
  '/workspace',
  '/workspace/products',
  '/workspace/inventory',
  '/workspace/orders',
  '/workspace/orders/whatsapp',
  '/workspace/pos',
  '/workspace/reports',
  '/workspace/staff',
  '/account/dashboard',
  '/account/orders',
];

test(
  'Private routes do not crash on guest access',
  async (t) => {
    for (const path of guestRoutes) {
      await t.test(path, async () => {
        const result = await request(path);

        assert.ok(
          result.status < 500,
          describeFailure(path, result),
        );

        console.log(
          `Guest ${path}: ` +
          `HTTP ${result.status}` +
          (
            result.location
              ? ` => ${result.location}`
              : ''
          ),
        );
      });
    }
  },
);
