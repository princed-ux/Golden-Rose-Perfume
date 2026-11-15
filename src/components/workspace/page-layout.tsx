
import type { ReactNode } from 'react';

const control =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18243] disabled:cursor-not-allowed disabled:opacity-50';

export const workspacePrimary =
  control +
  ' border border-[#54213a] bg-[#54213a] text-white shadow-[0_7px_16px_rgba(84,33,58,0.12)] hover:bg-[#42182d]';

export const workspaceSecondary =
  control +
  ' border border-[#dfd0c3] bg-white text-[#54213a] hover:border-[#c5a47b] hover:bg-[#fff8ef]';

export const workspaceInput =
  'w-full min-w-0 min-h-11 rounded-xl border border-[#ded0cb] bg-white px-3.5 py-2.5 text-sm font-normal text-[#3d2b33] shadow-[0_1px_2px_rgba(54,20,37,0.03)] placeholder:text-[#988790] focus-visible:border-[#b18243] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#b18243] disabled:cursor-not-allowed disabled:opacity-60';

export const workspaceLabel =
  'grid min-w-0 gap-2 text-sm font-semibold text-[#432b36]';

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
    <header className="flex min-w-0 flex-wrap items-end justify-between gap-5 border-b border-[#ebdfd9] pb-5 pt-1">
      <div className="grid min-w-0 gap-2">
        {kicker && (
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#a17940]">
            {kicker}
          </p>
        )}

        <Heading
          id={id}
          className="font-serif text-[clamp(1.85rem,3.5vw,2.75rem)] font-normal leading-tight tracking-tight text-[#41172a]"
        >
          {title}
        </Heading>

        {description && (
          <p className="max-w-[72ch] text-sm leading-6 text-[#796570]">
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
        'min-w-0 rounded-2xl border border-[#eaded8] bg-[#fffdf9] p-4 shadow-[0_5px_23px_rgba(59,21,38,0.035)] sm:p-6 ' +
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
      ? 'border-[#e8c6cc] bg-[#fff3f4] text-[#7f3349]'
      : tone === 'pending'
        ? 'border-[#e9d5af] bg-[#fff7e8] text-[#74502a]'
        : 'border-[#ebded8] bg-[#faf6f1] text-[#594651]';

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
