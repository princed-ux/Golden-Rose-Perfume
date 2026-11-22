
'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { ArrowLeft, ArrowRight } from 'lucide-react';

type HomeRailProps = {
  children: ReactNode;
  label: string;
  variant?: 'products' | 'gallery';
};

/**
 * Native scroll-snap rail. Real product links and gallery images remain
 * ordinary children, so touch scrolling and keyboard focus still work.
 */
export default function HomeRail({
  children,
  label,
  variant = 'products',
}: HomeRailProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canPrevious, setCanPrevious] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateControls = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maximumScroll = Math.max(
      0,
      viewport.scrollWidth - viewport.clientWidth,
    );

    setCanPrevious(viewport.scrollLeft > 3);
    setCanNext(
      maximumScroll > 3 && viewport.scrollLeft < maximumScroll - 3,
    );
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    updateControls();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateControls)
        : null;
    resizeObserver?.observe(viewport);

    // A newly streamed product row can change scroll width even if the
    // viewport itself has not changed size.
    const mutations =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(updateControls)
        : null;
    mutations?.observe(viewport, { childList: true });

    window.addEventListener('resize', updateControls);
    const animationFrame = window.requestAnimationFrame(updateControls);

    return () => {
      resizeObserver?.disconnect();
      mutations?.disconnect();
      window.removeEventListener('resize', updateControls);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [children, updateControls]);

  const scroll = useCallback((direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const firstItem = viewport.querySelector<HTMLElement>('.gr-rail__item');
    const gap = Number.parseFloat(window.getComputedStyle(viewport).columnGap) || 0;
    const itemWidth = firstItem
      ? firstItem.getBoundingClientRect().width + gap
      : viewport.clientWidth * 0.8;

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    viewport.scrollBy({
      left: itemWidth * direction,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Let focused links and buttons handle their own keyboard events.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scroll(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      scroll(1);
    }
  }

  return (
    <div className={`gr-rail gr-rail--${variant}`}>
      <div className="gr-rail__toolbar">
        <span className="gr-rail__hint">SCROLL TO EXPLORE</span>

        <div className="gr-rail__controls">
          <button
            type="button"
            aria-label={`Scroll ${label} left`}
            disabled={!canPrevious}
            onClick={() => scroll(-1)}
          >
            <ArrowLeft size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Scroll ${label} right`}
            disabled={!canNext}
            onClick={() => scroll(1)}
          >
            <ArrowRight size={19} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="gr-rail__viewport"
        role="region"
        aria-roledescription="horizontal carousel"
        aria-label={label}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={updateControls}
      >
        {children}
      </div>
    </div>
  );
}