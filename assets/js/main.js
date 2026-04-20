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

// Header scroll state
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

// Animated counters
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

// Video lightbox + hover-play
(function () {
  const cards = document.querySelectorAll(".work-card");
  cards.forEach(card => {
    const v = card.querySelector("video");
    if (v) {
      card.addEventListener("mouseenter", () => {
        try { v.currentTime = 0; v.play().catch(() => {}); } catch (_) {}
      });
      card.addEventListener("mouseleave", () => { try { v.pause(); } catch (_) {} });
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

// ============ Talents grid (search / filter / paginate) ============
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
        m.id.includes(q) ||
        m.dept.includes(q)
      );
    });
  }

  function card(m) {
    return `
      <a class="talent-card" href="member.html?id=${m.id}">
        <div class="talent-photo">
          <img src="${m.portrait}" alt="${m.name}" loading="lazy"
               onerror="this.onerror=null;this.src='${m.fallback}'">
          <span class="talent-badge">${m.dept}</span>
          <div class="talent-hover">
            <div class="talent-hover-skills">${m.expertise.join(" · ")}</div>
            <div class="talent-hover-view">View Profile →</div>
          </div>
        </div>
        <div class="talent-meta">
          <div class="talent-name">${m.name}</div>
          <div class="talent-role">${m.role}</div>
        </div>
      </a>
    `;
  }

  function render() {
    const list = filter();
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = list.slice(start, start + PAGE_SIZE);

    if (countEl) {
      countEl.innerHTML = `<strong>${list.length.toString().padStart(3, "0")}</strong> / ${all.length.toString().padStart(3, "0")} Talents`;
    }
    grid.innerHTML = pageItems.map(card).join("");
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

// ============ Talent profile page ============
(function () {
  const host = document.getElementById("profile-root");
  if (!host || !window.ADVO_MEMBERS) return;

  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const t = window.ADVO_MEMBERS.find(m => m.id === id) || window.ADVO_MEMBERS[0];
  document.title = `${t.name} — 合同会社 AdvoVisions`;

  // related talents from same dept (up to 6, excl. self)
  const related = window.ADVO_MEMBERS
    .filter(m => m.dept === t.dept && m.id !== t.id)
    .slice(0, 6);

  host.innerHTML = `
    <section class="profile-hero">
      <div class="container">
        <a class="back-link" href="members.html">所属タレント一覧に戻る</a>
        <div class="profile-grid">
          <div>
            <div class="profile-portrait">
              <img src="${t.portrait}" alt="${t.name}"
                   onerror="this.onerror=null;this.src='${t.fallback}'">
            </div>
            <div class="profile-social" aria-label="Social links">
              <a href="#" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a>
              <a href="#" aria-label="TikTok"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.6 7.7c-1.6 0-3-.9-3.8-2.2V15a5 5 0 1 1-5-5v2.7a2.3 2.3 0 1 0 2.3 2.3V2h2.5c.2 1.7 1.5 3 3.2 3.2v2.5z"/></svg></a>
              <a href="#" aria-label="X"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 3H22l-7.6 8.7L23 21h-6.8l-5.3-6.7L4.7 21H1.6l8.1-9.3L1 3h7l4.8 6.2L18.9 3zm-1.2 16h1.7L6.4 5H4.6l13.1 14z"/></svg></a>
              <a href="#" aria-label="YouTube"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.2c-.3-1-1-1.8-2-2C19.1 4.8 12 4.8 12 4.8s-7.1 0-9 .4c-1 .2-1.7 1-2 2C.7 9 .7 12 .7 12s0 3 .4 4.8c.3 1 1 1.8 2 2 1.9.4 9 .4 9 .4s7.1 0 9-.4c1-.2 1.7-1 2-2 .4-1.8.4-4.8.4-4.8s0-3-.4-4.8zM9.6 15.6V8.4L15.9 12l-6.3 3.6z"/></svg></a>
            </div>
          </div>
          <div>
            <span class="profile-role">${t.dept}</span>
            <h1 class="profile-name">${t.name}</h1>
            <div class="profile-name-kana">${t.nameKana}  ·  ${t.role}</div>
            <div class="profile-tags">
              ${t.expertise.map(x => `<span class="profile-tag">${x}</span>`).join("")}
            </div>
            <p class="profile-bio">${t.bio}</p>
            <dl class="profile-meta">
              <dt>ID</dt><dd>ADV–${t.id}</dd>
              <dt>カテゴリ</dt><dd>${t.dept}</dd>
              <dt>出身</dt><dd>${t.birthCity}</dd>
              <dt>血液型</dt><dd>${t.blood}型</dd>
              <dt>身長</dt><dd>${t.height} cm</dd>
              <dt>デビュー</dt><dd>${t.joined}年</dd>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section class="profile-filmography">
      <div class="container">
        <h2>主な出演・参加作品</h2>
        <ul class="filmography-list">
          ${t.filmography.map(([cat, work]) => `
            <li>
              <span class="film-cat">${cat}</span>
              <span class="film-work">${work}</span>
            </li>
          `).join("")}
        </ul>
      </div>
    </section>

    <section class="profile-news">
      <div class="container">
        <h2>最新情報</h2>
        <ul class="talent-news-list">
          ${t.news.map(n => `
            <li>
              <span class="news-date">${n.date}</span>
              <span class="news-text">${n.text}</span>
            </li>
          `).join("")}
        </ul>
      </div>
    </section>

    ${related.length ? `
    <section class="profile-related">
      <div class="container">
        <h2>同カテゴリのタレント</h2>
        <div class="talents-grid">
          ${related.map(r => `
            <a class="talent-card" href="member.html?id=${r.id}">
              <div class="talent-photo">
                <img src="${r.portrait}" alt="${r.name}" loading="lazy"
                     onerror="this.onerror=null;this.src='${r.fallback}'">
                <span class="talent-badge">${r.dept}</span>
              </div>
              <div class="talent-meta">
                <div class="talent-name">${r.name}</div>
                <div class="talent-role">${r.role}</div>
              </div>
            </a>
          `).join("")}
        </div>
      </div>
    </section>
    ` : ""}
  `;
})();
