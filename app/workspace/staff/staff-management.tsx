
'use client';

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';

import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ClipboardCopy,
  FileText,
  KeyRound,
  LockKeyhole,
  Mail,
  MapPin,
  Plus,
  ScanBarcode,
  Search,
  Shield,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  UserRoundPlus,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';

import Link from 'next/link';

type EmployeeRole =
  | 'manager'
  | 'cashier'
  | 'sales_staff'
  | 'inventory_staff'
  | 'accountant';

type StaffDraft = {
  fullName: string;
  email: string;
  role: EmployeeRole;
};

type RoleDefinition = {
  id: EmployeeRole;
  title: string;
  description: string;
  icon: LucideIcon;
  features: string[];
  restricted: string[];
};

const ROLES: RoleDefinition[] = [
  {
    id: 'cashier',
    title: 'Cashier',
    description:
      'For employees who sell fragrances at the physical counter.',
    icon: ScanBarcode,
    features: [
      'Point of Sale',
      'Barcode scanner',
      'Register calculator',
      'Authorized receipts',
    ],
    restricted: [
      'Business settings',
      'Staff management',
      'Financial reports',
      'Invoices and purchasing',
    ],
  },
  {
    id: 'manager',
    title: 'Store Manager',
    description:
      'Day-to-day retail operations and authorized supervision.',
    icon: ShieldCheck,
    features: [
      'Point of Sale',
      'Products and inventory',
      'Customer and sales operations',
      'Operational reports',
    ],
    restricted: [
      'Owner access management',
      'Owner-only business administration',
    ],
  },
  {
    id: 'sales_staff',
    title: 'Sales Staff',
    description:
      'Customer assistance, orders and permitted sales operations.',
    icon: ShoppingBag,
    features: [
      'Sales and orders',
      'Point of Sale',
      'Customer CRM',
      'Product availability',
    ],
    restricted: [
      'Staff management',
      'Owner settings',
      'Financial administration',
    ],
  },
  {
    id: 'inventory_staff',
    title: 'Inventory Staff',
    description:
      'Stock receiving, stock monitoring and catalogue operations.',
    icon: MapPin,
    features: [
      'Inventory and stock',
      'Products and variants',
      'Purchase receiving',
      'Store and warehouse balances',
    ],
    restricted: [
      'Cash checkout',
      'Owner settings',
      'Staff management',
      'Invoices',
    ],
  },
  {
    id: 'accountant',
    title: 'Accountant',
    description:
      'Financial records, invoice review and authorized reporting.',
    icon: FileText,
    features: [
      'Invoices and quotes',
      'Expenses',
      'Sales summaries',
      'Financial reports',
    ],
    restricted: [
      'POS checkout',
      'Owner settings',
      'Staff administration',
    ],
  },
];

function getRole(id: EmployeeRole) {
  return ROLES.find(role => role.id === id) ?? ROLES[0];
}

function prettyRole(id: EmployeeRole) {
  return getRole(id).title;
}

function RoleCard({
  role,
  selected,
  onChoose,
}: {
  role: RoleDefinition;
  selected: boolean;
  onChoose: (role: EmployeeRole) => void;
}) {
  const Icon = role.icon;

  return (
    <button
      type="button"
      className={`grstaff-role-card ${selected ? 'is-selected' : ''}`}
      onClick={() => onChoose(role.id)}
      aria-pressed={selected}
    >
      <span className="grstaff-role-icon">
        <Icon size={22} aria-hidden="true" />
      </span>

      <span className="grstaff-role-content">
        <strong>{role.title}</strong>
        <small>{role.description}</small>
      </span>

      {selected && (
        <CheckCircle2
          className="grstaff-role-selected"
          size={19}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function PermissionPreview({
  role,
}: {
  role: EmployeeRole;
}) {
  const definition = getRole(role);

  return (
    <div className="grstaff-permission-preview">
      <div className="grstaff-permission-heading">
        <span>
          <ShieldCheck size={20} />
        </span>

        <div>
          <strong>{definition.title} permissions</strong>
          <small>
            Intended workspace access for this employee role
          </small>
        </div>
      </div>

      <div className="grstaff-permission-columns">
        <div>
          <h4>Allowed modules</h4>

          <ul>
            {definition.features.map(feature => (
              <li key={feature}>
                <Check size={15} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Restricted modules</h4>

          <ul className="grstaff-denied-list">
            {definition.restricted.map(feature => (
              <li key={feature}>
                <X size={14} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="grstaff-permission-note">
        Final permissions must also be enforced by the
        authenticated backend. Hiding a menu item alone
        does not authorize or restrict an employee.
      </p>
    </div>
  );
}

export function StaffManagement() {
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] =
    useState<EmployeeRole>('cashier');

  const [inviteOpen, setInviteOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [draftRole, setDraftRole] =
    useState<EmployeeRole>('cashier');

  const [draft, setDraft] = useState<StaffDraft | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const visibleRoles = useMemo(
    () =>
      ROLES.filter(role =>
        `${role.title} ${role.description}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
    [search],
  );

  useEffect(() => {
    if (!inviteOpen) return;

    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setInviteOpen(false);
      }
    }

    window.addEventListener('keydown', escape);

    return () => {
      window.removeEventListener('keydown', escape);
    };
  }, [inviteOpen]);

  function openInvite(role: EmployeeRole = selectedRole) {
    setDraftRole(role);
    setError('');
    setInviteOpen(true);
  }

  function prepareInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = fullName.trim().replace(/\s+/g, ' ');
    const address = email.trim().toLowerCase();

    if (name.length < 2 || name.length > 100) {
      setError('Enter an employee name between 2 and 100 characters.');
      return;
    }

    if (
      address.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
    ) {
      setError('Enter a valid work email address.');
      return;
    }

    setDraft({
      fullName: name,
      email: address,
      role: draftRole,
    });

    setCopied(false);
    setError('');
    setInviteOpen(false);
  }

  async function copyDraft() {
    if (!draft) return;

    const text = [
      'Golden Rose — Employee onboarding draft',
      `Employee: ${draft.fullName}`,
      `Work email: ${draft.email}`,
      `Role: ${prettyRole(draft.role)}`,
      'Status: NOT SENT — awaiting secure invitation service',
      'Store assignment: Pending',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError('Clipboard access was blocked by your browser.');
    }
  }

  return (
    <>
      <header className="grstaff-header">
        <div>
          <p className="grstaff-eyebrow">
            BUSINESS WORKSPACE / TEAM ADMINISTRATION
          </p>

          <h1>
            Staff Management<span>.</span>
          </h1>

          <p>
            Organize your team, prepare employee access
            and control what each role can do.
          </p>
        </div>

        <button
          type="button"
          className="grstaff-primary"
          onClick={() => openInvite()}
        >
          <UserRoundPlus size={19} />
          Add staff
          <Plus size={16} />
        </button>
      </header>

      <section className="grstaff-intro">
        <div className="grstaff-intro-main">
          <span className="grstaff-intro-icon">
            <UsersRound size={25} />
          </span>

          <div>
            <strong>One team. Controlled access.</strong>

            <p>
              Employees will use their own work email and
              individual account. They will only access
              the modules authorized for their assigned role.
            </p>
          </div>
        </div>

        <div className="grstaff-intro-feature">
          <LockKeyhole size={20} />
          <span>Role-based security</span>
        </div>
      </section>

      <div className="grstaff-benefits">
        <article>
          <span><UserRound size={20} /></span>
          <div>
            <strong>Personal accounts</strong>
            <small>No shared staff passwords</small>
          </div>
        </article>

        <article>
          <span><ScanBarcode size={20} /></span>
          <div>
            <strong>Cashier-only POS</strong>
            <small>Focused selling workspace</small>
          </div>
        </article>

        <article>
          <span><MapPin size={20} /></span>
          <div>
            <strong>Location assignments</strong>
            <small>Planned branch-level authorization</small>
          </div>
        </article>
      </div>

      <div className="grstaff-content-grid">
        <section
          className="grstaff-panel"
          aria-labelledby="grstaff-roles-heading"
        >
          <div className="grstaff-panel-header">
            <div>
              <p className="grstaff-eyebrow">
                PERMISSION TEMPLATES
              </p>

              <h2 id="grstaff-roles-heading">
                Employee roles
              </h2>

              <p>
                Choose a role to inspect its intended permissions.
              </p>
            </div>
          </div>

          <div className="grstaff-search">
            <Search size={18} aria-hidden="true" />

            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Find employee roles..."
              aria-label="Search employee roles"
            />
          </div>

          <div className="grstaff-role-list">
            {visibleRoles.map(role => (
              <RoleCard
                key={role.id}
                role={role}
                selected={selectedRole === role.id}
                onChoose={setSelectedRole}
              />
            ))}

            {visibleRoles.length === 0 && (
              <p className="grstaff-no-match">
                No roles match your search.
              </p>
            )}
          </div>
        </section>

        <section
          className="grstaff-panel grstaff-access-panel"
          aria-labelledby="grstaff-access-heading"
        >
          <div className="grstaff-panel-header">
            <div>
              <p className="grstaff-eyebrow">
                WORKSPACE ACCESS
              </p>

              <h2 id="grstaff-access-heading">
                Role permissions
              </h2>

              <p>
                See which parts of Golden Rose
                the selected employee role should access.
              </p>
            </div>

            <span className="grstaff-shield-icon">
              <Shield size={19} />
            </span>
          </div>

          <PermissionPreview role={selectedRole} />

          <button
            type="button"
            className="grstaff-secondary grstaff-choose-role"
            onClick={() => openInvite(selectedRole)}
          >
            Prepare {prettyRole(selectedRole)} invitation
            <ArrowRight size={17} />
          </button>
        </section>
      </div>

      <section
        className="grstaff-panel grstaff-directory"
        aria-labelledby="grstaff-directory-heading"
      >
        <div className="grstaff-panel-header">
          <div>
            <p className="grstaff-eyebrow">
              EMPLOYEE DIRECTORY
            </p>

            <h2 id="grstaff-directory-heading">
              Team members
            </h2>

            <p>
              This section will list verified employees,
              assigned locations and account status.
            </p>
          </div>

          <span className="grstaff-status">
            <ShieldCheck size={14} />
            Owner controlled
          </span>
        </div>

        {draft && (
          <div className="grstaff-draft">
            <div className="grstaff-draft-identity">
              <span className="grstaff-avatar">
                {draft.fullName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map(part => part[0]?.toUpperCase())
                  .join('')}
              </span>

              <div>
                <strong>{draft.fullName}</strong>
                <small>{draft.email}</small>
              </div>
            </div>

            <div className="grstaff-draft-role">
              <span>{prettyRole(draft.role)}</span>
              <small>Unsaved invitation draft</small>
            </div>

            <button
              type="button"
              className="grstaff-secondary"
              onClick={() => void copyDraft()}
            >
              {copied ? <Check size={15} /> : <ClipboardCopy size={15} />}
              {copied ? 'Copied' : 'Copy details'}
            </button>
          </div>
        )}

        <div className="grstaff-directory-state">
          <span>
            <KeyRound size={28} />
          </span>

          <div>
            <h3>Employee directory integration</h3>

            <p>
              Staff invitations and the live employee directory
              require a separately authorized backend workflow.
              No employee is added or granted access from
              this screen until that service is connected.
            </p>

            <p>
              The business-owner accounts are managed in
              the ownership section below.
            </p>
          </div>
        </div>

        <div className="grstaff-next-actions">
          <div>
            <strong>Employee onboarding workflow</strong>
            <p>
              Prepare details → issue expiring invite → employee
              accepts → verify role → assign location → activate access.
            </p>
          </div>

          <Link href="/workspace/pos" className="grstaff-secondary">
            View POS
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="grstaff-security-note">
        <BadgeCheck size={19} />

        <p>
          Access must be verified against active staff records
          on every protected request. Suspending an employee
          must prevent further business operations, including
          direct API calls.
        </p>
      </section>

      {error && (
        <div className="grstaff-toast" role="alert">
          <span>{error}</span>
          <button
            aria-label="Dismiss error"
            onClick={() => setError('')}
          >
            <X size={17} />
          </button>
        </div>
      )}

      {inviteOpen && (
        <div
          className="grstaff-modal-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setInviteOpen(false);
            }
          }}
        >
          <section
            className="grstaff-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="grstaff-modal-title"
          >
            <header className="grstaff-modal-header">
              <div>
                <p className="grstaff-eyebrow">
                  EMPLOYEE ONBOARDING
                </p>

                <h2 id="grstaff-modal-title">
                  Add a staff member
                </h2>

                <p>
                  Prepare the employee details for
                  a secure invitation.
                </p>
              </div>

              <button
                type="button"
                className="grstaff-close"
                aria-label="Close"
                onClick={() => setInviteOpen(false)}
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={prepareInvitation}>
              <label>
                Employee full name
                <input
                  required
                  autoFocus
                  type="text"
                  value={fullName}
                  onChange={event => setFullName(event.target.value)}
                  placeholder="Enter employee's full name"
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </label>

              <label>
                Work email address
                <span className="grstaff-input-icon">
                  <Mail size={17} />

                  <input
                    required
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="employee@example.com"
                    maxLength={254}
                    autoComplete="email"
                  />
                </span>
              </label>

              <label>
                Assign employee role
                <select
                  value={draftRole}
                  onChange={event =>
                    setDraftRole(event.target.value as EmployeeRole)
                  }
                >
                  {ROLES.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grstaff-modal-location">
                <MapPin size={19} />

                <div>
                  <strong>Assigned store</strong>
                  <p>
                    Store assignments will come from verified
                    inventory locations. They cannot be assigned
                    until that backend is connected.
                  </p>
                </div>
              </div>

              <div className="grstaff-modal-note">
                <LockKeyhole size={17} />

                <p>
                  Preparing this form does not create an account
                  or send an invitation. The employee will set up
                  their own credentials once secure invitations
                  are enabled.
                </p>
              </div>

              <div className="grstaff-modal-actions">
                <button
                  type="button"
                  className="grstaff-secondary"
                  onClick={() => setInviteOpen(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="grstaff-primary"
                >
                  <CheckCircle2 size={17} />
                  Review invitation
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
