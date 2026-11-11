import './page.css';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Flower2, ShoppingBag, Sparkles } from 'lucide-react';
import HeroSlideshow from './HeroSlideshow';

const edits = [
  { title: 'The Rose Edit', detail: 'Soft, romantic & unforgettable', image: '/assets/hero/hero-01.png', number: '01' },
  { title: 'Golden Hour', detail: 'Rich, radiant & warm', image: '/assets/hero/hero-02.png', number: '02' },
  { title: 'After Dark', detail: 'Bold, mysterious & magnetic', image: '/assets/hero/hero-03.png', number: '03' },
];

export default async function HomePage() {
  'use cache';
  return (
    <div className="gr-home">
      <div className="gr-announcement">BEAUTY OF FRAGRANCE <span aria-hidden="true">✦</span> DISCOVER YOUR SIGNATURE</div>

      <header className="gr-header">
        <div className="gr-header__inner">
          <Link href="/" className="gr-brand" aria-label="Golden Rose Perfume homepage">
            <Image src="/assets/brand/golden-rose-logo.png" alt="Golden Rose Perfume — Beauty Of Fragrance" width={1188} height={1324} sizes="80px" className="gr-brand__logo" preload />
          </Link>
          <nav className="gr-nav" aria-label="Main navigation">
            <Link href="/">Home</Link>
            <Link href="/shop">Shop All</Link>
            <a href="#collections">Collections</a>
            <a href="#gr-story">Our Story</a>
          </nav>
          <div className="gr-header__right">
            <Link className="gr-header__staff" href="/staff/sign-in">Staff access</Link>
            <Link className="gr-header__bag" href="/cart" aria-label="View cart"><ShoppingBag size={19} strokeWidth={1.5}/></Link>
            <Link className="gr-header__shop" href="/shop">Shop now <ArrowUpRight size={16}/></Link>
          </div>
        </div>
      </header>

      <main>
        <HeroSlideshow />

        <div className="gr-ticker" aria-hidden="true">
          <span>THE BEAUTY OF FRAGRANCE</span><i>✦</i><span>GOLDEN ROSE</span><i>✦</i>
          <span>SCENTS THAT STAY</span><i>✦</i><span>THE BEAUTY OF FRAGRANCE</span><i>✦</i>
        </div>

        <section id="collections" className="gr-collections gr-wrap">
          <div className="gr-section-head">
            <div><p className="gr-kicker">01 / THE COLLECTIONS</p><h2>Find your <em>feeling.</em></h2></div>
            <Link href="/shop" className="gr-underlink">Discover all fragrances <ArrowUpRight size={17} /></Link>
          </div>
          <p className="gr-section-intro">For the days you want to feel effortlessly beautiful—and the nights you want to be unforgettable.</p>
          <div className="gr-edit-grid">
            {edits.map((edit) => (
              <Link className="gr-edit" href="/shop" key={edit.number} aria-label={`Explore ${edit.title} in the shop`}>
                <Image src={edit.image} alt="" fill sizes="(max-width: 700px) 100vw, (max-width: 1050px) 50vw, 33vw" className="gr-edit__image" />
                <span className="gr-edit__shade" />
                <span className="gr-edit__number">{edit.number} / EDIT</span>
                <span className="gr-edit__body"><small>{edit.detail}</small><strong>{edit.title}</strong><span className="gr-edit__arrow"><ArrowUpRight size={22}/></span></span>
              </Link>
            ))}
          </div>
        </section>

        <section id="gr-story" className="gr-story">
          <div className="gr-story__image">
            <Image src="/assets/hero/hero-02.png" alt="Golden fragrance bottle on black marble, an artistic campaign visual" fill sizes="(max-width: 860px) 100vw, 50vw" />
            <span>AN EXPRESSION OF ELEGANCE</span>
          </div>
          <div className="gr-story__content">
            <p className="gr-kicker">02 / OUR WORLD</p>
            <Flower2 size={35} strokeWidth={.85} aria-hidden="true" className="gr-story__flower" />
            <h2>Not just a scent.<br /><em>A lasting impression.</em></h2>
            <p>A fragrance can carry a memory, change a mood and say everything without a word. Welcome to Golden Rose Perfume—where discovering your next favourite scent should feel as beautiful as wearing it.</p>
            <Link href="/shop" className="gr-underlink">Enter our world <ArrowRight size={18}/></Link>
            <span className="gr-story__monogram" aria-hidden="true">GR</span>
          </div>
        </section>

        <section className="gr-promise gr-wrap" aria-label="Golden Rose experience">
          <div><Sparkles size={24} strokeWidth={1.2} /><strong>Thoughtfully selected</strong><p>Discover perfumes for your every mood and moment.</p></div>
          <div><Flower2 size={24} strokeWidth={1.2} /><strong>Made for self-expression</strong><p>From subtle everyday signatures to bold statements.</p></div>
          <div><ShoppingBag size={24} strokeWidth={1.2} /><strong>Shop your way</strong><p>Browse online, with checkout options as they become available.</p></div>
        </section>

        <section className="gr-last-call">
          <span className="gr-last-call__glow" aria-hidden="true" />
          <p className="gr-kicker">YOUR NEXT SIGNATURE AWAITS</p>
          <h2>Let them remember <em>you.</em></h2>
          <Link href="/shop" className="gr-btn gr-btn--gold">Explore Golden Rose <ArrowUpRight size={18}/></Link>
        </section>
      </main>

      <footer className="gr-footer">
        <div className="gr-wrap gr-footer__top">
          <div><span className="gr-footer__brand">GOLDEN ROSE</span><span className="gr-footer__subtitle">PERFUME · BEAUTY OF FRAGRANCE</span><p>Beautiful scents. Memorable moments.</p></div>
          <div className="gr-footer__links"><Link href="/shop">Shop</Link><a href="#collections">Collections</a><a href="#gr-story">Our Story</a><Link href="/staff/sign-in">Staff</Link></div>
          <div className="gr-footer__icon"><Flower2 size={64} strokeWidth={.65} aria-hidden="true" /></div>
        </div>
        <div className="gr-wrap gr-footer__bottom"><span>© {new Date().getFullYear()} Golden Rose Perfume</span><span>Designed for Golden Rose · <Link href="/workspace">Business workspace</Link></span></div>
      </footer>
    </div>
  );
}
