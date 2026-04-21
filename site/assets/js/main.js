(() => {
  'use strict';

  /* ===================================================
     OPENING — canvas particles + skip-to-site
     (Scene choreography is 100% CSS-driven.)
     =================================================== */

  const OPENING_DURATION = 10200; // matches CSS total timeline
  const FADE_OUT_MS = 1200;

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const opening = document.getElementById('opening');
  const canvas = document.getElementById('opening-canvas');
  const skipBtn = document.getElementById('opening-skip');
  const site = document.getElementById('site');

  let ctx = null;
  let dpr = 1;
  let W = 0, H = 0;
  let particles = [];
  let streaks = [];
  let rays = [];
  let rafId = null;
  let startTs = 0;
  let finished = false;

  function resizeCanvas() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedParticles() {
    const count = Math.min(240, Math.floor((W * H) / 7000));
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.6 + 0.3,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -Math.random() * 0.55 - 0.08,
        life: Math.random(),
        speedLife: 0.002 + Math.random() * 0.006,
        hue: Math.random() < 0.18 ? 'azure' : 'gold',
      });
    }
    streaks = [];
    for (let i = 0; i < 7; i++) {
      streaks.push({
        x: Math.random() * W,
        y: Math.random() * H,
        len: 80 + Math.random() * 200,
        angle: (Math.random() * 0.6 - 0.3) + 0.2,
        speed: 2 + Math.random() * 4,
        alpha: 0.15 + Math.random() * 0.35,
      });
    }
    rays = [];
    for (let i = 0; i < 4; i++) {
      rays.push({
        cx: Math.random() * W,
        width: 180 + Math.random() * 240,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.8,
      });
    }
  }

  function renderFrame(ts) {
    if (!ctx) return;
    if (!startTs) startTs = ts;
    const t = (ts - startTs) / 1000;

    ctx.clearRect(0, 0, W, H);

    // radial glow backdrop
    const bgGrad = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.6);
    bgGrad.addColorStop(0, 'rgba(30, 45, 85, 0.6)');
    bgGrad.addColorStop(0.5, 'rgba(15, 21, 40, 0.3)');
    bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';

    // diagonal rays
    rays.forEach((r, idx) => {
      const cx = (Math.sin(t * r.speed + r.phase) * 0.5 + 0.5) * W;
      const g = ctx.createLinearGradient(cx - r.width, 0, cx + r.width, H);
      const baseAlpha = 0.04 + Math.abs(Math.sin(t * 0.5 + idx)) * 0.05;
      g.addColorStop(0, 'rgba(200, 169, 106, 0)');
      g.addColorStop(0.5, `rgba(231, 212, 163, ${baseAlpha})`);
      g.addColorStop(1, 'rgba(111, 169, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r.width, 0, r.width * 2, H);
    });

    // streaks
    streaks.forEach((s) => {
      s.x += Math.cos(s.angle) * s.speed;
      s.y += Math.sin(s.angle) * s.speed * 0.3;
      if (s.x > W + 200) { s.x = -200; s.y = Math.random() * H; }
      const g = ctx.createLinearGradient(s.x, s.y, s.x + s.len, s.y);
      g.addColorStop(0, 'rgba(231, 212, 163, 0)');
      g.addColorStop(0.5, `rgba(231, 212, 163, ${s.alpha})`);
      g.addColorStop(1, 'rgba(231, 212, 163, 0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.len, s.y);
      ctx.stroke();
    });

    // particles
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life += p.speedLife;
      if (p.y < -15 || p.life > 1.4 || p.x < -20 || p.x > W + 20) {
        p.x = Math.random() * W;
        p.y = H + Math.random() * 40;
        p.life = 0;
      }
      const fade = Math.max(0, Math.sin(p.life * Math.PI));
      const alpha = fade * (p.hue === 'azure' ? 0.75 : 0.95);
      const color = p.hue === 'azure'
        ? `rgba(111, 169, 255, ${alpha})`
        : `rgba(231, 212, 163, ${alpha})`;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.shadowBlur = 22;
      ctx.shadowColor = color;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';

    rafId = requestAnimationFrame(renderFrame);
  }

  function revealSite() {
    if (!site) return;
    site.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => site.classList.add('is-visible'));
  }

  function finishOpening(fadeMs) {
    if (finished || !opening) return;
    finished = true;
    opening.classList.add('is-done');
    revealSite();
    setTimeout(() => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      if (opening && opening.parentNode) opening.parentNode.removeChild(opening);
    }, (fadeMs || FADE_OUT_MS) + 100);
  }

  function onResize() {
    resizeCanvas();
    seedParticles();
  }

  function startOpening() {
    if (prefersReducedMotion) {
      finishOpening(0);
      return;
    }
    if (canvas) {
      resizeCanvas();
      seedParticles();
      rafId = requestAnimationFrame(renderFrame);
      window.addEventListener('resize', onResize);
    }
    // Site reveal on CSS timeline completion
    setTimeout(() => revealSite(), OPENING_DURATION);
    // Final cleanup slightly after CSS fade-out completes
    setTimeout(() => finishOpening(FADE_OUT_MS), OPENING_DURATION + FADE_OUT_MS + 200);
  }

  if (skipBtn) {
    skipBtn.addEventListener('click', () => finishOpening(450));
  }

  document.addEventListener('keydown', (e) => {
    if (finished) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      finishOpening(450);
    }
  });

  /* ===================================================
     SCROLL REVEAL
     =================================================== */
  function setupReveal() {
    const targets = document.querySelectorAll(
      '.section, .hero__content, .book, .activity, .pillar, .about__card, .value, .section__header, .philosophy__quote, .creed__statement'
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
    setYear();
    setupReveal();
    setupSmoothScroll();
    setupParallax();
    setupNavShrink();
    startOpening();
  });

  // ultra safety fallback
  setTimeout(() => { if (!finished) finishOpening(600); }, OPENING_DURATION + FADE_OUT_MS + 3000);
})();
