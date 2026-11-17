
'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

type HomeRailProps = {
  children: ReactNode;
  label: string;
  variant?: 'products' | 'gallery';
};

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

    if (!viewport) {
      return;
    }

    const maximumScroll =
      viewport.scrollWidth - viewport.clientWidth;

    setCanPrevious(viewport.scrollLeft > 3);
    setCanNext(
      maximumScroll > 3 &&
      viewport.scrollLeft < maximumScroll - 3,
    );
  }, []);

  useEffect(() => {
    updateControls();

    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateControls);
      observer.observe(viewport);

      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener('resize', updateControls);

    return () => {
      window.removeEventListener('resize', updateControls);
    };
  }, [updateControls, children]);

  function scroll(direction: -1 | 1) {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const firstItem =
      viewport.querySelector<HTMLElement>(
        '.gr-rail__item',
      );

    const gap =
      parseFloat(getComputedStyle(viewport).columnGap) || 0;

    const itemWidth = firstItem
      ? firstItem.getBoundingClientRect().width + gap
      : viewport.clientWidth * 0.8;

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    viewport.scrollBy({
      left: itemWidth * direction,
      behavior: reduceMotion ? 'instant' : 'smooth',
    });
  }

  return (
    <div className={`gr-rail gr-rail--${variant}`}>
      <div className="gr-rail__toolbar">
        <span className="gr-rail__hint">
          SCROLL TO EXPLORE
        </span>

        <div className="gr-rail__controls">
          <button
            type="button"
            aria-label={`Scroll ${label} left`}
            disabled={!canPrevious}
            onClick={() => scroll(-1)}
          >
            <ArrowLeft size={19} />
          </button>

          <button
            type="button"
            aria-label={`Scroll ${label} right`}
            disabled={!canNext}
            onClick={() => scroll(1)}
          >
            <ArrowRight size={19} />
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
        onScroll={updateControls}
      >
        {children}
      </div>
    </div>
  );
}
