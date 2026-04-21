(() => {
  'use strict';

  /* ===================================================
     CINEMATIC OPENING MOVIE
     =================================================== */

  const SCENES = [
    { id: 1, dur: 1400, label: '01 / 04' },
    { id: 2, dur: 1800, label: '02 / 04' },
    { id: 3, dur: 2000, label: '03 / 04' },
    { id: 4, dur: 3300, label: '04 / 04' },
  ];
  const FADE_OUT_MS = 1200;
  const TOTAL_DURATION = SCENES.reduce((a, s) => a + s.dur, 0);

  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const opening = document.getElementById('opening');
  const canvas = document.getElementById('opening-canvas');
  const sceneIndicator = document.getElementById('opening-scene-indicator');
  const barFill = document.getElementById('opening-bar-fill');
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
  let sceneTimers = [];
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedParticles() {
    const count = Math.min(220, Math.floor((W * H) / 7200));
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
        len: 80 + Math.random() * 180,
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
    if (!startTs) startTs = ts;
    const elapsed = ts - startTs;
    const t = elapsed / 1000;

    // Progress bar in HUD
    if (barFill) {
      const prog = Math.min(1, elapsed / TOTAL_DURATION);
      barFill.style.width = (prog * 100).toFixed(1) + '%';
    }

    ctx.clearRect(0, 0, W, H);

    // ---- Radial glow backdrop ----
    const bgGrad = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.6);
    bgGrad.addColorStop(0, 'rgba(30, 45, 85, 0.55)');
    bgGrad.addColorStop(0.5, 'rgba(15, 21, 40, 0.3)');
    bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ---- Diagonal light rays (lighter blend) ----
    ctx.globalCompositeOperation = 'lighter';
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

    // ---- Streaks (soft moving lines) ----
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

    // ---- Particles (rising lumens) ----
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

  function setScene(id) {
    if (!opening) return;
    opening.setAttribute('data-scene', String(id));
    const scene = SCENES.find((s) => s.id === id);
    if (sceneIndicator && scene) sceneIndicator.textContent = scene.label;
  }

  function startSceneSequence() {
    let acc = 0;
    SCENES.forEach((scene, idx) => {
      acc += scene.dur;
      if (idx < SCENES.length - 1) {
        const next = SCENES[idx + 1];
        sceneTimers.push(setTimeout(() => setScene(next.id), acc));
      }
    });
    sceneTimers.push(setTimeout(() => finishOpening(FADE_OUT_MS), TOTAL_DURATION));
  }

  function clearTimers() {
    sceneTimers.forEach((t) => clearTimeout(t));
    sceneTimers = [];
  }

  function finishOpening(fadeMs) {
    if (finished || !opening || !site) return;
    finished = true;
    clearTimers();

    opening.classList.add('is-done');
    site.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => site.classList.add('is-visible'));

    setTimeout(() => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      if (opening && opening.parentNode) opening.parentNode.removeChild(opening);
    }, (fadeMs || FADE_OUT_MS) + 200);
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

    if (!canvas || !opening) {
      finishOpening(0);
      return;
    }

    resizeCanvas();
    seedParticles();
    rafId = requestAnimationFrame(renderFrame);
    window.addEventListener('resize', onResize);

    setScene(1);
    startSceneSequence();
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

  /* ===================================================
     SMOOTH SCROLL
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
     PARALLAX (hero background)
     =================================================== */
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
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
  }

  /* ===================================================
     NAV: shrink on scroll
     =================================================== */
  function setupNavShrink() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const onScroll = () => {
      nav.classList.toggle('is-scrolled', window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
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
    setupParallax();
    setupNavShrink();
    startOpening();
  });

  // Safety fallback: if anything fails, still show the site after total duration + buffer
  setTimeout(() => {
    if (!finished) finishOpening(600);
  }, TOTAL_DURATION + FADE_OUT_MS + 1500);
})();
