
'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import Image from 'next/image';
import Link from 'next/link';
import HomeMotion from './HomeMotion';

import {
  ArrowDown,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from 'lucide-react';

/*
 * GOLDEN ROSE — MODERN HERO
 *
 * Real photographs already copied into your project.
 * Replace image paths here whenever you want.
 */

const PHOTO_ROOT =
  '/assets/products/telegram-selected';

const slides = [
  {
    image: `${PHOTO_ROOT}/gr-c8da9ece7f5b.jpg`,
    eyebrow: 'DISCOVER GOLDEN ROSE',
    heading: 'Your scent.',
    accent: 'Your story.',
    description:
      'Find the fragrances that feel like you. Explore scents for every mood, moment and memory.',
    position: 'center',
  },
  {
    image: `${PHOTO_ROOT}/gr-e871df6a67b8.jpg`,
    eyebrow: 'THE BEAUTY OF FRAGRANCE',
    heading: 'Every day,',
    accent: 'a new feeling.',
    description:
      'From familiar favourites to something new, discover fragrances that express your personal style.',
    position: 'center',
  },
  {
    image: `${PHOTO_ROOT}/gr-3958c14f5074.jpg`,
    eyebrow: 'EXPLORE THE COLLECTION',
    heading: 'Find your',
    accent: 'next favourite.',
    description:
      'Explore the Golden Rose collection and discover a fragrance that makes an impression.',
    position: 'center',
  },
  {
    image: `${PHOTO_ROOT}/gr-3bed367cf5c0.jpg`,
    eyebrow: 'YOUR FRAGRANCE DESTINATION',
    heading: 'A fragrance',
    accent: 'for every moment.',
    description:
      'Beautiful scents, memorable moments, and a collection waiting to be discovered.',
    position: 'center',
  },
];

const SLIDE_DURATION = 4400;
const TRANSITION_DURATION = 720;

type Direction = 'next' | 'previous';

type SlideState = {
  active: number;
  leaving: number | null;
  direction: Direction;
  sequence: number;
};

export default function HeroSlideshow() {
  const [slideState, setSlideState] = useState<SlideState>({
    active: 0,
    leaving: null,
    direction: 'next',
    sequence: 0,
  });

  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);

  const current = slides[slideState.active];

  const changeSlide = useCallback(
    (target: number, direction: Direction) => {
      setSlideState((previous) => {
        const next =
          (target + slides.length) % slides.length;

        if (next === previous.active) {
          return previous;
        }

        return {
          active: next,
          leaving: previous.active,
          direction,
          sequence: previous.sequence + 1,
        };
      });
    },
    [],
  );

  /*
   * Respect device motion preferences and avoid
   * running the slideshow in an inactive browser tab.
   */

  useEffect(() => {
    const media = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );

    const updateMotion = () => {
      setReducedMotion(media.matches);
    };

    const updateVisibility = () => {
      setTabHidden(document.hidden);
    };

    updateMotion();
    updateVisibility();

    media.addEventListener('change', updateMotion);
    document.addEventListener(
      'visibilitychange',
      updateVisibility,
    );

    return () => {
      media.removeEventListener('change', updateMotion);
      document.removeEventListener(
        'visibilitychange',
        updateVisibility,
      );
    };
  }, []);

  /*
   * Faster automatic slide transitions.
   */

  useEffect(() => {
    if (
      paused ||
      reducedMotion ||
      tabHidden ||
      slides.length <= 1
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSlideState((previous) => ({
        active: (previous.active + 1) % slides.length,
        leaving: previous.active,
        direction: 'next',
        sequence: previous.sequence + 1,
      }));
    }, SLIDE_DURATION);

    return () => window.clearTimeout(timeout);
  }, [
    slideState.sequence,
    paused,
    reducedMotion,
    tabHidden,
  ]);

  /*
   * Remove the previous slide after its exit animation.
   */

  useEffect(() => {
    if (slideState.leaving === null) {
      return;
    }

    const sequence = slideState.sequence;

    const timeout = window.setTimeout(() => {
      setSlideState((previous) => {
        if (previous.sequence !== sequence) {
          return previous;
        }

        return {
          ...previous,
          leaving: null,
        };
      });
    }, TRANSITION_DURATION);

    return () => window.clearTimeout(timeout);
  }, [
    slideState.leaving,
    slideState.sequence,
  ]);

  return (
    <section
      className="gr-hero"
      aria-label="Golden Rose fragrance slideshow"
      aria-roledescription="carousel"
    >
      {/* Activates IntersectionObserver motion only where CSS view timelines are unavailable. */}
      <HomeMotion />

      <div className="gr-container gr-hero__layout">
        {/* Animated campaign text */}

        <div className="gr-hero__copy">
          <div
            key={slideState.sequence}
            className="gr-hero__copy-inner"
            aria-live={paused ? 'polite' : 'off'}
          >
            <p className="gr-hero__eyebrow">
              <span className="gr-hero__eyebrow-line" />
              {current.eyebrow}
            </p>

            <h1 className="gr-hero__title">
              {current.heading}
              <br />
              <em>{current.accent}</em>
            </h1>

            <p className="gr-hero__description">
              {current.description}
            </p>
          </div>

          <div className="gr-hero__actions">
            <Link
              href="/shop"
              className="gr-button gr-button--dark"
            >
              Explore fragrances
              <ArrowUpRight
                size={18}
                aria-hidden="true"
              />
            </Link>

            <Link
              href="/#our-story"
              className="gr-text-link"
            >
              Our story
              <ArrowUpRight
                size={16}
                aria-hidden="true"
              />
            </Link>
          </div>

          <div
            className="gr-hero__scroll-prompt"
            aria-hidden="true"
          >
            <ArrowDown size={15} />
            <span>SCROLL TO EXPLORE</span>
          </div>
        </div>

        {/* Directional image slideshow */}

        <div
          className="gr-hero__visual"
          data-direction={slideState.direction}
        >
          <div className="gr-hero__image-frame">
            {slides.map((slide, index) => {
              const isActive =
                index === slideState.active;

              const isLeaving =
                index === slideState.leaving &&
                !isActive;

              const className = [
                'gr-hero__slide',
                isActive ? 'is-active' : '',
                isLeaving ? 'is-leaving' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={slide.image}
                  className={className}
                  aria-hidden="true"
                >
                  <Image
                    src={slide.image}
                    alt=""
                    fill
                    sizes="(max-width: 850px) 100vw, 50vw"
                    className="gr-hero__image"
                    style={{
                      objectPosition: slide.position,
                    }}
                    preload={index === 0}
                    loading={
                      index === 0 ? undefined : 'eager'
                    }
                  />
                </div>
              );
            })}

            <div className="gr-hero__photo-caption">
              <span>GOLDEN ROSE PERFUME</span>
              <span>THE BEAUTY OF FRAGRANCE</span>
            </div>
          </div>

          {/* Minimal slider controls */}

          <div className="gr-hero__navigation">
            <div className="gr-hero__progress-area">
              <span className="gr-hero__current">
                {String(
                  slideState.active + 1,
                ).padStart(2, '0')}
              </span>

              <span
                className="gr-hero__progress-track"
                aria-hidden="true"
              >
                <span
                  key={`${slideState.sequence}-${paused}-${tabHidden}`}
                  className={
                    !paused &&
                    !reducedMotion &&
                    !tabHidden
                      ? 'is-playing'
                      : ''
                  }
                />
              </span>

              <span className="gr-hero__total">
                {String(slides.length).padStart(2, '0')}
              </span>
            </div>

            <div className="gr-hero__controls">
              <button
                type="button"
                aria-label={
                  paused
                    ? 'Resume slideshow'
                    : 'Pause slideshow'
                }
                aria-pressed={paused}
                onClick={() =>
                  setPaused((value) => !value)
                }
              >
                {paused ? (
                  <Play size={16} />
                ) : (
                  <Pause size={16} />
                )}
              </button>

              <button
                type="button"
                aria-label="Previous slide"
                onClick={() =>
                  changeSlide(
                    slideState.active - 1,
                    'previous',
                  )
                }
              >
                <ChevronLeft size={20} />
              </button>

              <button
                type="button"
                aria-label="Next slide"
                onClick={() =>
                  changeSlide(
                    slideState.active + 1,
                    'next',
                  )
                }
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div
            className="gr-hero__pagination"
            aria-label="Select slideshow image"
          >
            {slides.map((slide, index) => (
              <button
                key={slide.image}
                type="button"
                className={
                  index === slideState.active
                    ? 'is-active'
                    : ''
                }
                aria-label={`Show slide ${index + 1}`}
                aria-pressed={
                  index === slideState.active
                }
                onClick={() =>
                  changeSlide(
                    index,
                    index < slideState.active
                      ? 'previous'
                      : 'next',
                  )
                }
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
