/* ADVO VISIONS - shared behavior */

// Header scroll state — on the home page the header sits over the blue hero
// and we keep it transparent (white text) until scroll passes the hero.
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
  const els = document.querySelectorAll(".reveal");
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
    // compact pagination: 1 … around current … last
    const window_ = 1;
    const showSet = new Set([1, totalPages, state.page - window_, state.page, state.page + window_]);
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
  document.title = `${member.name} — ADVO VISIONS`;

  host.innerHTML = `
    <section class="profile-hero">
      <div class="container">
        <a class="back-link" href="members.html">All Members</a>
        <div class="profile-grid">
          <div class="profile-portrait">
            <img src="${member.portrait}" alt="${member.name}"
                 onerror="this.onerror=null;this.src='${member.fallback}'">
          </div>
          <div>
            <div class="profile-role">${member.role}</div>
            <h1 class="profile-name">${member.name}</h1>
            <div class="profile-name-kana">${member.nameKana}</div>
            <p class="profile-bio">${member.bio}</p>
            <dl class="profile-meta">
              <dt>ID</dt><dd>ADV–${member.id}</dd>
              <dt>Department</dt><dd>${member.dept}</dd>
              <dt>Expertise</dt><dd>${member.expertise.join(" / ")}</dd>
              <dt>Joined</dt><dd>${member.joined}</dd>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section class="profile-works">
      <div class="container">
        <h2>Selected Works</h2>
        <div class="profile-works-grid">
          ${[1, 2, 3].map(n => `
            <div class="work-card">
              <div class="thumb">
                <img src="https://picsum.photos/seed/work-${member.id}-${n}/960/540" alt="Work ${n}">
              </div>
              <div class="overlay">
                <span class="tag">Film · ${2022 + n}</span>
                <div class="info">
                  <div class="client">Client ${String.fromCharCode(64 + n)}</div>
                  <div class="title">Project Codename ${n.toString(16).toUpperCase()}</div>
                </div>
              </div>
              <div class="play" aria-hidden="true"></div>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
})();
