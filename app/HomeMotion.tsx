
'use client';

import { useEffect } from 'react';

type MotionDirection = 'up' | 'left' | 'right';

type MotionRule = {
  selector: string;
  direction: MotionDirection;
};

/**
 * Fallback for browsers without CSS view-timeline animation support.
 * In supporting browsers, the existing homepage CSS owns the animations;
 * running a second JS animation system would cause competing transforms.
 *
 * Content stays visible when observers are unavailable or motion is reduced.
 */
const motionRules: readonly MotionRule[] = [
  { selector: '.gr-intro__main', direction: 'left' },
  { selector: '.gr-intro__aside', direction: 'right' },
  { selector: '.gr-section-heading > div', direction: 'left' },
  { selector: '.gr-section-heading > a', direction: 'right' },
  { selector: '.gr-product-card', direction: 'up' },
  { selector: '.gr-category-card', direction: 'up' },
  { selector: '.gr-editorial__heading', direction: 'left' },
  { selector: '.gr-editorial__main', direction: 'left' },
  { selector: '.gr-editorial__side', direction: 'right' },
  { selector: '.gr-gallery-card', direction: 'up' },
  { selector: '.gr-statement__inner', direction: 'up' },
  { selector: '.gr-experience__intro', direction: 'left' },
  { selector: '.gr-experience__step', direction: 'up' },
  { selector: '.gr-photo-mosaic__visual', direction: 'left' },
  { selector: '.gr-photo-mosaic__copy', direction: 'right' },
  { selector: '.gr-story__image', direction: 'left' },
  { selector: '.gr-story__content', direction: 'right' },
  { selector: '.gr-final__content', direction: 'up' },
  { selector: '.gr-footer__main', direction: 'up' },
];

export default function HomeMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.gr-home');
    if (!root) return;

    // page.tsx/page.css already provide native view-timeline reveals.
    const hasNativeMotion =
      typeof CSS !== 'undefined' &&
      CSS.supports('animation-timeline: view()');

    if (hasNativeMotion) return;

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

    const intersection = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('gr-motion-visible');
          intersection.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -4% 0px' },
    );

    function registerElements() {
      if (!root || motionPreference.matches) return;

      // Add the enabled class only when the fallback can observe elements.
      root.classList.add('gr-motion-enabled');

      for (const { selector, direction } of motionRules) {
        const elements = root.querySelectorAll<HTMLElement>(selector);

        elements.forEach((element, index) => {
          if (registered.has(element)) return;
          registered.add(element);

          element.classList.add(
            'gr-motion-item',
            `gr-motion-from-${direction}`,
          );

          element.style.setProperty(
            '--gr-motion-delay',
            `${(index % 4) * 65}ms`,
          );

          const rectangle = element.getBoundingClientRect();
          const alreadyVisible =
            rectangle.top < window.innerHeight * 0.9 &&
            rectangle.bottom > 0 &&
            rectangle.right > 0 &&
            rectangle.left < window.innerWidth;

          if (alreadyVisible) {
            element.classList.add('gr-motion-visible');
          } else {
            intersection.observe(element);
          }
        });
      }
    }

    let registrationFrame = 0;

    function scheduleRegistration() {
      if (registrationFrame) return;
      registrationFrame = window.requestAnimationFrame(() => {
        registrationFrame = 0;
        registerElements();
      });
    }

    // Includes products streamed into Suspense after the hero hydrates.
    const mutations = new MutationObserver(scheduleRegistration);
    mutations.observe(root, { childList: true, subtree: true });

    function updateMotionPreference() {
      if (motionPreference.matches) {
        root?.classList.remove('gr-motion-enabled');
        intersection.disconnect();
        root?.querySelectorAll('.gr-motion-item').forEach(element => {
          element.classList.add('gr-motion-visible');
        });
      } else {
        registerElements();
      }
    }

    motionPreference.addEventListener('change', updateMotionPreference);
    updateMotionPreference();

    return () => {
      mutations.disconnect();
      intersection.disconnect();
      motionPreference.removeEventListener('change', updateMotionPreference);
      if (registrationFrame) window.cancelAnimationFrame(registrationFrame);
      root.classList.remove('gr-motion-enabled');
    };
  }, []);

  return null;
}