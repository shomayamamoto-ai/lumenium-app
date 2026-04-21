(() => {
  'use strict';

  const OPENING_DURATION = 4600;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ===================================================
     OPENING MOVIE — particle / light canvas
     =================================================== */
  const canvas = document.getElementById('opening-canvas');
  const ctx = canvas.getContext('2d');
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let particles = [];
  let rays = [];
  let rafId = null;
  let startTs = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth = window.innerWidth;
    H = canvas.clientHeight = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedParticles() {
    const count = Math.min(180, Math.floor((W * H) / 9000));
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.6 + 0.2,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -Math.random() * 0.35 - 0.05,
        life: Math.random() * 1,
        hue: Math.random() < 0.18 ? 'azure' : 'gold',
      });
    }
    rays = [];
    for (let i = 0; i < 5; i++) {
      rays.push({
        x: Math.random() * W,
        speed: 0.0008 + Math.random() * 0.0012,
        phase: Math.random() * Math.PI * 2,
        width: 140 + Math.random() * 220,
      });
    }
  }

  function tick(ts) {
    if (!startTs) startTs = ts;
    const t = (ts - startTs) / 1000;

    ctx.clearRect(0, 0, W, H);

    // Light rays (soft diagonal sweeps)
    ctx.globalCompositeOperation = 'lighter';
    rays.forEach((r) => {
      const cx = (Math.sin(t * r.speed * 1000 + r.phase) * 0.5 + 0.5) * W;
      const g = ctx.createLinearGradient(cx - r.width, 0, cx + r.width, H);
      g.addColorStop(0,   'rgba(200, 169, 106, 0)');
      g.addColorStop(0.5, 'rgba(231, 212, 163, 0.06)');
      g.addColorStop(1,   'rgba(111, 169, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r.width, 0, r.width * 2, H);
    });

    // Particles (lumens rising)
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life += 0.005;

      if (p.y < -10 || p.x < -10 || p.x > W + 10) {
        p.x = Math.random() * W;
        p.y = H + 10;
        p.life = 0;
      }

      const alpha = Math.max(0, 0.85 - Math.abs(p.life - 0.5) * 1.2);
      const color = p.hue === 'azure'
        ? `rgba(111, 169, 255, ${alpha * 0.9})`
        : `rgba(231, 212, 163, ${alpha})`;

      // glow
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.shadowBlur = 18;
      ctx.shadowColor = color;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';

    rafId = requestAnimationFrame(tick);
  }

  function startOpening() {
    if (prefersReducedMotion) {
      finishOpening(0);
      return;
    }
    resize();
    seedParticles();
    rafId = requestAnimationFrame(tick);
    window.addEventListener('resize', onResize);
    setTimeout(() => finishOpening(1200), OPENING_DURATION);
  }

  function onResize() {
    resize();
    seedParticles();
  }

  function finishOpening(fadeMs) {
    const opening = document.getElementById('opening');
    const site = document.getElementById('site');
    if (!opening || !site) return;

    opening.classList.add('is-done');
    site.setAttribute('aria-hidden', 'false');
    // Next frame to allow paint before transition
    requestAnimationFrame(() => site.classList.add('is-visible'));

    setTimeout(() => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      opening.remove();
    }, fadeMs + 200);
  }

  const skipBtn = document.getElementById('opening-skip');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => finishOpening(400));
  }

  // Keyboard skip (Esc / Enter / Space)
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('opening') &&
        (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      finishOpening(400);
    }
  }, { once: false });

  /* ===================================================
     SCROLL REVEAL
     =================================================== */
  function setupReveal() {
    const targets = document.querySelectorAll('.section, .hero__content, .book, .activity, .pillar, .about__card');
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
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    targets.forEach((el) => io.observe(el));
  }

  /* ===================================================
     SMOOTH SCROLL FOR ANCHOR LINKS
     =================================================== */
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

  /* ===================================================
     FOOTER YEAR
     =================================================== */
  function setYear() {
    const y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  /* ===================================================
     INIT
     =================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    setYear();
    setupReveal();
    setupSmoothScroll();
    startOpening();
  });
})();
