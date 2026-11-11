import Link from 'next/link';

export default function AccountPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <span className="overline">YOUR GOLDEN ROSE</span>
        <h1 className="text-3xl">Your customer account</h1>
        <p className="max-w-2xl text-sm leading-7 text-[#77706c]">
          A place for your orders and personal details. Account access will be available once sign-in is connected.
        </p>
      </header>
      <div className="flex flex-wrap gap-5">
        <Link href="/account/login" className="button button--dark">Customer sign in</Link>
        <Link href="/account/register" className="button button--outline">Create a customer account</Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <section className="flex flex-col items-start gap-3 rounded border border-[#e9e3db] p-6">
          <h2 className="text-xl">Orders</h2>
          <p className="text-sm leading-6 text-[#77706c]">View purchases and delivery updates when your account is available.</p>
          <Link href="/account/orders" className="text-link">View order page</Link>
        </section>
        <section className="flex flex-col items-start gap-3 rounded border border-[#e9e3db] p-6">
          <h2 className="text-xl">Personal details</h2>
          <p className="text-sm leading-6 text-[#77706c]">Your contact details and preferences will belong to your customer account.</p>
          <Link href="/account/settings" className="text-link">View account settings</Link>
        </section>
      </div>
      <Link href="/shop" className="text-link self-start">Explore fragrances</Link>
    </div>
  );
}
