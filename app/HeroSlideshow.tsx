'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

const slides = [
  {
    image: '/assets/hero/hero-01.png',
    eyebrow: 'THE GOLDEN ROSE EDIT',
    lineOne: 'Leave a little',
    lineTwo: 'magic behind.',
    description: 'Fragrance is more than a finishing touch. It is the part of your story that stays.',
    label: 'THE ROSE STORY',
  },
  {
    image: '/assets/hero/hero-02.png',
    eyebrow: 'DISCOVER YOUR SIGNATURE',
    lineOne: 'Rare moments.',
    lineTwo: 'Golden memories.',
    description: 'A world of warm, captivating scents selected for every expression of you.',
    label: 'THE GOLDEN HOUR',
  },
  {
    image: '/assets/hero/hero-03.png',
    eyebrow: 'BEAUTY OF FRAGRANCE',
    lineOne: 'Wear the',
    lineTwo: 'extraordinary.',
    description: 'From delicate florals to unforgettable statements, find the feeling you want to keep.',
    label: 'AFTER DARK',
  },
];

export default function HeroSlideshow() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const interval = window.setInterval(() => {
      setActive((index) => (index + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(interval);
  }, [active, paused, reducedMotion]);

  const move = (direction: number) => {
    setActive((index) => (index + direction + slides.length) % slides.length);
  };

  return (
    <section className="gr-hero" aria-roledescription="carousel" aria-label="Golden Rose perfume campaign">
      <div className="gr-hero__images" aria-hidden="true">
        {slides.map((slide, index) => (
          <div key={slide.image} className={`gr-hero__image ${index === active ? 'is-active' : ''}`}>
            <Image
              src={slide.image}
              alt=""
              fill
              preload={index === 0}
              sizes="100vw"
              className="gr-hero__photo"
            />
          </div>
        ))}
      </div>
      <div className="gr-hero__veil" aria-hidden="true" />
      <div className="gr-hero__outline" aria-hidden="true" />

      <div className="gr-hero__body" aria-live="polite" aria-atomic="true">
        <p className="gr-hero__eyebrow"><span /> {slides[active].eyebrow}</p>
        <h1 key={`heading-${active}`} className="gr-hero__title">
          {slides[active].lineOne}<br />
          <em>{slides[active].lineTwo}</em>
        </h1>
        <p key={`copy-${active}`} className="gr-hero__description">{slides[active].description}</p>
        <div className="gr-hero__actions">
          <Link href="/shop" className="gr-btn gr-btn--gold">Explore the collection <ArrowUpRight size={18} /></Link>
          <a href="#gr-story" className="gr-btn gr-btn--text">Our story <span aria-hidden="true">↗</span></a>
        </div>
      </div>

      <div className="gr-hero__bottom">
        <div className="gr-hero__slide-status">
          <span className="gr-hero__number">{String(active + 1).padStart(2, '0')}</span>
          <div className="gr-hero__progress" key={`progress-${active}`}>
            <span className={!paused && !reducedMotion ? 'is-playing' : ''} />
          </div>
          <span className="gr-hero__total">0{slides.length}</span>
          <span className="gr-hero__label">{slides[active].label}</span>
        </div>
        <div className="gr-hero__controls">
          <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Play slideshow' : 'Pause slideshow'} title={paused ? 'Play' : 'Pause'}>
            {paused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
          </button>
          <button type="button" onClick={() => move(-1)} aria-label="Previous slide"><ChevronLeft size={20} /></button>
          <button type="button" onClick={() => move(1)} aria-label="Next slide"><ChevronRight size={20} /></button>
        </div>
      </div>
      <div className="gr-hero__side-label" aria-hidden="true">GOLDEN ROSE / BEAUTY OF FRAGRANCE</div>
    </section>
  );
}
