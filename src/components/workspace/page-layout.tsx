import type { ReactNode } from 'react';

const control = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-center text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a2672e] disabled:cursor-not-allowed disabled:opacity-50';
export const workspacePrimary = control + ' border border-[#54213a] bg-[#54213a] text-white hover:bg-[#3e1629]';
export const workspaceSecondary = control + ' border border-[#dac8bc] bg-white text-[#54213a] hover:border-[#ac815a] hover:bg-[#fff8ed]';
export const workspaceInput = 'w-full min-w-0 rounded-lg border border-[#ddcfc9] bg-white px-3 py-2.5 text-sm font-normal text-[#38252f] placeholder:text-[#75676e] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#a2672e] disabled:opacity-60';
export const workspaceLabel = 'grid min-w-0 gap-1.5 text-sm font-semibold text-[#432b36]';

export function WorkspacePageHeader({
  title, description, kicker, actions, id, level = 'h1',
}: {
  title: string; description?: string; kicker?: string; actions?: ReactNode; id?: string; level?: 'h1' | 'h2';
}) {
  const Heading = level;
  return <header className="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-[#e8dcd7] px-0.5 pt-1 pb-5">
    <div className="grid min-w-0 gap-2">
      {kicker && <p className="text-[0.67rem] font-bold tracking-[0.17em] text-[#8a5b2d] uppercase">{kicker}</p>}
      <Heading id={id} className="font-serif text-[clamp(1.85rem,3.4vw,2.75rem)] leading-tight font-normal tracking-tight text-[#41172a]">{title}</Heading>
      {description && <p className="max-w-[66ch] text-sm leading-6 text-[#6d5b64]">{description}</p>}
    </div>
    {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}

export function WorkspacePanel({ label, children, className = '' }: { label?: string; children: ReactNode; className?: string }) {
  return <section aria-labelledby={label} className={'min-w-0 rounded-xl border border-[#e8dcd7] bg-[#fffdf9] p-4 shadow-sm sm:p-6 ' + className}>{children}</section>;
}

export function WorkspaceNotice({ title, children, tone = 'neutral', action }: {
  title: string; children: ReactNode; tone?: 'neutral' | 'pending' | 'error'; action?: ReactNode;
}) {
  const surface = tone === 'error' ? 'border-[#e7bdc3] bg-[#fff3f4] text-[#74263e]'
    : tone === 'pending' ? 'border-[#e8d4b8] bg-[#fff8ea] text-[#644225]'
    : 'border-[#e8dcd7] bg-[#fcf7f0] text-[#51414a]';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={'grid min-w-0 gap-2 rounded-lg border p-4 sm:p-5 ' + surface}>
    <strong className="text-sm">{title}</strong>
    <div className="text-sm leading-6 break-words">{children}</div>
    {action && <div className="pt-1">{action}</div>}
  </div>;
}
