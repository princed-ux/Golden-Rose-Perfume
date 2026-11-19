
import type { Metadata } from 'next';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { connection } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import {
  Building2,
  CreditCard,
  Globe2,
  MapPin,
  MessageCircle,
  ShieldCheck,
  ShoppingBag,
  Store,
  UsersRound,
} from 'lucide-react';

import { requireStaff } from '@/src/lib/golden-rose/staff';
import { employeeAdminClient } from '@/src/lib/golden-rose/employee-admin';
import { createLocation } from '../actions';
import { normalizeWhatsAppNumber } from '@/src/lib/customer/bag';
import { validEmail } from '@/src/lib/customer/auth-policy';

export const metadata: Metadata = {
  title: 'Business Settings | Golden Rose Perfume',
  description:
    'Owner-managed store details, locations, WhatsApp, social accounts and payments.',
};

type Profile = {
  name: string;
  phone: string;
  email: string;
  address: string;
  description: string;
  storefront_message: string;
  delivery_note: string;
  returns_note: string;
  show_public_phone: boolean;
  show_public_email: boolean;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
};

type Location = {
  id: string;
  name: string;
  code: string;
  type: string;
  active: boolean;
  address: string;
  city: string;
  stateRegion: string;
  country: string;
  phone: string;
  hours: string;
  isPublic: boolean;
};

type WhatsApp = {
  id: string;
  label: string;
  number: string;
  purpose: string;
  isActive: boolean;
  isPrimary: boolean;
};

type Social = {
  id: string;
  platform: string;
  label: string;
  url: string;
  is_active: boolean;
};

type Status =
  | 'profile'
  | 'storefront'
  | 'bank'
  | 'location'
  | 'new-location'
  | 'whatsapp'
  | 'social'
  | 'invalid'
  | 'unavailable'
  | 'notfound'
  | 'conflict';

const results: Record<Status, string> = {
  profile: 'Business profile saved.',
  storefront: 'Storefront preferences saved.',
  bank:
    'Receiving account saved. This does not verify any transfer.',
  location: 'Location details saved.',
  'new-location':
    'New location created. Add its address before publishing.',
  whatsapp: 'WhatsApp contacts updated.',
  social: 'Social media links updated.',
  invalid:
    'The details supplied are invalid. Check the form and try again.',
  unavailable:
    'The settings service could not save this change. Please try again.',
  notfound:
    'The selected record was not found. Refresh this page.',
  conflict:
    'This entry already exists. Choose a different number, link or code.',
};

const fieldClass =
  'w-full min-h-11 rounded-xl border border-[#e7d7d1] bg-white px-3 py-2 text-sm text-[#49283a] outline-offset-2 focus-visible:outline-[#ab7b43]';

const labelClass =
  'grid gap-1.5 text-xs font-semibold text-[#755568]';

const cardClass =
  'scroll-mt-24 rounded-2xl border border-[#ecdfdc] bg-[#fffdfb] p-5 shadow-[0_8px_25px_rgba(69,26,46,0.04)] sm:p-6';

const actionClass =
  'inline-flex min-h-10 items-center justify-center rounded-xl bg-[#54233c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#713450]';

const subtleClass =
  'inline-flex min-h-9 items-center justify-center rounded-xl border border-[#eadbd5] bg-white px-3 py-2 text-xs font-semibold text-[#623e50] hover:bg-[#fcf3ed]';

function value(form: FormData, key: string) {
  const item = form.get(key);
  return typeof item === 'string' ? item.trim() : '';
}

function go(status: Status, section: string): never {
  revalidatePath('/workspace/settings');
  redirect(`/workspace/settings?result=${status}#${section}`);
}

async function ownerClient() {
  const staff = await requireStaff();

  if (staff.role !== 'owner') {
    notFound();
  }

  const db = employeeAdminClient();

  if (!db) {
    go('unavailable', 'business-profile');
  }

  return {
    db,
    ownerId: staff.userId,
  };
}

async function updateProfile(form: FormData) {
  'use server';

  const { db, ownerId } = await ownerClient();

  const name = value(form, 'name');
  const phone = value(form, 'phone');
  const email = value(form, 'email');
  const address = value(form, 'address');
  const description = value(form, 'description');

  if (
    name.length < 2 ||
    name.length > 120 ||
    phone.length > 32 ||
    (email.length > 0 && !validEmail(email)) ||
    address.length > 300 ||
    description.length > 500
  ) {
    go('invalid', 'business-profile');
  }

  const { data, error } = await db
    .from('gr_business_profile')
    .update({
      name,
      phone,
      email,
      address,
      description,
      updated_by: ownerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('id')
    .single();

  if (error || !data) {
    go('unavailable', 'business-profile');
  }

  go('profile', 'business-profile');
}

async function updateStorefront(form: FormData) {
  'use server';

  const { db, ownerId } = await ownerClient();

  const storefront_message = value(form, 'storefront_message');
  const delivery_note = value(form, 'delivery_note');
  const returns_note = value(form, 'returns_note');

  if (
    storefront_message.length > 180 ||
    delivery_note.length > 500 ||
    returns_note.length > 500
  ) {
    go('invalid', 'storefront');
  }

  const { data, error } = await db
    .from('gr_business_profile')
    .update({
      storefront_message,
      delivery_note,
      returns_note,
      show_public_phone:
        form.get('show_public_phone') === 'on',
      show_public_email:
        form.get('show_public_email') === 'on',
      updated_by: ownerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('id')
    .single();

  if (error || !data) {
    go('unavailable', 'storefront');
  }

  go('storefront', 'storefront');
}

async function updateBank(form: FormData) {
  'use server';

  const { db, ownerId } = await ownerClient();

  const bank_name = value(form, 'bank_name');
  const bank_account_name = value(form, 'bank_account_name');
  const bank_account_number = value(
    form,
    'bank_account_number',
  );

  const clear =
    !bank_name &&
    !bank_account_name &&
    !bank_account_number;

  if (
    !clear &&
    (
      bank_name.length < 2 ||
      bank_name.length > 100 ||
      bank_account_name.length < 2 ||
      bank_account_name.length > 150 ||
      !/^\d{10}$/.test(bank_account_number)
    )
  ) {
    go('invalid', 'payments');
  }

  const { data, error } = await db
    .from('gr_business_profile')
    .update({
      bank_name,
      bank_account_name,
      bank_account_number,
      updated_by: ownerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('id')
    .single();

  if (error || !data) {
    go('unavailable', 'payments');
  }

  go('bank', 'payments');
}

async function addLocation(form: FormData) {
  'use server';

  await ownerClient();

  const result = await createLocation(form);

  if (result.status !== 'success') {
    go('invalid', 'locations');
  }

  go('new-location', 'locations');
}

async function updateLocation(form: FormData) {
  'use server';

  const { db, ownerId } = await ownerClient();

  const id = value(form, 'id');
  const address = value(form, 'address');
  const city = value(form, 'city');
  const state_region = value(form, 'state_region');
  const country = value(form, 'country') || 'Nigeria';
  const phone = value(form, 'phone');
  const hours = value(form, 'hours');
  const is_public = form.get('is_public') === 'on';

  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    address.length > 300 ||
    city.length > 100 ||
    state_region.length > 100 ||
    country.length < 2 ||
    country.length > 100 ||
    phone.length > 32 ||
    hours.length > 160
  ) {
    go('invalid', 'locations');
  }

  const { data, error: listError } = await db.rpc(
    'gr_business_locations',
    { p_public: false },
  );

  const existing = Array.isArray(data)
    ? (data as Location[]).find((row) => row.id === id)
    : null;

  if (listError || !existing) {
    go('notfound', 'locations');
  }

  if (
    is_public &&
    (
      !existing.active ||
      existing.type !== 'store' ||
      address.length < 4 ||
      city.length < 2
    )
  ) {
    go('invalid', 'locations');
  }

  const { error } = await db
    .from('gr_location_publication')
    .upsert(
      {
        location_id: id,
        address,
        city,
        state_region,
        country,
        phone,
        hours,
        is_public: Boolean(
          is_public &&
          existing.active &&
          existing.type === 'store'
        ),
        updated_by: ownerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'location_id' },
    );

  if (error) {
    go('unavailable', 'locations');
  }

  go('location', 'locations');
}

async function saveWhatsApp(form: FormData) {
  'use server';

  const { db, ownerId } = await ownerClient();

  const operation = value(form, 'operation');
  const id = value(form, 'id');
  const label = value(form, 'label');
  const number = normalizeWhatsAppNumber(
    value(form, 'number'),
  );
  const purpose = value(form, 'purpose');

  const needsFields =
    operation === 'create' || operation === 'edit';

  if (
    ![
      'create',
      'edit',
      'set_primary',
      'enable',
      'disable',
    ].includes(operation) ||
    (
      operation !== 'create' &&
      !/^[0-9a-f-]{36}$/i.test(id)
    ) ||
    (
      needsFields &&
      (
        label.length < 2 ||
        label.length > 80 ||
        !number ||
        !['orders', 'support', 'branch'].includes(purpose)
      )
    )
  ) {
    go('invalid', 'whatsapp');
  }

  const { error } = await db.rpc(
    'gr_owner_manage_whatsapp',
    {
      p_actor_id: ownerId,
      p_action: operation,
      p_id: operation === 'create' ? null : id,
      p_label: needsFields ? label : null,
      p_phone_digits: needsFields ? number : null,
      p_purpose: needsFields ? purpose : null,
    },
  );

  if (error) {
    go(
      error.code === '23505' ? 'conflict' : 'unavailable',
      'whatsapp',
    );
  }

  go('whatsapp', 'whatsapp');
}

function socialUrl(raw: string): string | null {
  try {
    const url = new URL(raw);

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !url.hostname.includes('.') ||
      raw.length > 500
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

async function saveSocial(form: FormData) {
  'use server';

  const { db, ownerId } = await ownerClient();

  const operation = value(form, 'operation');
  const id = value(form, 'id');

  if (
    ![
      'create',
      'edit',
      'enable',
      'disable',
      'delete',
    ].includes(operation) ||
    (
      operation !== 'create' &&
      !/^[0-9a-f-]{36}$/i.test(id)
    )
  ) {
    go('invalid', 'social');
  }

  if (operation === 'create' || operation === 'edit') {
    const platform = value(form, 'platform');
    const label = value(form, 'label');
    const url = socialUrl(value(form, 'url'));

    if (
      ![
        'instagram',
        'facebook',
        'tiktok',
        'x',
        'youtube',
        'linkedin',
        'website',
        'other',
      ].includes(platform) ||
      label.length < 2 ||
      label.length > 80 ||
      !url
    ) {
      go('invalid', 'social');
    }

    const entry = {
      platform,
      label,
      url,
      updated_by: ownerId,
      updated_at: new Date().toISOString(),
    };

    if (operation === 'create') {
      const { error } = await db
        .from('gr_business_social_links')
        .insert(entry);

      if (error) {
        go(
          error.code === '23505' ? 'conflict' : 'unavailable',
          'social',
        );
      }
    } else {
      const { data, error } = await db
        .from('gr_business_social_links')
        .update(entry)
        .eq('id', id)
        .select('id')
        .single();

      if (error || !data) {
        go('unavailable', 'social');
      }
    }
  } else if (operation === 'delete') {
    const { error } = await db
      .from('gr_business_social_links')
      .delete()
      .eq('id', id);

    if (error) {
      go('unavailable', 'social');
    }
  } else {
    const { data, error } = await db
      .from('gr_business_social_links')
      .update({
        is_active: operation === 'enable',
        updated_by: ownerId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id')
      .single();

    if (error || !data) {
      go('unavailable', 'social');
    }
  }

  go('social', 'social');
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Building2;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f7ecdf] text-[#a3713e]">
        <Icon size={20} aria-hidden="true" />
      </span>

      <div>
        <h2 className="font-serif text-2xl text-[#4f2439]">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[#816e79]">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

export default async function BusinessSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  await connection();

  const { db, ownerId } = await ownerClient();

  const [
    profileResult,
    locationsResult,
    contactsResult,
    socialsResult,
  ] = await Promise.all([
    db.from('gr_business_profile')
      .select('*')
      .eq('id', 1)
      .single(),

    db.rpc('gr_business_locations', {
      p_public: false,
    }),

    db.rpc('gr_owner_whatsapp_contacts', {
      p_actor_id: ownerId,
    }),

    db.from('gr_business_social_links')
      .select('*')
      .order('created_at', { ascending: true }),
  ]);

  if (
    profileResult.error ||
    locationsResult.error ||
    contactsResult.error ||
    socialsResult.error ||
    !profileResult.data ||
    !Array.isArray(locationsResult.data) ||
    !Array.isArray(contactsResult.data?.numbers) ||
    !Array.isArray(socialsResult.data)
  ) {
    return (
      <div className={cardClass} role="alert">
        <h1 className="font-serif text-3xl text-[#4f2439]">
          Business Settings
        </h1>

        <p className="mt-3 text-sm text-[#875d41]">
          Settings cannot be loaded. Check the Golden Rose
          database setup and SUPABASE_STAFF_ADMIN_SECRET_KEY
          on the trusted web server.
        </p>
      </div>
    );
  }

  const profile = profileResult.data as Profile;
  const locations = locationsResult.data as Location[];
  const contacts = contactsResult.data.numbers as WhatsApp[];
  const socials = socialsResult.data as Social[];

  const { result } = await searchParams;

  const notice =
    result &&
    Object.prototype.hasOwnProperty.call(results, result)
      ? results[result as Status]
      : null;

  const activeStores = locations.filter(
    (loc) => loc.active && loc.type === 'store',
  ).length;

  const publicStores = locations.filter(
    (loc) =>
      loc.active &&
      loc.type === 'store' &&
      loc.isPublic,
  ).length;

  const primaryNumber = contacts.find(
    (contact) => contact.isActive && contact.isPrimary,
  );

  return (
    <main className="min-w-0 space-y-6 pb-20">
      {/* HEADER */}

      <header className="rounded-2xl bg-gradient-to-r from-[#47172e] via-[#60243f] to-[#8c5060] p-6 text-white shadow-lg sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.22em] text-[#f1cf94]">
          Golden Rose · Owner controls
        </p>

        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">
          Business Settings
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
          Manage the real business details, branches,
          customer contact channels, storefront preferences
          and receiving-bank account in one place.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/10 p-3">
            <strong className="block text-2xl">
              {activeStores}
            </strong>
            <span className="text-xs text-white/75">
              Active shops
            </span>
          </div>

          <div className="rounded-xl bg-white/10 p-3">
            <strong className="block text-2xl">
              {publicStores}
            </strong>
            <span className="text-xs text-white/75">
              Published locations
            </span>
          </div>

          <div className="rounded-xl bg-white/10 p-3">
            <strong className="block text-2xl">
              {contacts.length}
            </strong>
            <span className="text-xs text-white/75">
              WhatsApp contacts
            </span>
          </div>
        </div>
      </header>

      {notice && (
        <p
          role="status"
          className="rounded-xl border border-[#e8d7bd] bg-[#fff8e9] px-4 py-3 text-sm font-semibold text-[#704329]"
        >
          {notice}
        </p>
      )}

      {/* SECTION NAVIGATION */}

      <nav
        aria-label="Business settings sections"
        className="flex flex-wrap gap-2"
      >
        {[
          ['business-profile', 'Business'],
          ['locations', 'Locations'],
          ['whatsapp', 'WhatsApp'],
          ['social', 'Social media'],
          ['storefront', 'Storefront'],
          ['payments', 'Payments'],
          ['team', 'Security'],
        ].map(([id, title]) => (
          <a
            key={id}
            href={'#' + id}
            className={subtleClass}
          >
            {title}
          </a>
        ))}
      </nav>

      {/* BUSINESS PROFILE */}

      <section
        id="business-profile"
        className={cardClass}
      >
        <SectionTitle
          icon={Building2}
          title="Business identity"
          subtitle="Official trading and contact information. Changes are saved to the business database."
        />

        <form
          action={updateProfile}
          className="grid gap-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Trading name
              <input
                className={fieldClass}
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={profile.name}
              />
            </label>

            <label className={labelClass}>
              Business phone
              <input
                className={fieldClass}
                name="phone"
                type="tel"
                maxLength={32}
                defaultValue={profile.phone}
              />
            </label>

            <label className={labelClass}>
              Business email
              <input
                className={fieldClass}
                name="email"
                type="email"
                maxLength={254}
                defaultValue={profile.email}
              />
            </label>

            <label className={labelClass}>
              Currency
              <input
                className={fieldClass + ' bg-[#f6efeb]'}
                readOnly
                value="NGN — Nigerian naira"
              />
            </label>

            <label className={labelClass + ' md:col-span-2'}>
              Registered / main address
              <textarea
                className={fieldClass + ' min-h-24'}
                name="address"
                maxLength={300}
                defaultValue={profile.address}
              />
            </label>

            <label className={labelClass + ' md:col-span-2'}>
              About the business
              <textarea
                className={fieldClass + ' min-h-24'}
                name="description"
                maxLength={500}
                defaultValue={profile.description}
              />
            </label>
          </div>

          <div>
            <button
              className={actionClass}
              type="submit"
            >
              Save business details
            </button>
          </div>
        </form>
      </section>

      {/* LOCATIONS */}

      <section id="locations" className={cardClass}>
        <SectionTitle
          icon={MapPin}
          title="Branches and locations"
          subtitle="These are the same store records used by staff assignments and inventory. A location only becomes public when the owner publishes it."
        />

        <div className="space-y-4">
          {locations.map((loc) => (
            <article
              key={loc.id}
              className="rounded-xl border border-[#ebddd6] bg-white p-4"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[#4f2439]">
                    {loc.name}
                  </h3>
                  <p className="text-xs text-[#8b7480]">
                    {loc.code} · {loc.type} ·{' '}
                    {loc.active ? 'Active' : 'Inactive'}
                  </p>
                </div>

                <span
                  className={
                    'rounded-full px-3 py-1 text-xs font-semibold ' +
                    (
                      loc.isPublic && loc.active
                        ? 'bg-green-50 text-green-800'
                        : 'bg-amber-50 text-amber-800'
                    )
                  }
                >
                  {loc.isPublic && loc.active
                    ? 'Marked public'
                    : 'Not published'}
                </span>
              </div>

              <form
                action={updateLocation}
                className="grid gap-3"
              >
                <input
                  type="hidden"
                  name="id"
                  value={loc.id}
                />

                <div className="grid gap-3 md:grid-cols-2">
                  <label className={labelClass + ' md:col-span-2'}>
                    Street / shop address
                    <input
                      className={fieldClass}
                      name="address"
                      maxLength={300}
                      defaultValue={loc.address}
                    />
                  </label>

                  <label className={labelClass}>
                    City
                    <input
                      className={fieldClass}
                      name="city"
                      maxLength={100}
                      defaultValue={loc.city}
                    />
                  </label>

                  <label className={labelClass}>
                    State / region
                    <input
                      className={fieldClass}
                      name="state_region"
                      maxLength={100}
                      defaultValue={loc.stateRegion}
                    />
                  </label>

                  <label className={labelClass}>
                    Country
                    <input
                      className={fieldClass}
                      name="country"
                      maxLength={100}
                      minLength={2}
                      required
                      defaultValue={loc.country || 'Nigeria'}
                    />
                  </label>

                  <label className={labelClass}>
                    Branch phone
                    <input
                      className={fieldClass}
                      name="phone"
                      type="tel"
                      maxLength={32}
                      defaultValue={loc.phone}
                    />
                  </label>

                  <label className={labelClass + ' md:col-span-2'}>
                    Opening hours
                    <input
                      className={fieldClass}
                      name="hours"
                      maxLength={160}
                      defaultValue={loc.hours}
                      placeholder="Monday–Saturday, 9am–6pm"
                    />
                  </label>
                </div>

                {loc.type === 'store' && loc.active ? (
                  <label className="flex items-center gap-2 text-sm font-medium text-[#57324a]">
                    <input
                      className="size-4 accent-[#5e2844]"
                      type="checkbox"
                      name="is_public"
                      defaultChecked={loc.isPublic}
                    />
                    Mark this retail location as public
                  </label>
                ) : (
                  <p className="text-xs text-[#926c4f]">
                    Internal and inactive locations cannot
                    be published.
                  </p>
                )}

                <div>
                  <button
                    type="submit"
                    className={actionClass}
                  >
                    Save {loc.name}
                  </button>
                </div>
              </form>
            </article>
          ))}
        </div>

        <div className="mt-6 rounded-xl bg-[#fcf4ea] p-4">
          <h3 className="mb-3 font-semibold text-[#4f2439]">
            Add another location
          </h3>

          <form
            action={addLocation}
            className="grid gap-3"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <label className={labelClass}>
                Name
                <input
                  className={fieldClass}
                  name="name"
                  required
                  minLength={2}
                  maxLength={150}
                  placeholder="New branch"
                />
              </label>

              <label className={labelClass}>
                Unique code
                <input
                  className={fieldClass}
                  name="code"
                  required
                  pattern="[A-Za-z0-9_-]{2,32}"
                  maxLength={32}
                  placeholder="GR-STORE-02"
                />
              </label>

              <label className={labelClass}>
                Type
                <select
                  className={fieldClass}
                  name="type"
                  defaultValue="store"
                >
                  <option value="store">Retail store</option>
                  <option value="stockroom">Stockroom</option>
                  <option value="warehouse">Warehouse</option>
                </select>
              </label>
            </div>

            <div>
              <button
                className={actionClass}
                type="submit"
              >
                Create location
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* WHATSAPP */}

      <section id="whatsapp" className={cardClass}>
        <SectionTitle
          icon={MessageCircle}
          title="WhatsApp numbers"
          subtitle="Store multiple numbers for orders, support and branches. Select one enabled primary number for online checkout."
        />

        <div className="space-y-3">
          {contacts.map((contact) => (
            <article
              className="rounded-xl border border-[#ebddd6] bg-white p-4"
              key={contact.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[#542840]">
                    {contact.label}
                    {contact.isPrimary ? ' · Primary' : ''}
                  </h3>

                  <p className="text-sm text-[#806a77]">
                    +{contact.number} · {contact.purpose}
                    {' · '}
                    {contact.isActive ? 'Enabled' : 'Disabled'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {contact.isActive && !contact.isPrimary && (
                    <form action={saveWhatsApp}>
                      <input
                        type="hidden"
                        name="operation"
                        value="set_primary"
                      />
                      <input
                        type="hidden"
                        name="id"
                        value={contact.id}
                      />
                      <button
                        className={subtleClass}
                        type="submit"
                      >
                        Make primary
                      </button>
                    </form>
                  )}

                  <form action={saveWhatsApp}>
                    <input
                      type="hidden"
                      name="operation"
                      value={
                        contact.isActive ? 'disable' : 'enable'
                      }
                    />
                    <input
                      type="hidden"
                      name="id"
                      value={contact.id}
                    />

                    <button
                      className={subtleClass}
                      type="submit"
                    >
                      {contact.isActive ? 'Disable' : 'Enable'}
                    </button>
                  </form>
                </div>
              </div>

              <details className="mt-3 border-t border-[#f0e4dd] pt-3">
                <summary className="cursor-pointer text-sm font-semibold text-[#694352]">
                  Edit this number
                </summary>

                <form
                  action={saveWhatsApp}
                  className="mt-3 grid gap-3 md:grid-cols-3"
                >
                  <input
                    type="hidden"
                    name="operation"
                    value="edit"
                  />
                  <input
                    type="hidden"
                    name="id"
                    value={contact.id}
                  />

                  <label className={labelClass}>
                    Label
                    <input
                      className={fieldClass}
                      name="label"
                      required
                      minLength={2}
                      maxLength={80}
                      defaultValue={contact.label}
                    />
                  </label>

                  <label className={labelClass}>
                    Phone with country code
                    <input
                      className={fieldClass}
                      name="number"
                      type="tel"
                      required
                      defaultValue={contact.number}
                    />
                  </label>

                  <label className={labelClass}>
                    Purpose
                    <select
                      className={fieldClass}
                      name="purpose"
                      defaultValue={contact.purpose}
                    >
                      <option value="orders">Orders</option>
                      <option value="support">Support</option>
                      <option value="branch">Branch</option>
                    </select>
                  </label>

                  <div className="md:col-span-3">
                    <button
                      className={actionClass}
                      type="submit"
                    >
                      Save number
                    </button>
                  </div>
                </form>
              </details>
            </article>
          ))}

          {!contacts.length && (
            <p className="rounded-xl bg-[#fff4e0] p-4 text-sm text-[#805434]">
              No WhatsApp numbers are saved yet.
            </p>
          )}
        </div>

        <form
          action={saveWhatsApp}
          className="mt-5 grid gap-3 rounded-xl bg-[#fcf4ea] p-4"
        >
          <h3 className="font-semibold text-[#4f2439]">
            Add WhatsApp number
          </h3>

          <input
            type="hidden"
            name="operation"
            value="create"
          />

          <div className="grid gap-3 md:grid-cols-3">
            <label className={labelClass}>
              Label
              <input
                className={fieldClass}
                name="label"
                required
                minLength={2}
                maxLength={80}
                placeholder="Online orders"
              />
            </label>

            <label className={labelClass}>
              Phone with country code
              <input
                className={fieldClass}
                name="number"
                required
                type="tel"
                placeholder="2348012345678"
              />
            </label>

            <label className={labelClass}>
              Purpose
              <select
                className={fieldClass}
                name="purpose"
                defaultValue="orders"
              >
                <option value="orders">Orders</option>
                <option value="support">Support</option>
                <option value="branch">Branch</option>
              </select>
            </label>
          </div>

          <div>
            <button
              className={actionClass}
              type="submit"
            >
              Add WhatsApp number
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs text-[#806b76]">
          {primaryNumber
            ? `Current primary contact: ${primaryNumber.label} (+${primaryNumber.number}).`
            : 'No primary number is enabled.'}
          {' '}
          The public checkout must also be connected to this
          owner-managed number before it uses the selection.
        </p>
      </section>

      {/* SOCIAL MEDIA */}

      <section id="social" className={cardClass}>
        <SectionTitle
          icon={Globe2}
          title="Social media profiles"
          subtitle="Store multiple Instagram, TikTok, Facebook, X, YouTube and other accounts."
        />

        <div className="space-y-3">
          {socials.map((social) => (
            <article
              key={social.id}
              className="rounded-xl border border-[#ebddd6] bg-white p-4"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[#51283a]">
                    {social.label}
                  </h3>

                  <p className="text-xs capitalize text-[#806b76]">
                    {social.platform} ·{' '}
                    {social.is_active ? 'Enabled' : 'Disabled'}
                  </p>

                  <a
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-sm text-[#8c5c3d] underline"
                  >
                    {social.url}
                  </a>
                </div>

                <form action={saveSocial}>
                  <input
                    type="hidden"
                    name="operation"
                    value={
                      social.is_active ? 'disable' : 'enable'
                    }
                  />
                  <input
                    type="hidden"
                    name="id"
                    value={social.id}
                  />

                  <button
                    className={subtleClass}
                    type="submit"
                  >
                    {social.is_active ? 'Disable' : 'Enable'}
                  </button>
                </form>
              </div>

              <details className="mt-3 border-t border-[#f0e4dd] pt-3">
                <summary className="cursor-pointer text-sm font-semibold text-[#694352]">
                  Edit profile
                </summary>

                <form
                  action={saveSocial}
                  className="mt-3 grid gap-3 md:grid-cols-3"
                >
                  <input
                    type="hidden"
                    name="operation"
                    value="edit"
                  />
                  <input
                    type="hidden"
                    name="id"
                    value={social.id}
                  />

                  <label className={labelClass}>
                    Platform
                    <select
                      className={fieldClass}
                      name="platform"
                      defaultValue={social.platform}
                    >
                      {[
                        'instagram',
                        'facebook',
                        'tiktok',
                        'x',
                        'youtube',
                        'linkedin',
                        'website',
                        'other',
                      ].map((platform) => (
                        <option
                          key={platform}
                          value={platform}
                        >
                          {platform}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={labelClass}>
                    Display name
                    <input
                      className={fieldClass}
                      name="label"
                      required
                      minLength={2}
                      maxLength={80}
                      defaultValue={social.label}
                    />
                  </label>

                  <label className={labelClass}>
                    HTTPS profile link
                    <input
                      className={fieldClass}
                      name="url"
                      type="url"
                      required
                      defaultValue={social.url}
                    />
                  </label>

                  <div className="md:col-span-3">
                    <button
                      className={actionClass}
                      type="submit"
                    >
                      Save profile
                    </button>
                  </div>
                </form>

                <form
                  action={saveSocial}
                  className="mt-3"
                >
                  <input
                    type="hidden"
                    name="operation"
                    value="delete"
                  />
                  <input
                    type="hidden"
                    name="id"
                    value={social.id}
                  />

                  <button
                    type="submit"
                    className="text-xs font-semibold text-red-700 underline"
                  >
                    Delete this social profile
                  </button>
                </form>
              </details>
            </article>
          ))}

          {!socials.length && (
            <p className="text-sm text-[#816e79]">
              No social accounts have been added yet.
            </p>
          )}
        </div>

        <form
          action={saveSocial}
          className="mt-5 grid gap-3 rounded-xl bg-[#fcf4ea] p-4"
        >
          <h3 className="font-semibold text-[#4f2439]">
            Add social account
          </h3>

          <input
            type="hidden"
            name="operation"
            value="create"
          />

          <div className="grid gap-3 md:grid-cols-3">
            <label className={labelClass}>
              Platform
              <select
                className={fieldClass}
                name="platform"
                defaultValue="instagram"
              >
                {[
                  'instagram',
                  'facebook',
                  'tiktok',
                  'x',
                  'youtube',
                  'linkedin',
                  'website',
                  'other',
                ].map((platform) => (
                  <option
                    key={platform}
                    value={platform}
                  >
                    {platform}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelClass}>
              Display name
              <input
                className={fieldClass}
                name="label"
                required
                minLength={2}
                maxLength={80}
                placeholder="Official Instagram"
              />
            </label>

            <label className={labelClass}>
              HTTPS URL
              <input
                className={fieldClass}
                name="url"
                type="url"
                required
                placeholder="https://www.instagram.com/..."
              />
            </label>
          </div>

          <div>
            <button
              className={actionClass}
              type="submit"
            >
              Add social profile
            </button>
          </div>
        </form>
      </section>

      {/* STOREFRONT PREFERENCES */}

      <section id="storefront" className={cardClass}>
        <SectionTitle
          icon={ShoppingBag}
          title="Storefront preferences"
          subtitle="Save customer-facing information without replacing the existing Golden Rose hero slideshow or storefront banner."
        />

        <form
          action={updateStorefront}
          className="grid gap-4"
        >
          <label className={labelClass}>
            Customer notice
            <input
              className={fieldClass}
              name="storefront_message"
              maxLength={180}
              defaultValue={profile.storefront_message}
              placeholder="Discover your next signature scent"
            />
          </label>

          <label className={labelClass}>
            Delivery information
            <textarea
              className={fieldClass + ' min-h-24'}
              name="delivery_note"
              maxLength={500}
              defaultValue={profile.delivery_note}
            />
          </label>

          <label className={labelClass}>
            Returns information
            <textarea
              className={fieldClass + ' min-h-24'}
              name="returns_note"
              maxLength={500}
              defaultValue={profile.returns_note}
            />
          </label>

          <div className="grid gap-2 text-sm text-[#5b3e4e]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="show_public_phone"
                defaultChecked={profile.show_public_phone}
                className="size-4 accent-[#5e2844]"
              />
              Allow the website to show the business phone
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="show_public_email"
                defaultChecked={profile.show_public_email}
                className="size-4 accent-[#5e2844]"
              />
              Allow the website to show the business email
            </label>
          </div>

          <p className="text-xs text-[#816e79]">
            These preferences are stored now. The public-page
            rendering of these fields is a separate website
            connection, not yet activated by this file.
          </p>

          <div>
            <button
              className={actionClass}
              type="submit"
            >
              Save storefront preferences
            </button>
          </div>
        </form>
      </section>

      {/* RECEIVING BANK */}

      <section id="payments" className={cardClass}>
        <SectionTitle
          icon={CreditCard}
          title="Receiving bank details"
          subtitle="Keep the owner-approved bank account on record. Saving an account does not prove a customer paid."
        />

        <form
          action={updateBank}
          className="grid gap-4"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <label className={labelClass}>
              Bank name
              <input
                className={fieldClass}
                name="bank_name"
                maxLength={100}
                defaultValue={profile.bank_name}
              />
            </label>

            <label className={labelClass}>
              Account name
              <input
                className={fieldClass}
                name="bank_account_name"
                maxLength={150}
                defaultValue={profile.bank_account_name}
              />
            </label>

            <label className={labelClass}>
              Account number
              <input
                className={fieldClass}
                name="bank_account_number"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                defaultValue={profile.bank_account_number}
              />
            </label>
          </div>

          <p className="rounded-xl bg-[#fff4df] p-3 text-xs leading-5 text-[#80552f]">
            Bank transfer checkout stays unverified until
            payment reconciliation is connected. Never release
            goods using only a transfer screenshot.
          </p>

          <div>
            <button
              className={actionClass}
              type="submit"
            >
              Save receiving account
            </button>
          </div>
        </form>
      </section>

      {/* STAFF AND SECURITY */}

      <section id="team" className={cardClass}>
        <SectionTitle
          icon={ShieldCheck}
          title="Owner, staff and security"
          subtitle="Use the existing employee and access controls. This page does not duplicate staff identities or passwords."
        />

        <div className="grid gap-3 md:grid-cols-2">
          <Link
            className={subtleClass + ' justify-start'}
            href="/workspace/staff"
          >
            <UsersRound
              size={17}
              className="mr-2"
            />
            Manage staff accounts and permissions
          </Link>

          <Link
            className={subtleClass + ' justify-start'}
            href="/workspace/inventory"
          >
            <Store
              size={17}
              className="mr-2"
            />
            Open inventory and locations
          </Link>
        </div>

        <p className="mt-4 text-xs text-[#816e79]">
          Only signed-in active owners may view or save
          this page. Sensitive operations are executed
          on the trusted server.
        </p>
      </section>
    </main>
  );
}
