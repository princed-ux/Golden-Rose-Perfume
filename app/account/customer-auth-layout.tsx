import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { CustomerAuthForm } from '@/src/components/customer-auth-form';
import './page.css';
import './login/scent.css';

const copy = {
  login: {
    image: '/assets/hero/hero-01.png',
    imageAlt: 'A red fragrance bottle with a sculpted gold cap beside a crimson rose',
    eyebrow: 'Customer sign in',
    heading: 'Welcome',
    accent: 'back.',
    description: 'Sign in to continue your Golden Rose fragrance journey.',
  },
  register: {
    image: '/assets/hero/hero-03.png',
    imageAlt: 'A ruby glass perfume bottle with a gold cap surrounded by red roses',
    eyebrow: 'Customer registration',
    heading: 'Make it',
    accent: 'yours.',
    description: 'Create your Golden Rose account and discover your next signature scent.',
  },
};

const trails = [
  'M-45 754 C142 735 308 655 262 548 S109 439 166 322 S329 175 403 30',
  'M-38 720 C123 735 297 615 220 507 S109 420 182 309 S341 211 450 -25',
  'M-36 784 C167 762 340 678 300 565 S146 459 214 339 S410 208 485 2',
];
const particles = [
  { left: '13%', top: '57%', animationDelay: '-1s' },
  { left: '23%', top: '47%', animationDelay: '-6s' },
  { left: '31%', top: '29%', animationDelay: '-3s' },
  { left: '37%', top: '55%', animationDelay: '-8s' },
  { left: '42%', top: '21%', animationDelay: '-4s' },
  { left: '58%', top: '35%', animationDelay: '-9s' },
  { left: '72%', top: '16%', animationDelay: '-2s' },
];

function FragranceMotion({ mode }: { mode: keyof typeof copy }) {
  const gradient = 'gr-boutique-scent-' + mode;

  return (
    <div className="gr-boutique__motion" aria-hidden="true">
      <svg className="gr-boutique__scent" viewBox="0 0 800 900" preserveAspectRatio="none" focusable="false">
        <defs>
          <linearGradient id={gradient} x1="0%" y1="100%" x2="85%" y2="0%">
            <stop offset="0%" stopColor="#c08b48" stopOpacity="0" />
            <stop offset="28%" stopColor="#f1ca83" stopOpacity=".52" />
            <stop offset="64%" stopColor="#fff0cd" stopOpacity=".9" />
            <stop offset="100%" stopColor="#dfb777" stopOpacity="0" />
          </linearGradient>
        </defs>
        {trails.map(trail => (
          <path key={trail} d={trail} pathLength={100} stroke={'url(#' + gradient + ')'} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {particles.map(particle => <span key={particle.left} className="gr-boutique__particle" style={particle} />)}
    </div>
  );
}

export function CustomerAuthLayout({ mode, notice }: { mode: keyof typeof copy; notice?: ReactNode }) {
  const content = copy[mode];

  return (
    <main className={'gr-auth gr-boutique gr-boutique--' + mode}>
      <header className="gr-boutique__header">
        <Link href="/" className="gr-boutique__brand" aria-label="Golden Rose Perfume homepage">
          <Image src="/assets/brand/golden-rose-logo.png" alt="" width={44} height={49} unoptimized />
          <span>GOLDEN ROSE<small>BEAUTY OF FRAGRANCE</small></span>
        </Link>
        <Link href="/" className="gr-boutique__back" aria-label="Back to boutique">
          <ArrowLeft size={15} aria-hidden="true" /><span>Back to boutique</span>
        </Link>
      </header>

      <div className="gr-boutique__split">
        <div className="gr-boutique__visual">
          <figure className="gr-boutique__stage">
            <div className="gr-boutique__image">
              <Image src={content.image} alt={content.imageAlt} fill preload
                sizes="(max-width: 1059px) 100vw, 54vw" className="gr-boutique__photo" />
            </div>
            <FragranceMotion mode={mode} />
            <figcaption className="gr-boutique__caption">
              <span>THE ART OF FRAGRANCE</span>
              <p>Every scent<br /><em>tells a story.</em></p>
            </figcaption>
          </figure>
        </div>

        <section className="gr-boutique__form-zone" aria-labelledby="boutique-title">
          <div className="gr-boutique__glass">
            <div className="gr-boutique__intro">
              <p>{content.eyebrow}</p>
              <h1 id="boutique-title">{content.heading} <em>{content.accent}</em></h1>
              <p>{content.description}</p>
            </div>
            {notice}
            <CustomerAuthForm mode={mode} />
            <nav className="gr-boutique__links" aria-label="Customer authentication">
              {mode === 'login' ? <>
                <Link href="/account/forgot-password">Forgot your password?</Link>
                <p>New to Golden Rose? <Link href="/account/register">Create an account <ArrowUpRight size={13} aria-hidden="true" /></Link></p>
              </> : <p>Already have an account? <Link href="/account/login">Sign in <ArrowUpRight size={13} aria-hidden="true" /></Link></p>}
            </nav>
          </div>
        </section>
      </div>
    </main>
  );
}
