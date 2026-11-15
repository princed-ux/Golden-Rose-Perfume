import Image from 'next/image';
import type { SuiteModuleId, WorkspaceModule } from './workspace-model';

export function WorkspaceBrand() {
  return (
    <div className="owner-brand">
      <span className="owner-brand-logo">
        <Image
          src="/assets/brand/golden-rose-logo.png"
          alt=""
          width={40}
          height={44}
        />
      </span>

      <span className="owner-wordmark">
        Golden Rose
      </span>

      <span className="owner-brand-tagline">
        Beauty of Fragrance
      </span>
    </div>
  );
}

export function WorkspaceNavigation({
  label,
  modules,
  active,
  onNavigate,
}: {
  label: string;
  modules: readonly WorkspaceModule[];
  active: SuiteModuleId;
  onNavigate: (id: SuiteModuleId) => void;
}) {
  return (
    <nav className="owner-nav" aria-label={label}>
      {modules.map(({ id, label: itemLabel, icon: Icon }) => (
        <button
          key={id}
          type="button"
          title={itemLabel}
          aria-label={itemLabel}
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onNavigate(id)}
        >
          <Icon
            size={18}
            strokeWidth={1.65}
            aria-hidden="true"
          />
          <span>{itemLabel}</span>
        </button>
      ))}
    </nav>
  );
}

