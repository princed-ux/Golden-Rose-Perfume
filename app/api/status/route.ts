import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    project: 'Golden Rose Perfume',
    stage: 'web-ui-foundation',
    mode: 'demo',
    liveAuthentication: false,
    livePayments: false,
    liveAI: false,
    liveInvoices: false,
  });
}

