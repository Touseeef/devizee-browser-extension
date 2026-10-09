/**
 * Devizee - Privacy-Focused Download Manager
 * Content Script (Manifest V3)
 *
 * Provides:
 * 1. Intelligent Multi-Media Detection (Videos, Audios, Stream embeds)
 * 2. Interactive Media & Link Sniffer (Crosshair cursor + live element highlighter)
 * 3. Modern Floating Grabber Pill with SVG iconography & multi-video count
 * 4. Zero external network calls - strictly local communication
 */

(function () {
  let widget = null;
  let isDismissed = false;
  let isPickerActive = false;
  let inspectorBox = null;
  let pickerBanner = null;
  let currentHoverTarget = null;
  let detectedMediaCache = [];
  let currentSettings = {
    showFloatingPill: true,
    theme: "dark",
    paused: false,
    blacklistedDomains: ["netflix.com", "disneyplus.com", "primevideo.com", "hulu.com", "max.com"]
  };

  function isBlacklistedSite() {
    const host = window.location.hostname.toLowerCase();
    const list = currentSettings.blacklistedDomains || [];
    return list.some((d) => {
      const clean = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      return clean && (host === clean || host.endsWith("." + clean));
    });
  }

  const STREAM_DOMAINS = [
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "reddit.com",
    "facebook.com",
    "fb.watch",
    "vimeo.com",
    "soundcloud.com",
    "twitch.tv",
    "bilibili.com",
    "dailymotion.com",
    "threads.net",
    "pinterest.com"
  ];

  const MEDIA_FILE_EXTENSIONS = /\.(mp4|mkv|webm|mov|avi|flv|m4v|mp3|m4a|wav|flac|aac|ogg|opus)(\?.*)?$/i;

  // SVG Icons (Zero external requests)
  const ICONS = {
    devizeeLogo: `
      <svg class="devizee-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    `,
    crosshair: `
      <svg class="devizee-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="22" y1="12" x2="18" y2="12"></line>
        <line x1="6" y1="12" x2="2" y2="12"></line>
        <line x1="12" y1="6" x2="12" y2="2"></line>
        <line x1="12" y1="22" x2="12" y2="18"></line>
      </svg>
    `,
    check: `
      <svg class="devizee-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `,
    close: `
      <svg class="devizee-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `,
    play: `
      <svg class="devizee-svg" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
    `,
    batchRadar: `
      <svg class="devizee-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10"></path>
        <path d="M12 6a6 6 0 1 0 6 6"></path>
        <path d="M12 10a2 2 0 1 0 2 2"></path>
        <line x1="12" y1="12" x2="21" y2="3"></line>
      </svg>
    `,
    grip: `
      <svg class="devizee-svg" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.75;">
        <circle cx="8" cy="6" r="1.5"></circle>
        <circle cx="16" cy="6" r="1.5"></circle>
        <circle cx="8" cy="12" r="1.5"></circle>
        <circle cx="16" cy="12" r="1.5"></circle>
        <circle cx="8" cy="18" r="1.5"></circle>
        <circle cx="16" cy="18" r="1.5"></circle>
      </svg>
    `,
    trash: `
      <svg class="devizee-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `
  };

  function isStreamSite() {
    const host = window.location.hostname;
    return STREAM_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  }

  function isVideoWatchUrl(urlStr) {
    try {
      const url = new URL(urlStr || window.location.href);
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();

      if (host.includes("youtube.com")) {
        return path.startsWith("/watch") || path.startsWith("/shorts/") || path.startsWith("/live/") || path.startsWith("/embed/");
      }
      if (host === "youtu.be") {
        return path.length > 1;
      }
      if (host.includes("tiktok.com")) {
        return path.includes("/video/") || path.includes("/v/");
      }
      if (host.includes("instagram.com")) {
        return path.startsWith("/reel/") || path.startsWith("/reels/") || path.startsWith("/p/") || path.startsWith("/tv/");
      }
      if (host.includes("twitter.com") || host.includes("x.com")) {
        return path.includes("/status/");
      }
      if (host.includes("reddit.com")) {
        return path.includes("/comments/") || path.includes("/r/");
      }
      if (host.includes("facebook.com") || host.includes("fb.watch")) {
        return path.includes("/watch") || path.includes("/videos") || path.includes("/reel") || host === "fb.watch";
      }
      if (host.includes("vimeo.com")) {
        return /\/\d+/.test(path);
      }
      if (host.includes("twitch.tv")) {
        return path.startsWith("/videos/") || (path.split("/").filter(Boolean).length === 1 && !["directory", "downloads", "jobs", "p"].includes(path.slice(1)));
      }
      if (host.includes("bilibili.com")) {
        return path.startsWith("/video/");
      }
      if (host.includes("dailymotion.com")) {
        return path.startsWith("/video/");
      }
      if (host.includes("threads.net")) {
        return path.includes("/post/");
      }
      return false;
    } catch {
      return false;
    }
  }

  function formatTime(secs) {
    if (!secs || isNaN(secs) || !isFinite(secs)) return "";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  // ─── Multi-Media Detection Engine ───

  function scanMediaOnPage() {
    const items = [];
    const seenUrls = new Set();
    const isWatch = isVideoWatchUrl(window.location.href);

    // 1. Direct Video Elements on Page
    const videoEls = Array.from(document.querySelectorAll("video"));
    let anyVideoPlaying = false;

    videoEls.forEach((v, index) => {
      // Filter out hidden 0-dimension tracking tags
      const rect = v.getBoundingClientRect();
      const hasVisibleBox = (rect.width > 24 && rect.height > 24) || v.offsetWidth > 24 || v.offsetHeight > 24;
      const isPlaying = !v.paused && !v.ended && v.currentTime > 0;
      if (isPlaying) anyVideoPlaying = true;

      let src = v.currentSrc || v.src;
      if (!src) {
        const sourceEl = v.querySelector("source");
        if (sourceEl) src = sourceEl.src;
      }

      // Find nearest descriptive title
      let title = v.getAttribute("title") || v.getAttribute("aria-label");
      if (!title) {
        const parentCard = v.closest("article, section, [data-video-id], .video-card, #movie_player, .html5-video-player");
        if (parentCard) {
          const heading = parentCard.querySelector("h1, h2, h3, h4, [data-title], .ytp-title-link");
          if (heading) title = heading.textContent.trim();
        }
      }
      if (!title) {
        title = document.title.replace(/ - YouTube$/, "").replace(/ \/ X$/, "").trim() || `Video Element #${index + 1}`;
      }

      let resolution = "";
      if (v.videoWidth && v.videoHeight) {
        resolution = `${v.videoWidth}x${v.videoHeight}`;
      }

      // For stream platforms, prefer page URL so yt-dlp receives the canonical URL
      const mediaUrl = isWatch ? window.location.href : (src || (hasVisibleBox ? window.location.href : null));
      if (mediaUrl && !seenUrls.has(mediaUrl)) {
        seenUrls.add(mediaUrl);
        items.push({
          type: "video",
          url: mediaUrl,
          title: title.slice(0, 100),
          duration: formatTime(v.duration),
          resolution,
          isPlaying,
          poster: v.poster || ""
        });
      }
    });

    // 2. Stream Site Watch Page fallback (if video element isn't in top DOM e.g. shadow DOM or iframe)
    if (isWatch && items.length === 0) {
      items.push({
        type: "video",
        url: window.location.href,
        title: document.title.replace(/ - YouTube$/, "").replace(/ \/ X$/, "").trim() || "Web Video Stream",
        source: window.location.hostname,
        isPlaying: anyVideoPlaying || (videoEls.length > 0 && videoEls.some((v) => !v.paused))
      });
      seenUrls.add(window.location.href);
    }

    // 3. Audio Elements on Page
    const audioEls = Array.from(document.querySelectorAll("audio"));
    audioEls.forEach((a, index) => {
      let src = a.currentSrc || a.src;
      if (!src) {
        const sourceEl = a.querySelector("source");
        if (sourceEl) src = sourceEl.src;
      }
      if (src && !seenUrls.has(src)) {
        seenUrls.add(src);
        items.push({
          type: "audio",
          url: src,
          title: a.getAttribute("title") || `Audio Track #${index + 1}`,
          duration: formatTime(a.duration),
          isPlaying: !a.paused && !a.ended && a.currentTime > 0
        });
      }
    });

    // 4. Embedded Iframe Players (YouTube, Vimeo embed)
    const iframes = Array.from(document.querySelectorAll("iframe[src]"));
    iframes.forEach((ifr) => {
      const src = ifr.src;
      if (src && (src.includes("youtube.com/embed") || src.includes("player.vimeo.com") || src.includes("dailymotion.com/embed"))) {
        if (!seenUrls.has(src)) {
          seenUrls.add(src);
          items.push({
            type: "video",
            url: src,
            title: ifr.title || "Embedded Video Player",
            isPlaying: false
          });
        }
      }
    });

    // 5. Media Download Links
    const links = Array.from(document.querySelectorAll("a[href]"));
    for (const a of links) {
      const href = a.href;
      if (href && MEDIA_FILE_EXTENSIONS.test(href) && !seenUrls.has(href)) {
        seenUrls.add(href);
        items.push({
          type: "file",
          url: href,
          title: a.textContent.trim() || href.split("/").pop() || "Direct Media Link",
          isPlaying: false
        });
        if (items.length >= 25) break; // Limit list size
      }
    }

    // Sort items so actively playing media is always first
    items.sort((a, b) => (b.isPlaying ? 1 : 0) - (a.isPlaying ? 1 : 0));

    detectedMediaCache = items;

    // Report detected count & playback status to background service worker for badge
    try {
      const isPlaying = items.some((m) => m.isPlaying);
      chrome.runtime.sendMessage({
        action: "mediaStateChanged",
        isPlaying,
        count: items.length
      });
    } catch {}

    return items;
  }

  // ─── Interactive Link & Media Sniffer Mode (Crosshair Selector) ───

  function startPickerMode() {
    if (isPickerActive) return;
    isPickerActive = true;

    document.documentElement.classList.add("devizee-picker-active");

    // 1. Create Floating Top Banner
    pickerBanner = document.createElement("div");
    pickerBanner.id = "devizee-picker-banner";
    applyWidgetTheme(pickerBanner, currentSettings.theme);
    pickerBanner.innerHTML = `
      <div class="devizee-banner-content">
        <div class="devizee-banner-icon">${ICONS.crosshair}</div>
        <div class="devizee-banner-text">
          <span class="devizee-banner-title">Devizee Link & Media Sniffer</span>
          <span class="devizee-banner-hint">Hover & click any video, audio, or download link to send to Devizee</span>
        </div>
      </div>
      <button class="devizee-banner-exit" id="devizee-exit-picker" title="Cancel Selection (Esc)">
        <span>Exit [Esc]</span>
      </button>
    `;
    document.body.appendChild(pickerBanner);

    // Restore saved picker banner position
    try {
      const savedPickerPos = JSON.parse(localStorage.getItem("devizee_picker_pos"));
      if (savedPickerPos && typeof savedPickerPos.left === "number" && typeof savedPickerPos.top === "number") {
        const maxL = window.innerWidth - 300;
        const maxT = window.innerHeight - 80;
        const safeL = Math.max(10, Math.min(savedPickerPos.left, maxL));
        const safeT = Math.max(36, Math.min(savedPickerPos.top, maxT));
        pickerBanner.style.left = `${safeL}px`;
        pickerBanner.style.top = `${safeT}px`;
        pickerBanner.style.right = "auto";
        pickerBanner.style.bottom = "auto";
        pickerBanner.style.transform = "none";
      }
    } catch { }

    makeElementDraggable(pickerBanner, pickerBanner, "devizee_picker_pos");

    // 2. Create Floating Highlight Box
    inspectorBox = document.createElement("div");
    inspectorBox.id = "devizee-inspector-box";
    inspectorBox.innerHTML = `
      <div class="devizee-inspector-badge">
        <span class="devizee-badge-type">MEDIA</span>
        <span class="devizee-badge-url"></span>
      </div>
    `;
    document.body.appendChild(inspectorBox);

    // Attach Event Listeners
    document.addEventListener("mousemove", onPickerMouseMove, true);
    document.addEventListener("click", onPickerClick, true);
    document.addEventListener("keydown", onPickerKeyDown, true);

    const exitBtn = document.getElementById("devizee-exit-picker");
    if (exitBtn) {
      exitBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        stopPickerMode();
      });
    }
  }

  function stopPickerMode() {
    if (!isPickerActive) return;
    isPickerActive = false;

    document.documentElement.classList.remove("devizee-picker-active");

    if (pickerBanner && pickerBanner.parentNode) {
      pickerBanner.parentNode.removeChild(pickerBanner);
      pickerBanner = null;
    }

    if (inspectorBox && inspectorBox.parentNode) {
      inspectorBox.parentNode.removeChild(inspectorBox);
      inspectorBox = null;
    }

    document.removeEventListener("mousemove", onPickerMouseMove, true);
    document.removeEventListener("click", onPickerClick, true);
    document.removeEventListener("keydown", onPickerKeyDown, true);
    currentHoverTarget = null;
  }

  function findMediaOrLink(e) {
    if (!e) return null;
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    const elements = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [];
    const combined = [...path, ...elements].filter((node) => node && node.nodeType === Node.ELEMENT_NODE);

    // Ignore if pointer is over Devizee UI
    for (const el of combined) {
      if (el.id === "devizee-picker-banner" || el.id === "devizee-grabber-widget" || el.id === "devizee-inspector-box" || el.classList?.contains("devizee-picker-toast")) {
        return null;
      }
    }

    const isWatch = isVideoWatchUrl(window.location.href);
    const onStream = isStreamSite();

    // 1. Direct Video / Audio element (even behind overlays, player controls, or custom web components)
    for (const el of combined) {
      if (el.tagName === "VIDEO" || el.tagName === "AUDIO") {
        const isVideo = el.tagName === "VIDEO";
        const src = (isWatch || onStream)
          ? window.location.href
          : (el.currentSrc || el.src || el.querySelector("source")?.src || (onStream ? window.location.href : null));

        const playerContainer = el.closest(".html5-video-player, #movie_player, [data-player], .video-player, .vjs-tech, .plyr, div[data-testid*='video']") || el;
        return {
          el: playerContainer,
          url: src || window.location.href,
          type: isVideo ? "VIDEO" : "AUDIO"
        };
      }
    }

    // 2. Video Player Containers (YouTube player, Twitter/X player, TikTok, Reddit, Instagram, etc.)
    for (const el of combined) {
      const isPlayer = el.matches?.(
        ".html5-video-player, #movie_player, [data-player], .video-player, .jwplayer, .plyr, div[data-testid*='video'], article[data-testid='tweet'], div[data-testid='post-container']"
      ) || el.classList?.contains("html5-video-player") || el.id === "movie_player";

      if (isPlayer) {
        const v = el.querySelector("video");
        const a = el.closest("a[href]") || el.querySelector("a[href*='/watch'], a[href*='/status/'], a[href*='/comments/']");
        const url = (isWatch || onStream)
          ? window.location.href
          : (a?.href || v?.currentSrc || v?.src || window.location.href);

        return {
          el,
          url,
          type: "VIDEO PLAYER"
        };
      }
    }

    // 3. Embed iframes (YouTube, Vimeo, Twitch, Dailymotion, etc.)
    for (const el of combined) {
      if (el.tagName === "IFRAME" && el.src) {
        return {
          el,
          url: el.src,
          type: "EMBED STREAM"
        };
      }
      const iframe = el.closest?.("iframe");
      if (iframe && iframe.src) {
        return {
          el: iframe,
          url: iframe.src,
          type: "EMBED STREAM"
        };
      }
    }

    // 4. Download / Media Links or Video Links
    for (const el of combined) {
      const link = el.tagName === "A" ? el : el.closest?.("a[href]");
      if (link && link.href) {
        const isMediaFile = MEDIA_FILE_EXTENSIONS.test(link.href);
        const isWatchLink = isVideoWatchUrl(link.href);
        if (isMediaFile) {
          return { el: link, url: link.href, type: "MEDIA FILE" };
        }
        if (isWatchLink) {
          const card = link.closest(
            "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, " +
            "ytd-playlist-video-renderer, yt-lockup-view-model, ytd-reel-item-renderer, ytd-rich-grid-media, " +
            "ytd-rich-grid-row, article, section, [class*='video-card'], [class*='VideoCard'], [class*='feed-item']"
          ) || link;
          return { el: card, url: link.href, type: "VIDEO LINK" };
        }
      }
    }

    // 5. Elements with video data attributes
    for (const el of combined) {
      const dataSrc = el.getAttribute?.("data-video-url") || el.getAttribute?.("data-src") || el.getAttribute?.("data-stream-url");
      if (dataSrc) {
        return { el, url: dataSrc, type: "STREAM" };
      }
    }

    // 6. Direct Anchor fallback if hovering an HTTP link
    const directAnchor = combined.find((n) => n.tagName === "A" && n.href);
    if (directAnchor && directAnchor.href.startsWith("http")) {
      return { el: directAnchor, url: directAnchor.href, type: "LINK" };
    }

    return null;
  }

  function onPickerMouseMove(e) {
    if (isAnyElementDragging || !isPickerActive || !inspectorBox) return;

    const media = findMediaOrLink(e);

    if (media && media.url) {
      currentHoverTarget = media;
      const rect = media.el.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      inspectorBox.style.display = "block";
      inspectorBox.style.top = `${rect.top + scrollY}px`;
      inspectorBox.style.left = `${rect.left + scrollX}px`;
      inspectorBox.style.width = `${rect.width}px`;
      inspectorBox.style.height = `${rect.height}px`;

      const typeBadge = inspectorBox.querySelector(".devizee-badge-type");
      const urlBadge = inspectorBox.querySelector(".devizee-badge-url");

      if (typeBadge) typeBadge.textContent = media.type;
      if (urlBadge) {
        try {
          const parsed = new URL(media.url);
          urlBadge.textContent = `${parsed.hostname}${parsed.pathname.slice(0, 30)}`;
        } catch {
          urlBadge.textContent = media.url.slice(0, 40);
        }
      }
    } else {
      currentHoverTarget = null;
      inspectorBox.style.display = "none";
    }
  }

  function onPickerClick(e) {
    if (!isPickerActive) return;

    if (e.target && e.target.closest && e.target.closest("#devizee-picker-banner")) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const media = currentHoverTarget || findMediaOrLink(e);

    if (media && media.url) {
      const targetUrl = media.url;

      // Visual flash feedback
      if (inspectorBox) {
        inspectorBox.classList.add("devizee-inspector-success");
      }

      showPickerToast("✓ Sent to Devizee Desktop!");

      chrome.runtime.sendMessage({ action: "downloadUrl", url: targetUrl }, () => {
        setTimeout(() => {
          stopPickerMode();
        }, 400);
      });
    } else {
      stopPickerMode();
    }
  }

  function onPickerKeyDown(e) {
    if (e.key === "Escape") {
      stopPickerMode();
    }
  }

  function showPickerToast(msg, duration = 2200, isError = false) {
    const toast = document.createElement("div");
    toast.className = "devizee-picker-toast" + (isError ? " devizee-toast-error" : "");
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("devizee-toast-show");
    }, 10);
    setTimeout(() => {
      toast.classList.remove("devizee-toast-show");
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function canonicalizeMediaUrl(urlStr) {
    if (!urlStr) return "";
    try {
      const clean = urlStr.trim();
      const url = new URL(clean);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");

      // YouTube canonicalization (covers watch?v=, shorts/, live/, embed/, youtu.be/)
      if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtu.be") {
        let videoId = null;
        if (host === "youtu.be") {
          videoId = url.pathname.slice(1).split("/")[0].split("?")[0];
        } else if (url.pathname.startsWith("/watch")) {
          videoId = url.searchParams.get("v");
        } else if (url.pathname.startsWith("/shorts/")) {
          videoId = url.pathname.replace("/shorts/", "").split("/")[0].split("?")[0];
        } else if (url.pathname.startsWith("/live/")) {
          videoId = url.pathname.replace("/live/", "").split("/")[0].split("?")[0];
        } else if (url.pathname.startsWith("/embed/")) {
          videoId = url.pathname.replace("/embed/", "").split("/")[0].split("?")[0];
        }
        if (videoId) {
          return `https://www.youtube.com/watch?v=${videoId}`;
        }
      }

      // Twitter / X canonicalization
      if (host === "twitter.com" || host === "x.com") {
        const match = url.pathname.match(/\/status\/(\d+)/);
        if (match) {
          return `https://x.com/i/status/${match[1]}`;
        }
      }

      // TikTok canonicalization
      if (host.includes("tiktok.com")) {
        const match = url.pathname.match(/\/video\/(\d+)/);
        if (match) {
          return `https://www.tiktok.com/video/${match[1]}`;
        }
      }

      // Reddit canonicalization
      if (host.includes("reddit.com")) {
        const match = url.pathname.match(/\/comments\/([a-z0-9]+)/i);
        if (match) {
          return `https://www.reddit.com/comments/${match[1]}`;
        }
      }

      // Generic cleanup of tracking parameters
      const searchParams = new URLSearchParams(url.search);
      const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "igshid", "si", "feature", "ref", "s", "t"];
      for (const p of trackingParams) {
        searchParams.delete(p);
      }
      const cleanSearch = searchParams.toString() ? `?${searchParams.toString()}` : "";
      const cleanPath = url.pathname.replace(/\/+$/, "") || "/";
      return `${url.protocol}//${host}${cleanPath}${cleanSearch}`;
    } catch {
      return urlStr.trim().replace(/\/+$/, "");
    }
  }

  function isInvalidTitle(str) {
    if (!str) return true;
    const s = str.trim();
    if (s.length < 2) return true;
    // Duration pattern: "2:39", "02:39", "1:02:45"
    if (/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(s)) return true;
    // Pure numbers
    if (/^\d+$/.test(s)) return true;
    // Common media badges / player control words
    if (/^(shorts|live|premiere|premieres|new|cc|hd|4k|mix|upcoming|watched|subscribe|play|pause|mute|unmute|replay|video)$/i.test(s)) return true;
    return false;
  }

  function extractMediaTitle(clickedEl, targetUrl, cardEl) {
    // 1. YouTube Video ID Lookup in DOM (Finds official title from video-title anchor on the page)
    if (targetUrl) {
      try {
        const u = new URL(targetUrl);
        let videoId = null;
        if (u.hostname.includes("youtube.com") || u.hostname === "youtu.be") {
          if (u.hostname === "youtu.be") {
            videoId = u.pathname.slice(1).split("/")[0].split("?")[0];
          } else if (u.pathname.startsWith("/watch")) {
            videoId = u.searchParams.get("v");
          } else if (u.pathname.startsWith("/shorts/")) {
            videoId = u.pathname.replace("/shorts/", "").split("/")[0].split("?")[0];
          }
        }

        if (videoId && videoId.length >= 8) {
          const matchingAnchors = Array.from(document.querySelectorAll(`a[href*="${videoId}"]`));
          for (const a of matchingAnchors) {
            const vt = a.querySelector?.("#video-title, [id*='video-title'], .yt-lockup-metadata-view-model-title") || (a.id === "video-title" ? a : null);
            if (vt) {
              const text = vt.getAttribute("title") || vt.getAttribute("aria-label") || vt.textContent;
              if (text && !isInvalidTitle(text)) return text.trim().replace(/\s+/g, " ");
            }
            const aTitle = a.getAttribute("title");
            if (aTitle && !isInvalidTitle(aTitle)) return aTitle.trim().replace(/\s+/g, " ");
          }
          for (const a of matchingAnchors) {
            const raw = a.textContent?.trim().replace(/\s+/g, " ");
            if (raw && !isInvalidTitle(raw) && raw.length > 3) {
              return raw;
            }
          }
        }
      } catch { }
    }

    // 2. Thumbnail image alt attribute (YouTube and most video sites have full title in img alt!)
    const candidateEls = [clickedEl, cardEl].filter(Boolean);
    for (const el of candidateEls) {
      const img = (el.tagName === "IMG" ? el : null) || el.querySelector?.("img[alt]") || el.closest?.("a")?.querySelector?.("img[alt]");
      if (img) {
        const alt = img.getAttribute("alt")?.trim().replace(/\s+/g, " ");
        if (alt && !isInvalidTitle(alt) && alt.length > 3) {
          return alt;
        }
      }
    }

    // 3. Parent video card search
    for (const el of candidateEls) {
      const card = el.closest?.(
        "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, " +
        "ytd-playlist-video-renderer, yt-lockup-view-model, ytd-reel-item-renderer, ytd-rich-grid-media, " +
        "article, section, [class*='video-card'], [class*='VideoCard'], [class*='feed-item'], [class*='item']"
      );
      if (card) {
        const titleEl = card.querySelector?.(
          "#video-title, #video-title-link, [id*='video-title'], .yt-lockup-metadata-view-model-title, " +
          "h1 a, h2 a, h3 a, h1, h2, h3, h4, [class*='title'], [data-title]"
        );
        if (titleEl) {
          const t = titleEl.getAttribute("title") || titleEl.getAttribute("aria-label") || titleEl.textContent;
          if (t && !isInvalidTitle(t)) return t.trim().replace(/\s+/g, " ");
        }
        const cardImg = card.querySelector?.("img[alt]");
        if (cardImg) {
          const alt = cardImg.getAttribute("alt")?.trim().replace(/\s+/g, " ");
          if (alt && !isInvalidTitle(alt) && alt.length > 3) return alt;
        }
      }
    }

    // 4. Element attributes and innerText lines (filtering out durations)
    for (const el of candidateEls) {
      const attrTitle = el.getAttribute?.("title") || el.getAttribute?.("aria-label");
      if (attrTitle && !isInvalidTitle(attrTitle)) {
        return attrTitle.trim().replace(/\s+/g, " ");
      }

      const lines = (el.innerText || el.textContent || "")
        .split("\n")
        .map((s) => s.trim().replace(/\s+/g, " "))
        .filter((s) => !isInvalidTitle(s) && s.length > 3);

      if (lines.length > 0) {
        return lines[0];
      }
    }

    // 5. Watch page document.title fallback
    if (isVideoWatchUrl(window.location.href) && document.title) {
      const cleanDocTitle = document.title.replace(/\s*-\s*YouTube.*$/i, "").replace(/\s*\/\s*X$/i, "").trim();
      if (!isInvalidTitle(cleanDocTitle)) return cleanDocTitle;
    }

    // 6. Pathname fallback
    if (targetUrl) {
      try {
        const u = new URL(targetUrl);
        const lastPart = u.pathname.split("/").filter(Boolean).pop();
        if (lastPart && !isInvalidTitle(lastPart)) return decodeURIComponent(lastPart);
      } catch { }
    }

    return targetUrl || "Media Stream";
  }

  let isAnyElementDragging = false;

  function makeElementDraggable(element, handles, storageKey) {
    if (!element) return;
    const handleList = (Array.isArray(handles) ? handles : [handles || element]).filter(Boolean);
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let maxLeft = 0;
    let maxTop = 0;
    let rafId = null;
    let drawerWasOpen = false;
    let activeCapturedElement = null;

    // Inhibit native browser/OS dragging in Opera, Chrome, and Edge
    element.setAttribute("draggable", "false");
    element.addEventListener("dragstart", (e) => e.preventDefault(), true);
    element.addEventListener("selectstart", (e) => {
      if (!e.target.closest("input, textarea")) e.preventDefault();
    }, true);

    handleList.forEach((h) => {
      h.setAttribute("draggable", "false");
      h.addEventListener("dragstart", (e) => e.preventDefault(), true);
      h.addEventListener("selectstart", (e) => e.preventDefault(), true);
    });

    const onPointerMove = (moveEvent) => {
      if (!isDragging) return;
      moveEvent.preventDefault();
      if (moveEvent.stopPropagation) moveEvent.stopPropagation();
      if (moveEvent.stopImmediatePropagation) moveEvent.stopImmediatePropagation();

      const clientX = moveEvent.clientX;
      const clientY = moveEvent.clientY;

      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!isDragging) return;
        const dx = clientX - startX;
        const dy = clientY - startY;

        let newLeft = Math.max(8, Math.min(initialLeft + dx, maxLeft));
        let newTop = Math.max(8, Math.min(initialTop + dy, maxTop));

        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
      });
    };

    const onPointerUp = (upEvent) => {
      if (!isDragging) return;
      isDragging = false;
      isAnyElementDragging = false;

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      try {
        if (activeCapturedElement && upEvent && upEvent.pointerId !== undefined && typeof activeCapturedElement.releasePointerCapture === "function") {
          activeCapturedElement.releasePointerCapture(upEvent.pointerId);
        }
      } catch { }
      activeCapturedElement = null;

      document.body.classList.remove("devizee-dragging");
      element.classList.remove("devizee-is-dragging");

      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
      document.removeEventListener("mousemove", onPointerMove, true);
      document.removeEventListener("mouseup", onPointerUp, true);

      // Re-open drawer if it was open prior to drag
      const drawer = element.querySelector?.("#devizee-batch-drawer");
      if (drawerWasOpen && drawer) {
        drawer.style.display = "flex";
        const toggleBtn = element.querySelector?.("#devizee-batch-toggle-list");
        if (toggleBtn) toggleBtn.classList.add("devizee-drawer-open");
      }

      if (storageKey) {
        try {
          const finalRect = element.getBoundingClientRect();
          localStorage.setItem(storageKey, JSON.stringify({ left: Math.round(finalRect.left), top: Math.round(finalRect.top) }));
        } catch { }
      }
    };

    const startDrag = (e) => {
      if (e.button !== 0) return;
      if (isDragging) return;

      // Don't drag if clicking buttons, inputs, links, or inside the expanded batch drawer
      if (e.target && e.target.closest("button, a, input, select, textarea, #devizee-batch-drawer, .devizee-drawer-item")) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();

      isDragging = true;
      isAnyElementDragging = true;
      document.body.classList.add("devizee-dragging");
      element.classList.add("devizee-is-dragging");

      // Pointer capture inhibits Opera from starting window drag
      try {
        const captureTarget = (e.currentTarget && typeof e.currentTarget.setPointerCapture === "function")
          ? e.currentTarget
          : (typeof element.setPointerCapture === "function" ? element : null);

        if (captureTarget && e.pointerId !== undefined) {
          captureTarget.setPointerCapture(e.pointerId);
          activeCapturedElement = captureTarget;
        }
      } catch { }

      const drawer = element.querySelector?.("#devizee-batch-drawer");
      if (drawer && drawer.style.display !== "none") {
        drawerWasOpen = true;
        drawer.style.display = "none";
        const toggleBtn = element.querySelector?.("#devizee-batch-toggle-list");
        if (toggleBtn) toggleBtn.classList.remove("devizee-drawer-open");
      } else {
        drawerWasOpen = false;
      }

      const rect = element.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      element.style.bottom = "auto";
      element.style.right = "auto";
      element.style.transform = "none";
      element.style.left = `${initialLeft}px`;
      element.style.top = `${initialTop}px`;

      const elWidth = element.offsetWidth || rect.width;
      const elHeight = element.offsetHeight || rect.height;
      maxLeft = Math.max(8, window.innerWidth - elWidth - 8);
      maxTop = Math.max(8, window.innerHeight - elHeight - 8);

      window.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
      window.addEventListener("pointerup", onPointerUp, { capture: true, passive: false });
      window.addEventListener("pointercancel", onPointerUp, { capture: true, passive: false });
      document.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
      document.addEventListener("pointerup", onPointerUp, { capture: true, passive: false });
      document.addEventListener("pointercancel", onPointerUp, { capture: true, passive: false });
      document.addEventListener("mousemove", onPointerMove, { capture: true, passive: false });
      document.addEventListener("mouseup", onPointerUp, { capture: true, passive: false });
    };

    handleList.forEach((h) => {
      h.addEventListener("pointerdown", startDrag, { capture: true, passive: false });
      h.addEventListener("mousedown", startDrag, { capture: true, passive: false });
    });
  }

  // ─── Batch Link Collector Mode ───

  let isBatchModeActive = false;
  let batchBanner = null;

  async function getStoredBatch() {
    const res = await chrome.storage.local.get({ batchCollectedLinks: [] });
    const list = Array.isArray(res.batchCollectedLinks) ? res.batchCollectedLinks : [];
    let updated = false;
    for (const item of list) {
      if (isInvalidTitle(item.title)) {
        const better = extractMediaTitle(null, item.url, null);
        if (better && !isInvalidTitle(better)) {
          item.title = better;
          updated = true;
        }
      }
    }
    if (updated) {
      chrome.storage.local.set({ batchCollectedLinks: list }).catch(() => {});
    }
    return list;
  }

  function renderBatchDrawer(batch) {
    const drawer = document.getElementById("devizee-batch-drawer");
    if (!drawer) return;

    if (batch.length === 0) {
      drawer.innerHTML = `
        <div class="devizee-drawer-header">
          <span>Collected Links (0)</span>
          <span style="font-size: 10px; color: #94a3b8; font-weight: normal;">Click any video or link to add</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 22px 10px;">
          No links collected yet. Hover & click any video or link on the page!
        </div>
      `;
      return;
    }

    drawer.innerHTML = `
      <div class="devizee-drawer-header">
        <span>Collected Links (${batch.length})</span>
        <button id="devizee-drawer-clear" style="background:transparent; border:none; color:#ef4444; font-size:10px; cursor:pointer; font-weight:600;">Clear All</button>
      </div>
      <div class="devizee-drawer-list">
        ${batch.map((item, idx) => `
          <div class="devizee-drawer-item">
            <div class="devizee-drawer-item-info">
              <div class="devizee-drawer-item-title" title="${escapeHtml(item.title || item.url)}">
                <span style="color:#818cf8; font-family:monospace; margin-right:4px;">#${idx + 1}</span>
                ${escapeHtml(item.title || item.url)}
              </div>
              <span class="devizee-drawer-item-host">${escapeHtml(item.hostname || "link")}</span>
            </div>
            <button class="devizee-drawer-item-del" data-index="${idx}" title="Remove this link">
              ${ICONS.trash}
            </button>
          </div>
        `).join("")}
      </div>
    `;

    const clearBtn = drawer.querySelector("#devizee-drawer-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await chrome.storage.local.set({ batchCollectedLinks: [] });
        updateBatchBannerCount();
        showPickerToast("Batch cleared (0 links)");
      });
    }

    drawer.querySelectorAll(".devizee-drawer-item-del").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-index"), 10);
        const current = await getStoredBatch();
        if (idx >= 0 && idx < current.length) {
          const removed = current.splice(idx, 1)[0];
          await chrome.storage.local.set({ batchCollectedLinks: current });
          updateBatchBannerCount();
          showPickerToast(`Removed: "${(removed.title || "item").slice(0, 24)}"`);
        }
      });
    });
  }

  async function updateBatchBannerCount() {
    const batch = await getStoredBatch();
    const countEl = document.getElementById("devizee-batch-count-val");
    const sendCountEl = document.getElementById("devizee-batch-send-count");
    const viewCountEl = document.getElementById("devizee-batch-view-count");
    const lastTitleEl = document.getElementById("devizee-batch-last-title");
    const sendBtn = document.getElementById("devizee-batch-send-btn");

    if (countEl) countEl.textContent = String(batch.length);
    if (sendCountEl) sendCountEl.textContent = String(batch.length);
    if (viewCountEl) viewCountEl.textContent = String(batch.length);

    if (lastTitleEl) {
      if (batch.length > 0) {
        const last = batch[batch.length - 1];
        const t = (last.title || last.url || "").slice(0, 32);
        lastTitleEl.textContent = `• Last: "${t}${last.title?.length > 32 ? "..." : ""}"`;
        lastTitleEl.style.display = "inline";
      } else {
        lastTitleEl.style.display = "none";
      }
    }

    if (sendBtn) {
      sendBtn.disabled = batch.length === 0;
      if (batch.length === 0) {
        sendBtn.classList.add("devizee-btn-disabled");
      } else {
        sendBtn.classList.remove("devizee-btn-disabled");
      }
    }

    renderBatchDrawer(batch);
  }

  async function exitAndDiscardBatch() {
    await chrome.storage.local.set({ batchCollectedLinks: [] });
    showPickerToast("✕ Batch discarded and exited");
    stopBatchCollectorMode();
  }

  async function startBatchCollectorMode() {
    if (isPickerActive) stopPickerMode();
    if (isBatchModeActive) return;
    isBatchModeActive = true;

    document.documentElement.classList.add("devizee-picker-active");

    const batch = await getStoredBatch();

    // 1. Create Top Floating Batch Banner
    batchBanner = document.createElement("div");
    batchBanner.id = "devizee-batch-banner";
    applyWidgetTheme(batchBanner, currentSettings.theme);
    batchBanner.innerHTML = `
      <div class="devizee-banner-content">
        <div class="devizee-banner-icon devizee-batch-icon">${ICONS.batchRadar}</div>
        <div class="devizee-banner-text">
          <span class="devizee-banner-title">Devizee Batch Link Collector</span>
          <span class="devizee-banner-hint">
            Click any video or link to collect • <strong id="devizee-batch-count-val">${batch.length}</strong> links
            <span id="devizee-batch-last-title" style="color: #a5b4fc; margin-left: 3px; display: none;"></span>
          </span>
        </div>
      </div>
      <div class="devizee-banner-actions">
        <button class="devizee-banner-view-btn" id="devizee-batch-toggle-list" title="View collected titles and links">
          View (<span id="devizee-batch-view-count">${batch.length}</span>) ▾
        </button>
        <button class="devizee-banner-send-btn ${batch.length === 0 ? "devizee-btn-disabled" : ""}" id="devizee-batch-send-btn" title="Send all collected links to Devizee Desktop Batch Download">
          Send to Devizee (<span id="devizee-batch-send-count">${batch.length}</span>)
        </button>
        <button class="devizee-banner-clear-btn" id="devizee-batch-clear-btn" title="Clear collected links">
          Clear
        </button>
        <button class="devizee-banner-exit" id="devizee-exit-batch" title="Discard batch and exit collector mode (Esc)">
          Discard & Exit [Esc]
        </button>
        <div class="devizee-drag-handle" id="devizee-batch-drag-handle" title="Drag to reposition banner">
          ${ICONS.grip}
        </div>
      </div>
      <div id="devizee-batch-drawer" style="display: none;"></div>
    `;
    document.body.appendChild(batchBanner);

    // Restore saved batch banner position
    try {
      const savedBatchPos = JSON.parse(localStorage.getItem("devizee_batch_pos"));
      if (savedBatchPos && typeof savedBatchPos.left === "number" && typeof savedBatchPos.top === "number") {
        const maxL = window.innerWidth - 300;
        const maxT = window.innerHeight - 80;
        const safeL = Math.max(10, Math.min(savedBatchPos.left, maxL));
        const safeT = Math.max(36, Math.min(savedBatchPos.top, maxT));
        batchBanner.style.left = `${safeL}px`;
        batchBanner.style.top = `${safeT}px`;
        batchBanner.style.right = "auto";
        batchBanner.style.bottom = "auto";
        batchBanner.style.transform = "none";
      }
    } catch { }

    // Make banner draggable from either the grip handle, header area, or banner body
    const dragHandle = batchBanner.querySelector("#devizee-batch-drag-handle");
    const bannerContent = batchBanner.querySelector(".devizee-banner-content");
    makeElementDraggable(batchBanner, [batchBanner, dragHandle, bannerContent], "devizee_batch_pos");

    // Toggle drawer dropdown
    const toggleListBtn = document.getElementById("devizee-batch-toggle-list");
    const drawerEl = document.getElementById("devizee-batch-drawer");
    if (toggleListBtn && drawerEl) {
      toggleListBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = drawerEl.style.display !== "none";
        drawerEl.style.display = isOpen ? "none" : "flex";
        toggleListBtn.classList.toggle("devizee-drawer-open", !isOpen);
      });
    }

    // Initial drawer render & count
    updateBatchBannerCount();

    // 2. Create Floating Highlight Box if not present
    if (!inspectorBox) {
      inspectorBox = document.createElement("div");
      inspectorBox.id = "devizee-inspector-box";
      inspectorBox.innerHTML = `
        <div class="devizee-inspector-badge">
          <span class="devizee-badge-type">+ ADD TO BATCH</span>
          <span class="devizee-badge-url"></span>
        </div>
      `;
      document.body.appendChild(inspectorBox);
    }

    // Attach Event Listeners
    document.addEventListener("mousemove", onBatchMouseMove, true);
    document.addEventListener("click", onBatchClick, true);
    document.addEventListener("keydown", onBatchKeyDown, true);

    const exitBtn = document.getElementById("devizee-exit-batch");
    if (exitBtn) {
      exitBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        exitAndDiscardBatch();
      });
    }

    const clearBtn = document.getElementById("devizee-batch-clear-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await chrome.storage.local.set({ batchCollectedLinks: [] });
        updateBatchBannerCount();
        showPickerToast("Batch cleared (0 links)");
      });
    }

    const sendBtn = document.getElementById("devizee-batch-send-btn");
    if (sendBtn) {
      sendBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const currentBatch = await getStoredBatch();
        if (currentBatch.length === 0) {
          showPickerToast("No links collected yet. Click links or videos on the page!");
          return;
        }
        sendBtn.textContent = "Sending...";
        sendBtn.disabled = true;

        chrome.runtime.sendMessage({ action: "downloadBatchUrls", urls: currentBatch.map((x) => x.url) }, async (resp) => {
          if (!resp || !resp.success) {
            sendBtn.disabled = false;
            sendBtn.textContent = `Send to Devizee (${currentBatch.length})`;
            const err = resp?.message || "Devizee Desktop is closed. Please open Devizee Lite or Devizee Pro.";
            showPickerToast(`⚠️ ${err}`, 4500, true);
            return;
          }

          showPickerToast(`✓ Sent ${currentBatch.length} links to Devizee Desktop!`);
          await chrome.storage.local.set({ batchCollectedLinks: [] });
          setTimeout(() => {
            stopBatchCollectorMode();
          }, 600);
        });
      });
    }
  }

  function stopBatchCollectorMode() {
    if (!isBatchModeActive) return;
    isBatchModeActive = false;

    document.documentElement.classList.remove("devizee-picker-active");

    if (batchBanner && batchBanner.parentNode) {
      batchBanner.parentNode.removeChild(batchBanner);
      batchBanner = null;
    }

    if (inspectorBox && inspectorBox.parentNode) {
      inspectorBox.parentNode.removeChild(inspectorBox);
      inspectorBox = null;
    }

    document.removeEventListener("mousemove", onBatchMouseMove, true);
    document.removeEventListener("click", onBatchClick, true);
    document.removeEventListener("keydown", onBatchKeyDown, true);
    currentHoverTarget = null;
  }

  function onBatchMouseMove(e) {
    if (isAnyElementDragging || !isBatchModeActive || !inspectorBox) return;

    const media = findMediaOrLink(e);

    if (media && media.url) {
      currentHoverTarget = media;
      const rect = media.el.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      inspectorBox.style.display = "block";
      inspectorBox.style.top = `${rect.top + scrollY}px`;
      inspectorBox.style.left = `${rect.left + scrollX}px`;
      inspectorBox.style.width = `${rect.width}px`;
      inspectorBox.style.height = `${rect.height}px`;

      const typeBadge = inspectorBox.querySelector(".devizee-badge-type");
      const urlBadge = inspectorBox.querySelector(".devizee-badge-url");

      if (typeBadge) typeBadge.textContent = "+ ADD TO BATCH";
      if (urlBadge) {
        try {
          const parsed = new URL(media.url);
          urlBadge.textContent = `${parsed.hostname}${parsed.pathname.slice(0, 30)}`;
        } catch {
          urlBadge.textContent = media.url.slice(0, 40);
        }
      }
    } else {
      currentHoverTarget = null;
      inspectorBox.style.display = "none";
    }
  }

  async function onBatchClick(e) {
    if (!isBatchModeActive) return;

    if (e.target && e.target.closest && (e.target.closest("#devizee-batch-banner") || e.target.closest("#devizee-picker-banner") || e.target.closest("#devizee-grabber-widget"))) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const media = currentHoverTarget || findMediaOrLink(e);
    if (!media || !media.url) return;

    const targetUrl = media.url.trim();
    const batch = await getStoredBatch();

    // Canonical duplicate checking
    const targetNorm = canonicalizeMediaUrl(targetUrl);
    const isDup = batch.some((item) => canonicalizeMediaUrl(item.url) === targetNorm);

    // Extract title accurately (prioritizing full title over duration badges on thumbnails)
    const title = extractMediaTitle(e.target, targetUrl, media.el);

    if (isDup) {
      showPickerToast(`⚠️ Already in batch list: "${title.slice(0, 28)}..."`, 2500, true);
      return;
    }

    // Visual flash feedback
    if (inspectorBox) {
      inspectorBox.classList.add("devizee-inspector-success");
      setTimeout(() => inspectorBox?.classList.remove("devizee-inspector-success"), 300);
    }

    batch.push({
      url: targetUrl,
      title: title || targetUrl,
      type: media.type || "MEDIA",
      hostname: window.location.hostname.replace(/^www\./, ""),
      addedAt: Date.now()
    });

    await chrome.storage.local.set({ batchCollectedLinks: batch });
    updateBatchBannerCount();
    showPickerToast(`✓ Added to Batch (${batch.length} links)`);
  }

  function onBatchKeyDown(e) {
    if (e.key === "Escape") {
      exitAndDiscardBatch();
    }
  }

  // ─── Floating Grabber Widget ───

  function applyWidgetTheme(w, theme) {
    if (!w) return;
    const mode = theme === "light" ? "light" : "dark";
    w.setAttribute("data-theme", mode);
  }

  function removeWidget() {
    if (widget) {
      widget.classList.remove("devizee-visible");
      const oldWidget = widget;
      widget = null;
      setTimeout(() => {
        if (oldWidget && oldWidget.parentNode) {
          oldWidget.parentNode.removeChild(oldWidget);
        }
      }, 200);
    }
  }

  function dismissWidget() {
    isDismissed = true;
    removeWidget();
  }

  function updateWidgetText(mediaList) {
    if (!widget) return;
    const actionEl = widget.querySelector("#devizee-pill-action");
    if (!actionEl) return;

    const playingItem = mediaList.find((m) => m.isPlaying);
    if (playingItem) {
      actionEl.innerHTML = `<span style="color:#10b981; font-weight:bold; margin-right:4px;">▶</span> Send Playing Video`;
      widget.title = `Devizee: Send playing video (${playingItem.title}) to Desktop`;
    } else if (mediaList.length > 1) {
      actionEl.textContent = `Devizee (${mediaList.length} detected)`;
      widget.title = `Devizee: ${mediaList.length} media streams detected on this page`;
    } else if (mediaList.length === 1) {
      actionEl.textContent = "Download in Devizee";
      widget.title = "Devizee: Click to send media stream to Desktop";
    } else {
      actionEl.textContent = "Devizee";
      widget.title = "Devizee: Click to send page link to Desktop, or use Crosshair to pick media/links";
    }
  }

  function isFullscreenActive() {
    // 1. Standard HTML5 Fullscreen API
    if (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    ) {
      return true;
    }

    // 2. F11 / Window Fullscreen (Edge & Chrome)
    if (
      window.innerHeight > 0 &&
      screen.height > 0 &&
      Math.abs(window.innerHeight - screen.height) <= 4 &&
      Math.abs(window.innerWidth - screen.width) <= 4
    ) {
      return true;
    }

    // 3. Platform specific player fullscreen attributes (YouTube, Vimeo, Twitch, etc.)
    if (
      document.querySelector(".ytp-fullscreen, [fullscreen], .player-fullscreen, .is-fullscreen, .vjs-fullscreen")
    ) {
      return true;
    }

    return false;
  }

  function handleFullscreenChange() {
    const isFull = isFullscreenActive();
    document.documentElement.classList.toggle("devizee-in-fullscreen", isFull);
    if (document.body) {
      document.body.classList.toggle("devizee-in-fullscreen", isFull);
    }
    if (widget) {
      widget.classList.toggle("devizee-fullscreen-hidden", isFull);
      if (isFull) {
        widget.classList.remove("devizee-visible");
      }
    }
    if (!isFull) {
      updateWidgetState();
    }
  }

  function updateWidgetState() {
    if (isDismissed || !currentSettings.showFloatingPill || currentSettings.paused || isBlacklistedSite() || isFullscreenActive()) {
      if (widget) {
        widget.classList.remove("devizee-visible");
        if (isFullscreenActive()) {
          widget.classList.add("devizee-fullscreen-hidden");
        }
      }
      return;
    }

    if (widget) {
      widget.classList.remove("devizee-fullscreen-hidden");
    }

    const mediaList = scanMediaOnPage();

    if (!widget) {
      initWidget();
      return;
    }

    widget.classList.add("devizee-visible");
    applyWidgetTheme(widget, currentSettings.theme);
    updateWidgetText(mediaList);
  }

  function initWidget() {
    if (isDismissed || widget || !currentSettings.showFloatingPill || currentSettings.paused || isBlacklistedSite()) return;

    const mediaList = scanMediaOnPage();
    const playingItem = mediaList.find((m) => m.isPlaying);
    let label = "Devizee";
    if (playingItem) {
      label = `<span style="color:#10b981; font-weight:bold; margin-right:4px;">▶</span> Send Playing Video`;
    } else if (mediaList.length > 1) {
      label = `Devizee (${mediaList.length} detected)`;
    } else if (mediaList.length === 1) {
      label = "Download in Devizee";
    }

    widget = document.createElement("div");
    widget.id = "devizee-grabber-widget";
    applyWidgetTheme(widget, currentSettings.theme);

    widget.innerHTML = `
      <div class="devizee-grabber-icon-btn" id="devizee-pill-download" title="Send Link or Video to Devizee Desktop">
        ${ICONS.devizeeLogo}
      </div>
      <div class="devizee-grabber-text" id="devizee-pill-action">${label}</div>
      <div class="devizee-grabber-sniff-btn" id="devizee-pill-sniffer" title="Inspect & Pick Single Video or Link (Crosshair)">
        ${ICONS.crosshair}
      </div>
      <div class="devizee-grabber-batch-btn" id="devizee-pill-batch" title="Batch Link Collector: Click multiple videos or links on page to collect">
        ${ICONS.batchRadar}
      </div>
      <div class="devizee-pill-grip" id="devizee-pill-grip" title="Drag to reposition pill">
        ${ICONS.grip}
      </div>
      <div class="devizee-grabber-close" id="devizee-pill-close" title="Dismiss">
        ${ICONS.close}
      </div>
    `;

    document.body.appendChild(widget);

    // Restore saved pill position
    try {
      const savedPos = JSON.parse(localStorage.getItem("devizee_pill_pos"));
      if (savedPos && typeof savedPos.left === "number" && typeof savedPos.top === "number") {
        const maxL = window.innerWidth - 180;
        const maxT = window.innerHeight - 50;
        const safeL = Math.max(10, Math.min(savedPos.left, maxL));
        const safeT = Math.max(10, Math.min(savedPos.top, maxT));
        widget.style.left = `${safeL}px`;
        widget.style.top = `${safeT}px`;
        widget.style.right = "auto";
        widget.style.bottom = "auto";
        widget.style.transform = "none";
      }
    } catch { }

    // Make pill draggable
    const pillGrip = widget.querySelector("#devizee-pill-grip");
    if (pillGrip) {
      makeElementDraggable(widget, pillGrip, "devizee_pill_pos");
    }

    requestAnimationFrame(() => {
      if (widget) widget.classList.add("devizee-visible");
    });

    // 1. Download Button & Action Text: Directly send active/playing video to Devizee desktop!
    const triggerDownload = (e) => {
      e.stopPropagation();
      const currentList = scanMediaOnPage();
      const media = currentList.find((m) => m.isPlaying) || currentList[0];
      const targetUrl = media ? media.url : window.location.href;

      const actionEl = widget?.querySelector("#devizee-pill-action");
      const dlBtn = widget?.querySelector("#devizee-pill-download");

      if (actionEl) actionEl.textContent = "Relaying...";
      if (dlBtn) dlBtn.innerHTML = ICONS.check;

      chrome.runtime.sendMessage({ action: "downloadUrl", url: targetUrl }, (resp) => {
        if (!resp || !resp.success) {
          if (actionEl) actionEl.textContent = "Devizee Closed";
          if (dlBtn) dlBtn.innerHTML = ICONS.devizeeLogo;
          const msg = resp?.message || "Devizee Desktop is not running. Please open Devizee Lite or Pro.";
          showPickerToast(`⚠️ ${msg}`, 4500, true);
          return;
        }

        if (widget) {
          widget.classList.add("devizee-success");
          if (actionEl) actionEl.textContent = "✓ Sent to Devizee!";
        }

        setTimeout(() => {
          if (widget) {
            widget.classList.remove("devizee-success");
            if (dlBtn) dlBtn.innerHTML = ICONS.devizeeLogo;
            updateWidgetState();
          }
        }, 2200);
      });
    };

    const downloadBtn = widget.querySelector("#devizee-pill-download");
    const actionEl = widget.querySelector("#devizee-pill-action");
    if (downloadBtn) downloadBtn.addEventListener("click", triggerDownload);
    if (actionEl) actionEl.addEventListener("click", triggerDownload);

    // 2. Sniffer Button: Activates interactive crosshair picker
    const sniffBtn = widget.querySelector("#devizee-pill-sniffer");
    if (sniffBtn) {
      sniffBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        startPickerMode();
      });
    }

    // 3. Batch Link Collector Button: Activates multi-click link collection
    const batchBtn = widget.querySelector("#devizee-pill-batch");
    if (batchBtn) {
      batchBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        startBatchCollectorMode();
      });
    }

    // 4. Close / Dismiss Button
    const closeBtn = widget.querySelector("#devizee-pill-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dismissWidget();
      });
    }
  }

  // Live Settings Synchronization
  chrome.storage.local.get({
    showFloatingPill: true,
    theme: "dark",
    paused: false,
    blacklistedDomains: ["netflix.com", "disneyplus.com", "primevideo.com", "hulu.com", "max.com"]
  }).then((res) => {
    currentSettings = { ...currentSettings, ...res };
    if (!currentSettings.showFloatingPill || currentSettings.paused || isBlacklistedSite()) {
      removeWidget();
    } else {
      updateWidgetState();
    }
  }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      let stateChanged = false;
      if (changes.showFloatingPill !== undefined) {
        currentSettings.showFloatingPill = changes.showFloatingPill.newValue;
        stateChanged = true;
      }
      if (changes.theme !== undefined) {
        currentSettings.theme = changes.theme.newValue;
        if (widget) {
          applyWidgetTheme(widget, currentSettings.theme);
        }
        if (pickerBanner) {
          applyWidgetTheme(pickerBanner, currentSettings.theme);
        }
        if (batchBanner) {
          applyWidgetTheme(batchBanner, currentSettings.theme);
        }
      }
      if (changes.paused !== undefined) {
        currentSettings.paused = changes.paused.newValue;
        stateChanged = true;
      }
      if (changes.blacklistedDomains !== undefined) {
        currentSettings.blacklistedDomains = changes.blacklistedDomains.newValue;
        stateChanged = true;
      }

      if (stateChanged) {
        if (!currentSettings.showFloatingPill || currentSettings.paused || isBlacklistedSite()) {
          removeWidget();
        } else {
          isDismissed = false;
          updateWidgetState();
        }
      }
    }
  });

  // ─── Message Handling from Extension Popup / Background ───

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scanMedia") {
      const media = scanMediaOnPage();
      sendResponse({ items: media, pageTitle: document.title, pageUrl: window.location.href });
      return true;
    }

    if (request.action === "startPickerMode") {
      startPickerMode();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "stopPickerMode") {
      stopPickerMode();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "startBatchCollectorMode") {
      startBatchCollectorMode();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "stopBatchCollectorMode") {
      stopBatchCollectorMode();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "showToast") {
      showPickerToast(request.message, request.duration || 4000, !!request.isError);
      sendResponse({ success: true });
      return true;
    }
  });

  // Dynamic Mutation Observer for SPAs (YouTube, TikTok, Reddit, etc.)
  let debounceTimeout = null;
  const observer = new MutationObserver(() => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      updateWidgetState();
    }, 800);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Real-time Video Playback Listeners (instant detection when user plays/pauses)
  const onMediaPlaybackEvent = () => {
    setTimeout(() => {
      updateWidgetState();
    }, 200);
  };

  window.addEventListener("play", onMediaPlaybackEvent, true);
  window.addEventListener("pause", onMediaPlaybackEvent, true);
  window.addEventListener("ended", onMediaPlaybackEvent, true);
  window.addEventListener("playing", onMediaPlaybackEvent, true);

  // Fullscreen Detection Listeners (hide pill in fullscreen, restore on exit)
  document.addEventListener("fullscreenchange", handleFullscreenChange, true);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange, true);
  document.addEventListener("mozfullscreenchange", handleFullscreenChange, true);
  document.addEventListener("MSFullscreenChange", handleFullscreenChange, true);
  window.addEventListener("resize", handleFullscreenChange, true);

  // Initial Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      updateWidgetState();
    });
  } else {
    updateWidgetState();
  }
})();
