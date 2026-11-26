
import type { ReactNode } from 'react';

const control =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gr-gold disabled:cursor-not-allowed disabled:opacity-50';

export const workspacePrimary =
  control +
  ' border border-gr-border bg-gr-strong text-gr-on-strong shadow-[0_7px_16px_rgba(84,33,58,0.12)] hover:bg-gr-strong-hover';

export const workspaceSecondary =
  control +
  ' border border-gr-border bg-gr-surface text-gr-text hover:border-gr-control-border hover:bg-gr-surface-alt';

export const workspaceInput =
  'w-full min-w-0 min-h-11 rounded-xl border border-gr-control-border bg-gr-input px-3.5 py-2.5 text-sm font-normal text-gr-text shadow-[0_1px_2px_rgba(54,20,37,0.03)] placeholder:text-gr-muted focus-visible:border-gr-gold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gr-gold disabled:cursor-not-allowed disabled:opacity-60';

export const workspaceLabel =
  'grid min-w-0 gap-2 text-sm font-semibold text-gr-text';

export function WorkspacePageHeader({
  title,
  description,
  kicker,
  actions,
  id,
  level = 'h1',
}: {
  title: string;
  description?: string;
  kicker?: string;
  actions?: ReactNode;
  id?: string;
  level?: 'h1' | 'h2';
}) {
  const Heading = level;

  return (
    <header className="flex min-w-0 flex-wrap items-end justify-between gap-5 border-b border-gr-border pb-5 pt-1">
      <div className="grid min-w-0 gap-2">
        {kicker && (
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gr-gold">
            {kicker}
          </p>
        )}

        <Heading
          id={id}
          className="font-serif text-[clamp(1.85rem,3.5vw,2.75rem)] font-normal leading-tight tracking-tight text-gr-text"
        >
          {title}
        </Heading>

        {description && (
          <p className="max-w-[72ch] text-sm leading-6 text-gr-muted">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}

export function WorkspacePanel({
  label,
  children,
  className = '',
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={label}
      className={
        'min-w-0 rounded-2xl border border-gr-border bg-gr-surface p-4 shadow-[0_5px_23px_rgba(59,21,38,0.035)] sm:p-6 ' +
        className
      }
    >
      {children}
    </section>
  );
}

export function WorkspaceNotice({
  title,
  children,
  tone = 'neutral',
  action,
}: {
  title: string;
  children: ReactNode;
  tone?: 'neutral' | 'pending' | 'error';
  action?: ReactNode;
}) {
  const theme =
    tone === 'error'
      ? 'border-gr-border bg-gr-surface text-gr-danger'
      : tone === 'pending'
        ? 'border-gr-border bg-gr-surface text-gr-gold'
        : 'border-gr-border bg-gr-surface text-gr-text';

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        'grid min-w-0 gap-2 rounded-xl border p-4 sm:p-5 ' +
        theme
      }
    >
      <strong className="text-sm font-semibold">
        {title}
      </strong>

      <div className="text-sm leading-6 break-words">
        {children}
      </div>

      {action && (
        <div className="flex min-w-0 flex-wrap gap-2 pt-2">
          {action}
        </div>
      )}
    </div>
  );
}
