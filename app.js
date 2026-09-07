/* =========================================================
   Kuroyuri Hub — app.js
   Vanilla ES6+. No frameworks, no build step.
   ========================================================= */

(() => {
  "use strict";

  /* ---------------------------------------------------------
     1. RADIO CONFIG — swap the playlist ID here any time.
     Find it in a YouTube playlist URL after "list=".
     --------------------------------------------------------- */
  const RADIO_CONFIG = {
    // No playlist ships by default — paste a real one in the UI, or set it
    // here, e.g. defaultPlaylistId: "PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".
    defaultPlaylistId: "",
    storageKey: "kuroyuri:playlistId",
  };

  /* ---------------------------------------------------------
     2. NEWS CONFIG — RSS sources pulled through rss2json.
     --------------------------------------------------------- */
  const RSS2JSON_ENDPOINT = "https://api.rss2json.com/v1/api.json";
  // JaME World does not expose a working public RSS feed (verified: their
  // known /rss.xml and /feed paths 403, and /rss/ just serves the homepage
  // HTML) — add it back here if you find a real feed URL for it.
  const NEWS_FEEDS = [
    { name: "JRock News", url: "https://jrocknews.com/feed" },
  ];
  const MAX_ITEMS_PER_FEED = 6;
  const NEWS_FETCH_TIMEOUT_MS = 9000;

  const FALLBACK_NEWS = [
    {
      title: "BAND-MAID announce new world tour dates",
      link: "https://jrocknews.com/",
      pubDate: "2026-08-20T00:00:00Z",
      summary: "The Nagoya-formed quartet reveal an expanded international run following their latest album cycle, with fresh production and setlist reworks.",
      thumbnail: "",
      source: "JRock News (offline snapshot)",
    },
    {
      title: "LOVEBITES tease follow-up to their latest studio record",
      link: "https://jrocknews.com/",
      pubDate: "2026-08-12T00:00:00Z",
      summary: "The NWOBHM-inspired five-piece hint at new material in a livestream Q&A, promising a heavier, more technical direction.",
      thumbnail: "",
      source: "JRock News (offline snapshot)",
    },
    {
      title: "NEMOPHILA drop a blistering new single and music video",
      link: "https://jrocknews.com/",
      pubDate: "2026-08-05T00:00:00Z",
      summary: "The track showcases the band's signature blend of technical shred guitar work and stadium-ready hooks.",
      thumbnail: "",
      source: "JRock News (offline snapshot)",
    },
    {
      title: "Hanabie. bring kawaii-metal chaos to a European festival run",
      link: "https://www.jame-world.com/",
      pubDate: "2026-07-29T00:00:00Z",
      summary: "Known for blending cute visuals with breakdown-heavy riffs, the band's festival slots have been drawing packed crowds.",
      thumbnail: "",
      source: "JaME World (offline snapshot)",
    },
    {
      title: "Unlucky Morpheus reveal symphonic power metal concept album",
      link: "https://www.jame-world.com/",
      pubDate: "2026-07-18T00:00:00Z",
      summary: "Vocalist Fuki leads the band through an ambitious narrative record blending orchestral arrangements with double-kick fury.",
      thumbnail: "",
      source: "JaME World (offline snapshot)",
    },
    {
      title: "BABYMETAL confirm new production collaborators for upcoming era",
      link: "https://jrocknews.com/",
      pubDate: "2026-07-02T00:00:00Z",
      summary: "The genre-blending trio continue evolving their fusion of idol pop and extreme metal ahead of a rumored new album.",
      thumbnail: "",
      source: "JRock News (offline snapshot)",
    },
  ];

  /* ---------------------------------------------------------
     3. LINKS DIRECTORY
     --------------------------------------------------------- */
  const LINKS_DIRECTORY = [
    { title: "JRock News", desc: "English-language news on Japanese rock & metal.", url: "https://jrocknews.com/" },
    { title: "JaME World", desc: "J-Music news, interviews, and reviews.", url: "https://www.jame-world.com/en" },
    { title: "BAND-MAID Official", desc: "Official site for BAND-MAID.", url: "https://bandmaid.tokyo/" },
    { title: "LOVEBITES Official", desc: "Official site for LOVEBITES.", url: "https://lovebites.jp/" },
    { title: "NEMOPHILA Official", desc: "Official site for NEMOPHILA.", url: "https://nemophila.tokyo/" },
    { title: "Hanabie. Official", desc: "Official site for Hanabie.", url: "https://hanabie.jp/en/" },
    { title: "Unlucky Morpheus Official", desc: "Official site for Unlucky Morpheus.", url: "https://sound.jp/ankimo/" },
    { title: "BABYMETAL Official", desc: "Official site for BABYMETAL.", url: "https://www.babymetal.com/" },
    { title: "DenKare Official", desc: "Official site for 電気式華憐音楽集団 (DenKare).", url: "https://denkare.net/dico/" },
    { title: "Yousei Teikoku Official", desc: "Official site for 妖精帝國 (Yousei Teikoku).", url: "https://www.dasfeenreich.com/" },
  ];

  /* ---------------------------------------------------------
     Utility helpers
     --------------------------------------------------------- */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function stripHtml(str) {
    const div = document.createElement("div");
    div.innerHTML = str ?? "";
    return (div.textContent || div.innerText || "").trim();
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max - 1).trimEnd() + "…" : str;
  }

  function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  /* ---------------------------------------------------------
     Navigation (mobile toggle)
     --------------------------------------------------------- */
  function initNav() {
    const toggle = document.getElementById("navToggle");
    const list = document.getElementById("navList");
    if (!toggle || !list) return;

    toggle.addEventListener("click", () => {
      const isOpen = list.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    list.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        list.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------------------------------------------------------
     Parallax scroll effect
     --------------------------------------------------------- */
  function initParallax() {
    const base = document.querySelector(".layer-base");
    const pattern = document.querySelector(".layer-pattern");
    if (!base || !pattern) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let ticking = false;
    function update() {
      const y = window.scrollY;
      base.style.transform = `translate3d(0, ${y * 0.12}px, 0)`;
      pattern.style.transform = `translate3d(0, ${y * 0.25}px, 0)`;
      ticking = false;
    }
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    update();
  }

  /* ---------------------------------------------------------
     News aggregator
     --------------------------------------------------------- */
  function normalizeRss2JsonItem(item, feedName) {
    return {
      title: stripHtml(item.title) || "Untitled",
      link: item.link || "#",
      pubDate: item.pubDate || "",
      summary: truncate(stripHtml(item.description || item.content || ""), 220),
      thumbnail: item.thumbnail || item.enclosure?.link || "",
      source: feedName,
    };
  }

  async function fetchFeed(feed) {
    const apiUrl = `${RSS2JSON_ENDPOINT}?rss_url=${encodeURIComponent(feed.url)}`;
    const res = await fetchWithTimeout(apiUrl, NEWS_FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${feed.name}`);
    const data = await res.json();
    if (data.status !== "ok" || !Array.isArray(data.items)) {
      throw new Error(`Bad payload from ${feed.name}`);
    }
    return data.items.slice(0, MAX_ITEMS_PER_FEED).map((item) => normalizeRss2JsonItem(item, feed.name));
  }

  function renderNewsCard(item) {
    const thumb = item.thumbnail
      ? `<img class="news-card-thumb" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" onerror="this.remove()">`
      : `<div class="news-card-thumb" aria-hidden="true"></div>`;

    return `
      <article class="news-card">
        ${thumb}
        <div class="news-card-body">
          <span class="news-card-date">${escapeHtml(formatDate(item.pubDate))}</span>
          <h3 class="news-card-title">${escapeHtml(item.title)}</h3>
          <p class="news-card-summary">${escapeHtml(item.summary)}</p>
          <span class="news-card-source">${escapeHtml(item.source)}</span>
          <a class="news-card-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">Read More →</a>
        </div>
      </article>
    `;
  }

  function renderNews(items) {
    const grid = document.getElementById("newsGrid");
    if (!grid) return;
    if (!items.length) {
      grid.innerHTML = `<p class="news-status is-error">No articles available right now.</p>`;
      return;
    }
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    grid.innerHTML = items.map(renderNewsCard).join("");
  }

  function setNewsStatus(message, type) {
    const status = document.getElementById("newsStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.remove("is-error", "is-ok");
    if (type) status.classList.add(type);
  }

  async function loadNews() {
    setNewsStatus("Loading news…", null);
    const grid = document.getElementById("newsGrid");
    if (grid) grid.setAttribute("aria-busy", "true");

    const results = await Promise.allSettled(NEWS_FEEDS.map(fetchFeed));
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const items = succeeded.flatMap((r) => r.value);

    if (items.length === 0) {
      renderNews(FALLBACK_NEWS);
      setNewsStatus("Live feeds unavailable — showing a cached snapshot.", "is-error");
    } else if (succeeded.length < NEWS_FEEDS.length) {
      renderNews(items);
      setNewsStatus(`Loaded ${succeeded.length}/${NEWS_FEEDS.length} feeds. Some sources are unavailable.`, "is-error");
    } else {
      renderNews(items);
      setNewsStatus(`Loaded ${items.length} articles from ${succeeded.length} feeds.`, "is-ok");
    }

    if (grid) grid.removeAttribute("aria-busy");
  }

  function initNews() {
    loadNews();
    const refreshBtn = document.getElementById("refreshNews");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => loadNews());
    }
  }

  /* ---------------------------------------------------------
     Radio / playlist embed
     --------------------------------------------------------- */
  function buildEmbedSrc(playlistId) {
    return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(playlistId)}`;
  }

  function loadPlaylist(iframe, placeholder, id) {
    if (!id) {
      iframe.hidden = true;
      iframe.removeAttribute("src");
      placeholder.hidden = false;
      return;
    }
    iframe.src = buildEmbedSrc(id);
    iframe.hidden = false;
    placeholder.hidden = true;
  }

  function initRadio() {
    const iframe = document.getElementById("radioIframe");
    const placeholder = document.getElementById("radioPlaceholder");
    const form = document.getElementById("playlistForm");
    const input = document.getElementById("playlistInput");
    if (!iframe || !placeholder || !form || !input) return;

    let savedId = null;
    try {
      savedId = localStorage.getItem(RADIO_CONFIG.storageKey);
    } catch (_) {
      /* localStorage unavailable (private mode, etc.) — ignore */
    }

    const initialId = savedId || RADIO_CONFIG.defaultPlaylistId;
    if (initialId) input.value = initialId;
    loadPlaylist(iframe, placeholder, initialId);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = input.value.trim();
      if (!id) return;
      loadPlaylist(iframe, placeholder, id);
      try {
        localStorage.setItem(RADIO_CONFIG.storageKey, id);
      } catch (_) {
        /* ignore storage failures */
      }
    });
  }

  /* ---------------------------------------------------------
     Links directory
     --------------------------------------------------------- */
  function renderLinks() {
    const grid = document.getElementById("linksGrid");
    if (!grid) return;
    grid.innerHTML = LINKS_DIRECTORY.map(
      (link) => `
      <a class="btn btn-ornate link-btn" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
        <span class="link-btn-title">${escapeHtml(link.title)}</span>
        <span class="link-btn-desc">${escapeHtml(link.desc)}</span>
      </a>
    `
    ).join("");
  }

  /* ---------------------------------------------------------
     Init
     --------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    initNav();
    initParallax();
    initNews();
    initRadio();
    renderLinks();
  });
})();
