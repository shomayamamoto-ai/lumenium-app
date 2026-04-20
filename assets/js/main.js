/* AdvoVisions — shared behavior */

// Preloader
(function () {
  const pre = document.querySelector(".preloader");
  if (!pre) return;
  const done = () => pre.classList.add("done");
  if (document.readyState === "complete") setTimeout(done, 400);
  else window.addEventListener("load", () => setTimeout(done, 500));
})();

// Scroll progress bar
(function () {
  const bar = document.querySelector(".scroll-progress");
  if (!bar) return;
  const update = () => {
    const h = document.documentElement;
    const total = h.scrollHeight - h.clientHeight;
    const pct = total > 0 ? (window.scrollY / total) * 100 : 0;
    bar.style.width = pct + "%";
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
})();

// Header scroll state — transparent over hero, solid on scroll
(function () {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const hasHero = header.classList.contains("on-hero");
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle("scrolled", y > 40);
    if (hasHero) {
      const hero = document.querySelector(".hero");
      const threshold = hero ? hero.offsetHeight - 80 : 120;
      header.classList.toggle("on-hero", y < threshold);
    }
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();

// Mobile nav toggle
(function () {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    toggle.classList.toggle("open");
    nav.classList.toggle("open");
  });
})();

// Reveal on scroll
(function () {
  const els = document.querySelectorAll(".reveal, .stagger");
  if (!("IntersectionObserver" in window) || !els.length) {
    els.forEach(e => e.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  els.forEach(el => io.observe(el));
})();

// Animated number counters
(function () {
  const counters = document.querySelectorAll("[data-count]");
  if (!counters.length || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseInt(el.dataset.count, 10) || 0;
      const duration = 1600;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * eased).toLocaleString();
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      io.unobserve(el);
    });
  }, { threshold: 0.3 });
  counters.forEach(c => io.observe(c));
})();

// Work card hover-play for videos, and click → modal
(function () {
  const cards = document.querySelectorAll(".work-card");
  cards.forEach(card => {
    const v = card.querySelector("video");
    if (v) {
      card.addEventListener("mouseenter", () => {
        try { v.currentTime = 0; v.play().catch(() => {}); } catch (_) {}
      });
      card.addEventListener("mouseleave", () => {
        try { v.pause(); } catch (_) {}
      });
    }
    card.addEventListener("click", () => openModal(card));
  });

  const modal = document.getElementById("video-modal");
  const modalVideo = modal?.querySelector("video");
  const modalTitle = modal?.querySelector(".modal-caption .title");
  const modalClient = modal?.querySelector(".modal-caption .client");

  function openModal(card) {
    if (!modal) return;
    const src = card.querySelector("video source")?.getAttribute("src");
    const poster = card.querySelector("video")?.getAttribute("poster")
                 || card.querySelector("img")?.getAttribute("src");
    const title = card.querySelector(".info .title")?.textContent || "";
    const client = card.querySelector(".info .client")?.textContent || "";

    if (modalVideo) {
      modalVideo.innerHTML = "";
      if (src) {
        const s = document.createElement("source");
        s.src = src; s.type = "video/mp4";
        modalVideo.appendChild(s);
        modalVideo.poster = poster || "";
        modalVideo.load();
        modalVideo.play().catch(() => {});
      } else {
        modalVideo.poster = poster || "";
      }
    }
    if (modalTitle) modalTitle.textContent = title;
    if (modalClient) modalClient.textContent = client;

    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("open");
    document.body.style.overflow = "";
    if (modalVideo) { try { modalVideo.pause(); } catch (_) {} }
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.classList.contains("modal-close")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }
})();

// ============ Members grid renderer ============
(function () {
  const grid = document.getElementById("members-grid");
  if (!grid || !window.ADVO_MEMBERS) return;

  const all = window.ADVO_MEMBERS;
  const countEl = document.getElementById("members-count");
  const searchEl = document.getElementById("members-search");
  const chips = document.querySelectorAll(".filter-chips .chip");
  const pagerEl = document.getElementById("members-pager");
  const PAGE_SIZE = 30;

  let state = { query: "", dept: "ALL", page: 1 };

  function filter() {
    const q = state.query.trim().toLowerCase();
    return all.filter(m => {
      if (state.dept !== "ALL" && m.dept !== state.dept) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.nameKana.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        m.id.includes(q)
      );
    });
  }

  function render() {
    const list = filter();
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = list.slice(start, start + PAGE_SIZE);

    if (countEl) {
      countEl.innerHTML = `<strong>${list.length.toString().padStart(3, "0")}</strong> / ${all.length.toString().padStart(3, "0")} Members`;
    }

    grid.innerHTML = pageItems.map(m => `
      <a class="member-card" href="member.html?id=${m.id}">
        <div class="member-avatar">
          <img src="${m.portrait}" alt="${m.name}" loading="lazy"
               onerror="this.onerror=null;this.src='${m.fallback}'">
          <div class="member-hover">
            <span class="dept">${m.dept}</span>
            ${m.expertise.join(" · ")}
            <br><span class="view">View Profile →</span>
          </div>
        </div>
        <div class="member-meta">
          <div class="member-name">${m.name}</div>
          <div class="member-role">${m.role}</div>
        </div>
      </a>
    `).join("");

    if (pagerEl) renderPager(totalPages);
  }

  function renderPager(totalPages) {
    const pages = [];
    pages.push(`<button ${state.page === 1 ? "disabled" : ""} data-page="${state.page - 1}">Prev</button>`);
    const showSet = new Set([1, totalPages, state.page - 1, state.page, state.page + 1]);
    let prev = 0;
    for (let p = 1; p <= totalPages; p++) {
      if (!showSet.has(p)) continue;
      if (p - prev > 1) pages.push(`<button disabled>…</button>`);
      pages.push(`<button class="${p === state.page ? "active" : ""}" data-page="${p}">${p}</button>`);
      prev = p;
    }
    pages.push(`<button ${state.page === totalPages ? "disabled" : ""} data-page="${state.page + 1}">Next</button>`);
    pagerEl.innerHTML = pages.join("");
    pagerEl.querySelectorAll("button[data-page]").forEach(b => {
      b.addEventListener("click", () => {
        state.page = parseInt(b.dataset.page, 10);
        render();
        document.getElementById("members")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  if (searchEl) {
    let t;
    searchEl.addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.query = e.target.value;
        state.page = 1;
        render();
      }, 120);
    });
  }

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      state.dept = chip.dataset.dept || "ALL";
      state.page = 1;
      render();
    });
  });

  render();
})();

// ============ Member profile renderer ============
(function () {
  const host = document.getElementById("profile-root");
  if (!host || !window.ADVO_MEMBERS) return;

  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const member = window.ADVO_MEMBERS.find(m => m.id === id) || window.ADVO_MEMBERS[0];
  document.title = `${member.name} — 合同会社 AdvoVisions`;

  // pick a few "selected works" clients
  const sampleProjects = [
    { tag: "Brand Film · 2024", client: "Atelier Monochrome", title: "Reflections — SS24" },
    { tag: "Music Video · 2023", client: "SAION", title: "Moonsick" },
    { tag: "Commercial · 2023", client: "Nikkō Motors", title: "The Drive Beyond" }
  ];

  host.innerHTML = `
    <section class="profile-hero">
      <div class="container">
        <a class="back-link" href="members.html">メンバー一覧に戻る</a>
        <div class="profile-grid">
          <div>
            <div class="profile-portrait">
              <img src="${member.portrait}" alt="${member.name}"
                   onerror="this.onerror=null;this.src='${member.fallback}'">
            </div>
            <div class="profile-social" aria-label="Social links">
              <a href="#" aria-label="Instagram">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="5"/>
                  <circle cx="12" cy="12" r="4"/>
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
                </svg>
              </a>
              <a href="#" aria-label="Vimeo">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22 7c-.1 2-1.5 4.7-4.2 8.2-2.8 3.6-5.2 5.4-7.1 5.4-1.2 0-2.2-1.1-3-3.2-.5-1.9-1-3.8-1.5-5.7-.6-2.1-1.2-3.2-1.8-3.2-.1 0-.7.4-1.8 1.1L1.5 7.9c1.1-1 2.2-2 3.3-2.9C6.3 3.7 7.5 3 8.4 2.9c2.1-.2 3.4 1.2 3.9 4.4.5 3.3.8 5.4 1 6.1.5 2.2 1 3.2 1.6 3.2.5 0 1.2-.7 2.2-2.3 1-1.5 1.5-2.7 1.6-3.4.2-1.6-.5-2.4-1.9-2.4-.7 0-1.4.2-2.1.5C15.9 4.8 18.3 2.8 22 3c2.7.2 4 2 4 5.3-.4-.9-1.8-1.6-4-1.3z"/>
                </svg>
              </a>
              <a href="#" aria-label="X">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.9 3H22l-7.6 8.7L23 21h-6.8l-5.3-6.7L4.7 21H1.6l8.1-9.3L1 3h7l4.8 6.2L18.9 3zm-1.2 16h1.7L6.4 5H4.6l13.1 14z"/>
                </svg>
              </a>
            </div>
          </div>
          <div>
            <span class="profile-role">${member.role}</span>
            <h1 class="profile-name">${member.name}</h1>
            <div class="profile-name-kana">${member.nameKana}</div>
            <div class="profile-tags">
              ${member.expertise.map(x => `<span class="profile-tag">${x}</span>`).join("")}
            </div>
            <p class="profile-bio">${member.bio}</p>
            <dl class="profile-meta">
              <dt>ID</dt><dd>ADV–${member.id}</dd>
              <dt>DEPARTMENT</dt><dd>${member.dept}</dd>
              <dt>JOINED</dt><dd>${member.joined}</dd>
              <dt>CONTACT</dt><dd>${member.name.toLowerCase().replace(/\s+/g, ".")}@advovisions.com</dd>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section class="profile-works">
      <div class="container">
        <h2>Selected Works</h2>
        <div class="profile-works-grid">
          ${sampleProjects.map((p, n) => `
            <article class="work-card">
              <div class="thumb">
                <img src="https://picsum.photos/seed/work-${member.id}-${n+1}/960/540" alt="${p.title}">
              </div>
              <div class="overlay">
                <span class="tag">${p.tag}</span>
                <div class="info">
                  <div class="client">${p.client}</div>
                  <div class="title">${p.title}</div>
                </div>
              </div>
              <div class="play" aria-hidden="true"></div>
            </article>
          `).join("")}
        </div>
      </div>
    </section>
  `;
})();
