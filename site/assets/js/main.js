(() => {
  'use strict';

  console.log('[sociology-seminar] main.js v6 loaded');

  /* ===================================================
     OPENING — CSS drives choreography.
     JS adds: smooth canvas particles, skip, site reveal.
     =================================================== */

  const OPENING_DURATION = 9800;
  const FADE_OUT_MS = 1000;

  const opening = document.getElementById('opening');
  const site = document.getElementById('site');
  const skipBtn = document.getElementById('opening-skip');
  const canvas = document.getElementById('op-particles');
  let finished = false;
  let rafId = null;

  /* ----- Smooth canvas particle layer ----- */
  const ctx = canvas ? canvas.getContext('2d') : null;
  let W = 0, H = 0, dpr = 1;
  let particles = [];
  let last = 0;

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedParticles() {
    const count = Math.min(120, Math.floor((W * H) / 14000));
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.2 + 0.4,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -Math.random() * 0.25 - 0.04,
        life: Math.random(),
        speedLife: 0.0015 + Math.random() * 0.004,
        hue: Math.random() < 0.2 ? 'azure' : 'gold',
      });
    }
  }

  function renderFrame(ts) {
    if (!ctx) return;
    if (!last) last = ts;
    last = ts;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life += p.speedLife;
      if (p.y < -20 || p.life > 1.3) {
        p.x = Math.random() * W;
        p.y = H + Math.random() * 40;
        p.life = 0;
      }
      const fade = Math.max(0, Math.sin(p.life * Math.PI));
      const alpha = fade * (p.hue === 'azure' ? 0.55 : 0.85);
      const color = p.hue === 'azure'
        ? `rgba(111, 169, 255, ${alpha})`
        : `rgba(231, 212, 163, ${alpha})`;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';

    rafId = requestAnimationFrame(renderFrame);
  }

  function startParticles() {
    if (!canvas || !ctx) return;
    resizeCanvas();
    seedParticles();
    rafId = requestAnimationFrame(renderFrame);
    window.addEventListener('resize', () => { resizeCanvas(); seedParticles(); });
  }

  /* ----- lifecycle ----- */
  function revealSite() {
    if (!site) return;
    site.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => site.classList.add('is-visible'));
  }

  function finishOpening(fadeMs) {
    if (finished) return;
    finished = true;
    if (opening) opening.classList.add('is-done');
    revealSite();
    setTimeout(() => {
      if (rafId) cancelAnimationFrame(rafId);
      if (opening && opening.parentNode) opening.parentNode.removeChild(opening);
    }, (fadeMs || FADE_OUT_MS) + 100);
  }

  if (skipBtn) skipBtn.addEventListener('click', () => finishOpening(400));

  document.addEventListener('keydown', (e) => {
    if (finished) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      finishOpening(400);
    }
  });

  setTimeout(() => finishOpening(FADE_OUT_MS), OPENING_DURATION + FADE_OUT_MS);
  setTimeout(() => { if (!finished) finishOpening(0); }, OPENING_DURATION + FADE_OUT_MS + 3000);

  /* ===================================================
     Main site interactions
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
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
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
    setYear();
    setupReveal();
    setupSmoothScroll();
    setupParallax();
    setupNavShrink();
    startParticles();
  });
})();
