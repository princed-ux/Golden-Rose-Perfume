import { Check, CircleX, RotateCcw } from 'lucide-react';
import { getTrackingSteps, ORDER_STATUS_LABELS, type CustomerOrderStatus, type TrackingEvent } from '@/src/domain/customer';
import { formatCustomerDate } from '@/src/lib/customer-data';

export default function OrderTrackingTimeline({ status, events }: { status: CustomerOrderStatus; events: TrackingEvent[] }) {
  const terminal = status === 'cancelled' || status === 'returned';
  return (
    <div className="flex flex-col gap-5">
      {terminal && <p className="flex items-center gap-3 rounded-xl border border-[var(--gr-theme-border)] bg-[var(--gr-theme-surface-alt)] p-4 text-sm">{status === 'cancelled' ? <CircleX size={18} aria-hidden="true" /> : <RotateCcw size={18} aria-hidden="true" />}This example order is {ORDER_STATUS_LABELS[status].toLowerCase()}. Recorded history is shown below.</p>}
      <ol aria-label="Order delivery progress" className="gr-customer-tracking">
        {getTrackingSteps(status, events).map(step => (
          <li key={step.status} data-state={step.state} aria-current={step.state === 'current' ? 'step' : undefined}>
            <span className="gr-customer-tracking__marker" aria-hidden="true">{step.state === 'complete' || (status === 'delivered' && step.state === 'current') ? <Check size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span>
            <div className="flex min-w-0 flex-col gap-1"><span className="text-[11px] font-medium">{step.label}</span><span className="text-[9px] leading-5 text-[var(--gr-theme-muted)]">{step.occurredAt ? formatCustomerDate(step.occurredAt) : 'Awaiting update'}</span><span className="sr-only">{step.state}</span></div>
          </li>
        ))}
      </ol>
      <p className="text-[10px] leading-6 text-[var(--gr-theme-muted)]">Sample tracking timeline · no carrier or live delivery service is connected.</p>
    </div>
  );
}
