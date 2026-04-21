(() => {
  'use strict';

  console.log('[sociology-seminar] main.js v5 loaded at', new Date().toISOString());

  /* ===================================================
     OPENING MOVIE — minimal controller
     Animations are 100% CSS; JS only reveals the site
     after the timeline ends and handles the skip button.
     =================================================== */

  const OPENING_DURATION = 9500;   // CSS timeline ends
  const FADE_OUT_MS = 1000;         // CSS fade-out length

  const opening = document.getElementById('opening');
  const site = document.getElementById('site');
  const skipBtn = document.getElementById('opening-skip');
  let finished = false;

  function revealSite() {
    if (!site) return;
    site.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => site.classList.add('is-visible'));
    console.log('[sociology-seminar] site revealed');
  }

  function finishOpening(fadeMs) {
    if (finished) return;
    finished = true;
    console.log('[sociology-seminar] opening finishing');
    if (opening) opening.classList.add('is-done');
    revealSite();
    setTimeout(() => {
      if (opening && opening.parentNode) opening.parentNode.removeChild(opening);
    }, (fadeMs || FADE_OUT_MS) + 100);
  }

  // Skip button
  if (skipBtn) {
    skipBtn.addEventListener('click', () => finishOpening(400));
  }

  // Keyboard skip
  document.addEventListener('keydown', (e) => {
    if (finished) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      finishOpening(400);
    }
  });

  // Auto-finish after CSS timeline
  setTimeout(() => {
    console.log('[sociology-seminar] auto-finishing after timeline');
    finishOpening(FADE_OUT_MS);
  }, OPENING_DURATION + FADE_OUT_MS);

  // Safety: if something hangs, kill the opening hard
  setTimeout(() => {
    if (!finished) {
      console.warn('[sociology-seminar] safety finish triggered');
      finishOpening(0);
    }
  }, OPENING_DURATION + FADE_OUT_MS + 3000);

  /* ===================================================
     SCROLL REVEAL
     =================================================== */
  function setupReveal() {
    const targets = document.querySelectorAll(
      '.section, .hero__content, .book, .activity, .pillar, .about__card, .value, .section__header, .philosophy__quote, .creed__statement, .process__step, .faq__item'
    );
    targets.forEach((el) => el.setAttribute('data-reveal', ''));
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );
    targets.forEach((el) => io.observe(el));
  }

  function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (!id || id === '#') return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function setupParallax() {
    const els = document.querySelectorAll('[data-parallax]');
    if (!els.length) return;
    let ticking = false;
    function update() {
      const y = window.scrollY;
      els.forEach((el) => {
        const speed = parseFloat(el.getAttribute('data-parallax') || '0.15');
        el.style.transform = `translate3d(0, ${y * speed}px, 0)`;
      });
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
  }

  function setupNavShrink() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function setYear() {
    const y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  document.addEventListener('DOMContentLoaded', () => {
    console.log('[sociology-seminar] DOMContentLoaded');
    setYear();
    setupReveal();
    setupSmoothScroll();
    setupParallax();
    setupNavShrink();
  });
})();
