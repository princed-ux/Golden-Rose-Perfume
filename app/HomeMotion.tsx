
'use client';

import { useEffect } from 'react';

type MotionDirection = 'up' | 'left' | 'right';

type MotionRule = {
  selector: string;
  direction: MotionDirection;
};

/*
 * GOLDEN ROSE — SCROLL MOTION
 *
 * Left / right / upward reveals.
 *
 * Uses IntersectionObserver to animate elements
 * only when they enter the visible viewport.
 *
 * Uses MutationObserver so dynamically loaded
 * catalogue products are included.
 *
 * No external animation dependency required.
 */

const motionRules: MotionRule[] = [
  {
    selector: '.gr-intro__main',
    direction: 'left',
  },
  {
    selector: '.gr-intro__aside',
    direction: 'right',
  },
  {
    selector: '.gr-section-heading > div',
    direction: 'left',
  },
  {
    selector: '.gr-section-heading > a',
    direction: 'right',
  },
  {
    selector: '.gr-product-card',
    direction: 'up',
  },
  {
    selector: '.gr-category-card',
    direction: 'up',
  },
  {
    selector: '.gr-editorial__heading',
    direction: 'left',
  },
  {
    selector: '.gr-editorial__main',
    direction: 'left',
  },
  {
    selector: '.gr-editorial__side',
    direction: 'right',
  },
  {
    selector: '.gr-gallery-card',
    direction: 'up',
  },
  {
    selector: '.gr-statement__inner',
    direction: 'up',
  },
  {
    selector: '.gr-experience__intro',
    direction: 'left',
  },
  {
    selector: '.gr-experience__step',
    direction: 'up',
  },
  {
    selector: '.gr-story__image',
    direction: 'left',
  },
  {
    selector: '.gr-story__content',
    direction: 'right',
  },
  {
    selector: '.gr-final__content',
    direction: 'up',
  },
  {
    selector: '.gr-footer__main',
    direction: 'up',
  },
];

export default function HomeMotion() {
  useEffect(() => {
    const root =
      document.querySelector<HTMLElement>('.gr-home');

    if (!root) {
      return;
    }

    if (
      typeof IntersectionObserver === 'undefined' ||
      typeof MutationObserver === 'undefined'
    ) {
      return;
    }

    const motionPreference = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );

    const registered = new WeakSet<Element>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add(
            'gr-motion-visible',
          );

          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -5% 0px',
      },
    );

    /*
     * Register elements.
     * Existing elements are only registered once.
     */

    function registerElements() {
      if (!root || motionPreference.matches) {
        return;
      }

      root.classList.add('gr-motion-enabled');

      motionRules.forEach(
        ({ selector, direction }) => {
          const elements =
            root.querySelectorAll<HTMLElement>(selector);

          elements.forEach((element, index) => {
            if (registered.has(element)) {
              return;
            }

            registered.add(element);

            element.classList.add(
              'gr-motion-item',
              `gr-motion-from-${direction}`,
            );

            /*
             * Small sequential delays for product
             * and category cards.
             */

            const delay = (index % 4) * 65;

            element.style.setProperty(
              '--gr-motion-delay',
              `${delay}ms`,
            );

            const rectangle =
              element.getBoundingClientRect();

            /*
             * Never hide content already on screen.
             */

            if (
              rectangle.top <
                window.innerHeight * 0.88 &&
              rectangle.bottom > 0
            ) {
              element.classList.add(
                'gr-motion-visible',
              );
            } else {
              observer.observe(element);
            }
          });
        },
      );
    }

    let animationFrame = 0;

    function scheduleRegistration() {
      if (animationFrame !== 0) {
        return;
      }

      animationFrame = window.requestAnimationFrame(
        () => {
          animationFrame = 0;
          registerElements();
        },
      );
    }

    /*
     * Detect catalogue sections streamed into
     * the homepage after initial render.
     */

    const mutationObserver = new MutationObserver(
      scheduleRegistration,
    );

    mutationObserver.observe(root, {
      childList: true,
      subtree: true,
    });

    /*
     * Respond when the visitor changes their
     * operating-system motion preference.
     */

    function handleMotionPreference() {
      if (!root) {
        return;
      }

      if (motionPreference.matches) {
        root.classList.remove(
          'gr-motion-enabled',
        );

        observer.disconnect();

        root
          .querySelectorAll<HTMLElement>(
            '.gr-motion-item',
          )
          .forEach((element) => {
            element.classList.add(
              'gr-motion-visible',
            );
          });
      } else {
        registerElements();
      }
    }

    motionPreference.addEventListener(
      'change',
      handleMotionPreference,
    );

    registerElements();

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();

      motionPreference.removeEventListener(
        'change',
        handleMotionPreference,
      );

      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }

      root.classList.remove(
        'gr-motion-enabled',
      );
    };
  }, []);

  return null;
}