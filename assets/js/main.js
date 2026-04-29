!function(){const e=document.querySelector(".preloader");if(!e)return;setTimeout(()=>e.classList.add("done"),6e3),setTimeout(()=>e.classList.add("done"),3200)}(),function(){const e=document.querySelector(".hero-title");if(!e)return;const t=[];let n=0;const o=e=>{if(e.nodeType===Node.TEXT_NODE){const o=e.textContent;for(const e of o)" "===e||"　"===e?t.push(`<span class="letter space" style="--i:${n++}"> </span>`):t.push(`<span class="letter" style="--i:${n++}">${e}</span>`)}else if(e.nodeType===Node.ELEMENT_NODE){const n=e.tagName.toLowerCase(),a=Array.from(e.attributes).map(e=>` ${e.name}="${e.value}"`).join("");t.push(`<${n}${a}>`),e.childNodes.forEach(o),t.push(`</${n}>`)}};e.childNodes.forEach(o),e.innerHTML=t.join("")}(),function(){const e=document.querySelector(".hero");if(!e||e.querySelector(".scroll-cue"))return;const t=document.createElement("div");t.className="scroll-cue",t.textContent="Scroll",e.appendChild(t)}(),function(){const e=document.querySelector(".scroll-progress");if(!e)return;const t=()=>{const t=document.documentElement,n=t.scrollHeight-t.clientHeight,o=n>0?window.scrollY/n*100:0;e.style.width=o+"%"};t(),window.addEventListener("scroll",t,{passive:!0})}(),function(){const e=document.querySelector(".site-header");if(!e)return;const t=e.classList.contains("on-hero"),n=()=>{const n=window.scrollY;if(e.classList.toggle("scrolled",n>40),t){const t=document.querySelector(".hero"),o=t?t.offsetHeight-80:120;e.classList.toggle("on-hero",n<o)}};n(),window.addEventListener("scroll",n,{passive:!0})}(),function(){const e=document.querySelectorAll(".reveal, .stagger");if(!("IntersectionObserver"in window)||!e.length)return void e.forEach(e=>e.classList.add("in"));const t=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting&&(e.target.classList.add("in"),t.unobserve(e.target))})},{threshold:.12,rootMargin:"0px 0px -40px 0px"});e.forEach(e=>t.observe(e))}(),function(){const e=document.querySelectorAll("[data-count]");if(!e.length||!("IntersectionObserver"in window))return;const t=new IntersectionObserver(e=>{e.forEach(e=>{if(!e.isIntersecting)return;const n=e.target,o=parseInt(n.dataset.count,10)||0,a=performance.now(),s=e=>{const t=Math.min(1,(e-a)/1600),r=1-Math.pow(1-t,3);n.textContent=Math.round(o*r).toLocaleString(),t<1&&requestAnimationFrame(s)};requestAnimationFrame(s),t.unobserve(n)})},{threshold:.3});e.forEach(e=>t.observe(e))}(),function(){document.querySelectorAll(".work-card").forEach(a=>{const s=a.querySelector("video");s&&(a.addEventListener("mouseenter",()=>{try{s.currentTime=0,s.play().catch(()=>{})}catch(e){}}),a.addEventListener("mouseleave",()=>{try{s.pause()}catch(e){}})),a.addEventListener("click",()=>function(a){if(!e)return;const s=a.querySelector("video source")?.getAttribute("src"),r=a.querySelector("video")?.getAttribute("poster")||a.querySelector("img")?.getAttribute("src"),i=a.querySelector(".info .title")?.textContent||"",c=a.querySelector(".info .client")?.textContent||"";if(t)if(t.innerHTML="",s){const e=document.createElement("source");e.src=s,e.type="video/mp4",t.appendChild(e),t.poster=r||"",t.load(),t.play().catch(()=>{})}else t.poster=r||"";n&&(n.textContent=i);o&&(o.textContent=c);e.classList.add("open"),document.body.style.overflow="hidden"}(a))});const e=document.getElementById("video-modal"),t=e?.querySelector("video"),n=e?.querySelector(".modal-caption .title"),o=e?.querySelector(".modal-caption .client");function a(){if(e&&(e.classList.remove("open"),document.body.style.overflow="",t))try{t.pause()}catch(e){}}e&&(e.addEventListener("click",t=>{(t.target===e||t.target.classList.contains("modal-close"))&&a()}),document.addEventListener("keydown",e=>{"Escape"===e.key&&a()}))}(),function(){const e=document.getElementById("members-grid");if(!e||!window.ADVO_MEMBERS)return;const t=window.ADVO_MEMBERS,n=document.getElementById("members-count"),o=document.getElementById("members-search"),a=document.querySelectorAll(".filter-chips .chip"),s=document.getElementById("members-pager");let r={query:"",dept:"ALL",page:1};function i(e){return`\n      <a class="talent-card" data-cat="${e.dept}" href="member.html?id=${e.id}">\n        <div class="talent-photo">\n          <img src="${e.portrait}" alt="${e.name}" loading="lazy"\n               onerror="this.onerror=null;this.src='${e.fallback}'">\n          <span class="talent-badge">${e.dept}</span>\n          <div class="talent-hover">\n            <div class="talent-hover-skills">${e.expertise.join(" · ")}</div>\n            <div class="talent-hover-view">View Profile →</div>\n          </div>\n        </div>\n        <div class="talent-meta">\n          <div class="talent-name">${e.name}</div>\n          <div class="talent-role">${e.role}</div>\n        </div>\n      </a>\n    `}function c(){const o=function(){const e=r.query.trim().toLowerCase();return t.filter(t=>("ALL"===r.dept||t.dept===r.dept)&&(!e||t.name.toLowerCase().includes(e)||t.nameKana.toLowerCase().includes(e)||t.role.toLowerCase().includes(e)||t.id.includes(e)||t.dept.includes(e)))}(),a=Math.max(1,Math.ceil(o.length/30));r.page>a&&(r.page=a);const l=30*(r.page-1),d=o.slice(l,l+30);n&&(n.innerHTML=`<strong>${o.length.toString().padStart(3,"0")}</strong> / ${t.length.toString().padStart(3,"0")} Talents`),e.innerHTML=d.map(i).join(""),s&&function(e){const t=[];t.push(`<button ${1===r.page?"disabled":""} data-page="${r.page-1}">Prev</button>`);const n=new Set([1,e,r.page-1,r.page,r.page+1]);let o=0;for(let a=1;a<=e;a++)n.has(a)&&(a-o>1&&t.push("<button disabled>…</button>"),t.push(`<button class="${a===r.page?"active":""}" data-page="${a}">${a}</button>`),o=a);t.push(`<button ${r.page===e?"disabled":""} data-page="${r.page+1}">Next</button>`),s.innerHTML=t.join(""),s.querySelectorAll("button[data-page]").forEach(e=>{e.addEventListener("click",()=>{r.page=parseInt(e.dataset.page,10),c(),document.getElementById("members")?.scrollIntoView({behavior:"smooth",block:"start"})})})}(a)}if(o){let e;o.addEventListener("input",t=>{clearTimeout(e),e=setTimeout(()=>{r.query=t.target.value,r.page=1,c()},120)})}a.forEach(e=>{e.addEventListener("click",()=>{a.forEach(e=>e.classList.remove("active")),e.classList.add("active"),r.dept=e.dataset.dept||"ALL",r.page=1,c()})}),c()}(),function(){const root=document.getElementById("profile-root");if(!root||!window.ADVO_MEMBERS)return;const M=window.ADVO_MEMBERS;const id=new URLSearchParams(location.search).get("id");const m=M.find(x=>x.id===id)||M[0];document.title=`${m.name} ／ ${m.role} — 合同会社 AdvoVisions`;const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=`${m.name}（${m.role}）のプロフィール／出演実績／SNS — 合同会社 AdvoVisions 所属。`;const og=document.querySelector('meta[property="og:image"]');if(og)og.setAttribute("content",m.portrait);const related=M.filter(x=>x.dept===m.dept&&x.id!==m.id).slice(0,6);const sns=m.sns||{instagram:"#",x:"#",tiktok:"#",youtube:"#"};const gallery=m.gallery||[];const SVG_IG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>';const SVG_X='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 3H22l-7.6 8.7L23 21h-6.8l-5.3-6.7L4.7 21H1.6l8.1-9.3L1 3h7l4.8 6.2L18.9 3zm-1.2 16h1.7L6.4 5H4.6l13.1 14z"/></svg>';const SVG_TT='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.6 7.7c-1.6 0-3-.9-3.8-2.2V15a5 5 0 1 1-5-5v2.7a2.3 2.3 0 1 0 2.3 2.3V2h2.5c.2 1.7 1.5 3 3.2 3.2v2.5z"/></svg>';const SVG_YT='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.2c-.3-1-1-1.8-2-2C19.1 4.8 12 4.8 12 4.8s-7.1 0-9 .4c-1 .2-1.7 1-2 2C.7 9 .7 12 .7 12s0 3 .4 4.8c.3 1 1 1.8 2 2 1.9.4 9 .4 9 .4s7.1 0 9-.4c1-.2 1.7-1 2-2 .4-1.8.4-4.8.4-4.8s0-3-.4-4.8zM9.6 15.6V8.4L15.9 12l-6.3 3.6z"/></svg>';root.innerHTML=`
    <section class="profile-hero-v2">
      <div class="profile-hero-bg" style="background-image:url('${m.portrait}')"></div>
      <div class="container">
        <a class="back-link" href="members.html">← 所属タレント一覧へ戻る</a>
        <div class="profile-grid-v2">
          <div class="profile-portrait-col">
            <div class="profile-portrait-v2">
              <img src="${m.portrait}" alt="${m.name}"
                   onerror="this.onerror=null;this.src='${m.fallback}'">
              <span class="profile-id-tag">ADV–${m.id}</span>
            </div>
            <div class="profile-social-v2" aria-label="Social links">
              <a href="${sns.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${SVG_IG}<span>Instagram</span></a>
              <a href="${sns.x}" target="_blank" rel="noopener" aria-label="X">${SVG_X}<span>X (Twitter)</span></a>
              <a href="${sns.tiktok}" target="_blank" rel="noopener" aria-label="TikTok">${SVG_TT}<span>TikTok</span></a>
              <a href="${sns.youtube}" target="_blank" rel="noopener" aria-label="YouTube">${SVG_YT}<span>YouTube</span></a>
            </div>
          </div>
          <div class="profile-info-col">
            <span class="profile-eyebrow">${m.dept}　·　Talent Profile</span>
            <h1 class="profile-name-v2">${m.name}</h1>
            <div class="profile-name-kana-v2">${m.nameKana}</div>
            <div class="profile-role-v2">${m.role}</div>
            <div class="profile-tags-v2">
              ${m.expertise.map(e=>`<span class="profile-tag-v2">${e}</span>`).join("")}
            </div>
            <p class="profile-bio-v2">${m.bio}</p>
            <div class="profile-stats-v2">
              <div class="pstat"><span class="pstat-label">身長</span><span class="pstat-value">${m.height}<small>cm</small></span></div>
              <div class="pstat"><span class="pstat-label">体重</span><span class="pstat-value">${m.weight}<small>kg</small></span></div>
              <div class="pstat"><span class="pstat-label">足サイズ</span><span class="pstat-value">${m.shoe}<small>cm</small></span></div>
              <div class="pstat"><span class="pstat-label">血液型</span><span class="pstat-value">${m.blood}<small>型</small></span></div>
              <div class="pstat"><span class="pstat-label">出身</span><span class="pstat-value pstat-text">${m.birthCity}</span></div>
              <div class="pstat"><span class="pstat-label">所属年</span><span class="pstat-value">${m.joined}<small>年〜</small></span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="profile-section profile-gallery-section">
      <div class="container">
        <div class="profile-section-head">
          <span class="eyebrow">PORTFOLIO</span>
          <h2>フォトギャラリー</h2>
        </div>
        <div class="profile-gallery">
          ${gallery.map((g,i)=>`<a class="profile-gallery-item" href="${g}" target="_blank" rel="noopener" style="--gi:${i}"><img src="${g}" alt="${m.name} portfolio ${i+1}" loading="lazy"></a>`).join("")}
        </div>
      </div>
    </section>

    <section class="profile-section profile-films-section">
      <div class="container">
        <div class="profile-section-head">
          <span class="eyebrow">FILMOGRAPHY</span>
          <h2>主な出演・参加作品</h2>
        </div>
        <ul class="filmography-list-v2">
          ${m.filmography.map(([cat,work])=>`
            <li>
              <span class="film-cat-v2">${cat}</span>
              <span class="film-work-v2">${work}</span>
            </li>
          `).join("")}
        </ul>
      </div>
    </section>

    <section class="profile-section profile-news-section">
      <div class="container">
        <div class="profile-section-head">
          <span class="eyebrow">LATEST</span>
          <h2>最新情報</h2>
        </div>
        <ul class="talent-news-list-v2">
          ${m.news.map(n=>`
            <li>
              <span class="news-date-v2">${n.date}</span>
              <span class="news-text-v2">${n.text}</span>
            </li>
          `).join("")}
        </ul>
      </div>
    </section>

    <section class="profile-section profile-meta-section">
      <div class="container">
        <div class="profile-section-head">
          <span class="eyebrow">CASTING SHEET</span>
          <h2>キャスティング情報</h2>
        </div>
        <div class="casting-grid">
          <dl class="casting-meta">
            <dt>タレントID</dt><dd>ADV–${m.id}</dd>
            <dt>カテゴリ</dt><dd>${m.dept}</dd>
            <dt>役職</dt><dd>${m.role}</dd>
            <dt>身体スペック</dt><dd>身長 ${m.height} / 体重 ${m.weight} / 足 ${m.shoe}cm</dd>
            <dt>使用言語</dt><dd>${(m.languages||["日本語"]).join(" ／ ")}</dd>
            <dt>担当マネージャー</dt><dd>${m.manager}</dd>
            <dt>得意分野</dt><dd>${m.expertise.join("、")}</dd>
            <dt>SNSアカウント</dt><dd>@${(m.id?"adv_"+m.id:"advovisions")}（IG / X / TikTok / YouTube）</dd>
          </dl>
          <aside class="casting-cta">
            <div class="casting-cta-photo">
              <img src="${m.portrait}" alt="${m.name}" loading="lazy"
                   onerror="this.onerror=null;this.src='${m.fallback}'">
            </div>
            <div class="casting-cta-body">
              <span class="eyebrow">CASTING</span>
              <h3><strong>${m.name}</strong>を<br>キャスティングする</h3>
              <p class="casting-cta-meta">${m.dept}　／　${m.role}<br>ID：ADV–${m.id}　・　所属：${m.joined}年〜</p>
              <a href="mailto:casting@advovisions.com?subject=${encodeURIComponent("[キャスティング] "+m.name+" / ADV-"+m.id)}&body=${encodeURIComponent("ご担当者様\n\n下記タレントのキャスティングについてご相談させてください。\n\nタレント名：" + m.name + "\nID：ADV-" + m.id + "\nカテゴリ：" + m.dept + "\n\n企画概要：\n撮影日程：\n撮影場所：\n媒体：\nお見積りご希望日：\n\nよろしくお願いいたします。")}" class="btn-primary casting-cta-btn">このタレントについて問い合わせる</a>
              <a href="audition.html" class="btn-outline casting-cta-btn">同カテゴリのタレントを探す</a>
            </div>
          </aside>
        </div>
      </div>
    </section>

    ${related.length?`
    <section class="profile-section profile-related-section">
      <div class="container">
        <div class="profile-section-head">
          <span class="eyebrow">SAME CATEGORY</span>
          <h2>同カテゴリのタレント</h2>
        </div>
        <div class="talents-grid">
          ${related.map(r=>`
            <a class="talent-card" data-cat="${r.dept}" href="member.html?id=${r.id}">
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
    `:""}
  `;}(),function(){const e=document.querySelector(".hero-title");if(!e||"1"===e.dataset.split)return;e.dataset.split="1";const t=[];let n=0;const o=e=>{if(3===e.nodeType)for(const o of e.textContent)" "===o||"　"===o?t.push(`<span class="letter space" style="--i:${n++}"> </span>`):t.push(`<span class="letter" style="--i:${n++}">${o}</span>`);else if(1===e.nodeType){const n=e.tagName.toLowerCase(),a=Array.from(e.attributes).map(e=>` ${e.name}="${e.value}"`).join("");t.push(`<${n}${a}>`),e.childNodes.forEach(o),t.push(`</${n}>`)}};e.childNodes.forEach(o),e.innerHTML=t.join("")}(),function(){const e=document.querySelectorAll("[data-count]");if(!e.length||!("IntersectionObserver"in window))return;const t=new IntersectionObserver(e=>{e.forEach(e=>{if(!e.isIntersecting)return;const n=e.target;if(n.dataset.done)return;n.dataset.done="1";const o=parseInt(n.dataset.count,10)||0,a=performance.now(),s=e=>{const t=Math.min(1,(e-a)/1600),r=1-Math.pow(1-t,3);if(n.textContent=Math.round(o*r).toLocaleString(),t<1)requestAnimationFrame(s);else{const e=n.closest(".num");e&&e.classList.add("finish")}};requestAnimationFrame(s),t.unobserve(n)})},{threshold:.3});e.forEach(e=>t.observe(e))}(),window.matchMedia&&window.matchMedia("(hover: hover) and (pointer: fine)").matches&&(document.addEventListener("mousemove",e=>{const t=e.target.closest(".talent-card");if(!t)return;const n=t.getBoundingClientRect(),o=(e.clientX-n.left)/n.width-.5,a=(e.clientY-n.top)/n.height-.5;t.style.setProperty("--tilt-x",(8*-a).toFixed(2)+"deg"),t.style.setProperty("--tilt-y",(8*o).toFixed(2)+"deg"),t.classList.add("is-tilting")}),document.addEventListener("mouseover",e=>{document.querySelectorAll(".talent-card.is-tilting").forEach(t=>{t.contains(e.target)||(t.classList.remove("is-tilting"),t.style.removeProperty("--tilt-x"),t.style.removeProperty("--tilt-y"))})})),function(){const e=document.querySelector(".hero");if(!e||e.querySelector(".hero-particles"))return;const t=document.createElement("div");t.className="hero-particles";let n="";for(let e=0;e<22;e++){const e=Math.floor(100*Math.random()),t=2+5*Math.random(),o=14+16*Math.random(),a=10*Math.random(),s=(120*Math.random()-60).toFixed(0),r=(.3+.5*Math.random()).toFixed(2);n+=`<i style="left:${e}%;width:${t.toFixed(1)}px;height:${t.toFixed(1)}px;animation-duration:${o.toFixed(1)}s;animation-delay:${a.toFixed(1)}s;--sway:${s}px;opacity:${r};"></i>`}t.innerHTML=n,e.appendChild(t)}(),function(){if(document.querySelector(".back-to-top"))return;const e=document.createElement("button");e.className="back-to-top",e.setAttribute("aria-label","Back to top"),e.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',document.body.appendChild(e),window.addEventListener("scroll",()=>{e.classList.toggle("visible",window.scrollY>400)},{passive:!0}),e.addEventListener("click",()=>{window.scrollTo({top:0,behavior:"smooth"})})}(),function(){if(document.getElementById("contact-modal"))return;const e=document.createElement("div");e.id="contact-modal",e.className="contact-modal",e.innerHTML='\n    <div class="contact-modal-inner">\n      <button class="contact-modal-close" aria-label="Close"></button>\n      <span class="eyebrow">CONTACT</span>\n      <h3 data-ja="お問い合わせ" data-en="Get in touch">お問い合わせ</h3>\n      <p data-ja="キャスティング・取材・採用のご相談は下記フォームよりご連絡ください。" data-en="For casting, press, or careers, please use the form below.">キャスティング・取材・採用のご相談は下記フォームよりご連絡ください。</p>\n      <form id="contact-form">\n        <label data-ja="お名前" data-en="Your name">お名前</label>\n        <input type="text" name="name" required>\n        <label data-ja="会社名" data-en="Company">会社名</label>\n        <input type="text" name="company">\n        <label data-ja="メールアドレス" data-en="Email">メールアドレス</label>\n        <input type="email" name="email" required>\n        <label data-ja="ご用件" data-en="Subject">ご用件</label>\n        <select name="subject">\n          <option value="キャスティング" data-en="Casting">キャスティング</option>\n          <option value="取材・広報" data-en="Press">取材・広報</option>\n          <option value="採用・オーディション" data-en="Audition / Careers">採用・オーディション</option>\n          <option value="その他" data-en="Other">その他</option>\n        </select>\n        <label data-ja="詳細・メッセージ" data-en="Message">詳細・メッセージ</label>\n        <textarea name="message" required></textarea>\n        <div class="contact-modal-actions">\n          <button type="submit" data-ja="送信" data-en="Send">送信</button>\n        </div>\n      </form>\n    </div>\n  ',document.body.appendChild(e);const t=()=>{e.classList.remove("open"),document.body.style.overflow=""};document.addEventListener("click",t=>{const n=t.target.closest("a");if(!n)return;const o=n.getAttribute("href")||"";o.startsWith("mailto:")&&(o.includes("contact@")||o.includes("casting@"))?(t.preventDefault(),e.classList.add("open"),document.body.style.overflow="hidden"):"#contact"===o||o.endsWith("#contact")}),e.addEventListener("click",n=>{(n.target===e||n.target.classList.contains("contact-modal-close"))&&t()}),document.addEventListener("keydown",n=>{"Escape"===n.key&&e.classList.contains("open")&&t()}),e.querySelector("#contact-form").addEventListener("submit",e=>{e.preventDefault();const n=e.target,o=Object.fromEntries(new FormData(n).entries()),a=n.querySelector('[name="subject"] option:checked')?.textContent||o.subject,s=encodeURIComponent(`お名前: ${o.name}\n会社名: ${o.company||"-"}\nメール: ${o.email}\nご用件: ${a}\n\n${o.message}`),r="キャスティング"===o.subject?"casting@advovisions.com":"contact@advovisions.com";window.location.href=`mailto:${r}?subject=${encodeURIComponent("[Web] "+a)}&body=${s}`,setTimeout(t,300)})}(),function(){const e=document.querySelector(".nav-toggle"),t=document.querySelector(".nav");if(!e||!t)return;const n=n=>{e.classList.toggle("open",n),t.classList.toggle("open",n),document.body.classList.toggle("nav-open",n)};e.addEventListener("click",e=>{e.stopPropagation(),n(!t.classList.contains("open"))}),t.querySelectorAll("a").forEach(e=>{e.addEventListener("click",()=>n(!1))}),document.addEventListener("click",o=>{!t.classList.contains("open")||t.contains(o.target)||e.contains(o.target)||n(!1)}),document.addEventListener("keydown",e=>{"Escape"===e.key&&t.classList.contains("open")&&n(!1)})}(),function(){const e=document.getElementById("video-modal");e&&document.addEventListener("keydown",t=>{if(e.classList.contains("open")&&" "===t.key){t.preventDefault();const n=e.querySelector("video");if(!n)return;n.paused?n.play().catch(()=>{}):n.pause()}})}(),function(){const e=document.querySelector(".preloader-brand");if(!e)return;const t=e.textContent.trim();e.innerHTML="";const n=document.createElement("span");n.className="brand-glyph",n.textContent="",e.appendChild(n),e.setAttribute("data-text",t),e.classList.add("shown");const o="AVadviosnSKJQXZWY$@#*/0123456789",a=t.length;const s=performance.now();function r(i){const c=i-s,l=Math.min(1,c/(36e3/28)),d=Math.floor(l*a);let u="";for(let e=0;e<a;e++)e<d?u+=t[e]:" "===t[e]?u+=" ":u+=o[Math.floor(32*Math.random())];n.textContent=u,e.setAttribute("data-text",u),l<1?requestAnimationFrame(r):(n.textContent=t,e.setAttribute("data-text",t))}setTimeout(()=>requestAnimationFrame(r),1800)}(),function(){const t=document.getElementById('testimonial-track'),d=document.getElementById('testimonial-dots');if(!t||!d)return;const cards=Array.from(t.children);d.innerHTML=cards.map((_,i)=>`<button data-i="${i}" aria-label="Go to ${i+1}"${i===0?' class="active"':''}></button>`).join('');const btns=d.querySelectorAll('button');btns.forEach(b=>b.addEventListener('click',()=>{const i=parseInt(b.dataset.i,10);const card=cards[i];const target=card.offsetLeft-t.offsetWidth/2+card.offsetWidth/2;t.scrollTo({left:Math.max(0,target),behavior:'smooth'})}));let sTo;t.addEventListener('scroll',()=>{clearTimeout(sTo);sTo=setTimeout(()=>{const c=t.scrollLeft+t.offsetWidth/2;let near=0,min=1e9;cards.forEach((cd,i)=>{const d=Math.abs(cd.offsetLeft+cd.offsetWidth/2-c);if(d<min){min=d;near=i}});btns.forEach((b,i)=>b.classList.toggle('active',i===near))},80)})}(),function(){const b=document.querySelector('.to-top');if(!b)return;b.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));window.addEventListener('scroll',()=>b.classList.toggle('show',window.scrollY>400),{passive:!0})}(),function(){const v=document.querySelector('.hero-video');if(!v||matchMedia('(prefers-reduced-motion:reduce)').matches)return;let tf=null;window.addEventListener('scroll',()=>{if(tf)return;tf=requestAnimationFrame(()=>{const y=Math.min(window.scrollY,800);v.style.transform=`translate3d(0,${y*.15}px,0) scale(${1+y*.0002})`;tf=null})},{passive:!0})}()
,function(){if(!matchMedia('(hover:hover) and (pointer:fine)').matches)return;if(document.querySelector('.cursor-dot'))return;const dot=document.createElement('div');dot.className='cursor-dot';const ring=document.createElement('div');ring.className='cursor-ring';document.body.appendChild(dot);document.body.appendChild(ring);let mx=window.innerWidth/2,my=window.innerHeight/2,dx=mx,dy=my,rx=mx,ry=my;document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY},{passive:!0});document.addEventListener('mouseleave',()=>document.body.classList.add('cursor-hidden'));document.addEventListener('mouseenter',()=>document.body.classList.remove('cursor-hidden'));document.addEventListener('mousedown',()=>document.body.classList.add('cursor-press'));document.addEventListener('mouseup',()=>document.body.classList.remove('cursor-press'));const HOVER_SEL='a,button,.talent-card,.work-card,.news-card,.chip,.service-tile,.testimonial-card,.insta-strip a,[role="button"],.profile-gallery-item,.casting-cta-btn,.profile-social-v2 a,.lang-switch button,.to-top,.back-to-top,.modal-close,.nav-toggle,.faq-item summary,details summary,.specialty-tile,.philo-card';const TEXT_SEL='input[type="text"],input[type="email"],input[type="search"],input[type="tel"],input[type="url"],input[type="password"],textarea,[contenteditable="true"]';document.addEventListener('mouseover',e=>{if(e.target.closest(TEXT_SEL)){document.body.classList.add('cursor-text');document.body.classList.remove('cursor-hover');}else if(e.target.closest(HOVER_SEL)){document.body.classList.add('cursor-hover');document.body.classList.remove('cursor-text');}});document.addEventListener('mouseout',e=>{if(!e.relatedTarget||(!e.relatedTarget.closest(HOVER_SEL)&&!e.relatedTarget.closest(TEXT_SEL))){document.body.classList.remove('cursor-hover');document.body.classList.remove('cursor-text');}});function frame(){dx+=(mx-dx)*0.6;dy+=(my-dy)*0.6;rx+=(mx-rx)*0.18;ry+=(my-ry)*0.18;dot.style.transform=`translate3d(${dx}px,${dy}px,0) translate(-50%,-50%)`;ring.style.transform=`translate3d(${rx}px,${ry}px,0) translate(-50%,-50%)`;requestAnimationFrame(frame)}requestAnimationFrame(frame)}(),function(){const items=document.querySelectorAll('.profile-gallery-item');if(!items.length)return;const urls=Array.from(items).map(a=>a.getAttribute('href'));const lb=document.createElement('div');lb.className='lightbox';lb.innerHTML=`<button class="lightbox-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button><button class="lightbox-prev" aria-label="Previous"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button><button class="lightbox-next" aria-label="Next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button><div class="lightbox-content"><img class="lightbox-img" src="" alt=""></div><div class="lightbox-counter"></div>`;document.body.appendChild(lb);const img=lb.querySelector('.lightbox-img'),counter=lb.querySelector('.lightbox-counter');let cur=0;function show(i){cur=(i+urls.length)%urls.length;img.src=urls[cur];counter.textContent=String(cur+1).padStart(2,'0')+' / '+String(urls.length).padStart(2,'0')}function open(i){show(i);lb.classList.add('open');document.body.style.overflow='hidden'}function close(){lb.classList.remove('open');document.body.style.overflow=''}items.forEach((a,i)=>{a.addEventListener('click',e=>{e.preventDefault();open(i)})});lb.querySelector('.lightbox-close').addEventListener('click',close);lb.querySelector('.lightbox-prev').addEventListener('click',()=>show(cur-1));lb.querySelector('.lightbox-next').addEventListener('click',()=>show(cur+1));lb.addEventListener('click',e=>{if(e.target===lb)close()});document.addEventListener('keydown',e=>{if(!lb.classList.contains('open'))return;if(e.key==='Escape')close();else if(e.key==='ArrowLeft')show(cur-1);else if(e.key==='ArrowRight')show(cur+1)})}(),function(){if(!matchMedia('(hover:hover) and (pointer:fine)').matches)return;document.querySelectorAll('.btn-primary, .btn-outline, .casting-cta-btn, .to-top, .back-to-top').forEach(btn=>{const STR=18;btn.addEventListener('mousemove',e=>{const r=btn.getBoundingClientRect();const x=e.clientX-r.left-r.width/2;const y=e.clientY-r.top-r.height/2;btn.style.transition='transform .15s ease';btn.style.transform=`translate(${x*0.25}px, ${y*0.4}px) translateY(-2px)`});btn.addEventListener('mouseleave',()=>{btn.style.transition='transform .45s cubic-bezier(.22,1,.36,1)';btn.style.transform=''})})}(),function(){const track=document.getElementById('testimonial-track');if(!track)return;const cards=Array.from(track.children);if(cards.length<2)return;let cur=0,timer=null,paused=false;function go(i){cur=(i+cards.length)%cards.length;const card=cards[cur];const target=card.offsetLeft-track.offsetWidth/2+card.offsetWidth/2;track.scrollTo({left:Math.max(0,target),behavior:'smooth'})}function play(){if(paused)return;timer=setTimeout(()=>{go(cur+1);play()},6500)}function pause(){clearTimeout(timer);paused=true;setTimeout(()=>{paused=false;play()},10000)}track.addEventListener('mouseenter',()=>{clearTimeout(timer);paused=true});track.addEventListener('mouseleave',()=>{paused=false;play()});track.addEventListener('scroll',pause,{passive:true});play()}(),function(){if(!document.querySelector('.filter-chips .chip'))return;const cat=new URLSearchParams(location.search).get('cat');if(!cat)return;setTimeout(()=>{const btn=document.querySelector('.filter-chips .chip[data-dept="'+cat+'"]');if(btn){btn.click();window.scrollTo({top:Math.max(0,btn.getBoundingClientRect().top+window.scrollY-140),behavior:'smooth'})}},120)}()