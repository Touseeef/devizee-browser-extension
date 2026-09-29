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
        type: "stream",
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
            type: "stream",
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

  function findMediaOrLink(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    if (el.closest("#devizee-picker-banner") || el.closest("#devizee-grabber-widget") || el.closest("#devizee-inspector-box")) {
      return null;
    }

    // Direct video or audio
    if (el.tagName === "VIDEO" || el.tagName === "AUDIO") {
      const src = el.currentSrc || el.src || el.querySelector("source")?.src || (isStreamSite() ? window.location.href : null);
      return { el, url: src, type: el.tagName === "VIDEO" ? "VIDEO" : "AUDIO" };
    }

    // Nearest iframe embed
    const iframe = el.closest("iframe");
    if (iframe && iframe.src) {
      return { el: iframe, url: iframe.src, type: "STREAM EMBED" };
    }

    // Direct link or ancestor link
    const link = el.closest("a[href]");
    if (link && link.href) {
      const isMedia = MEDIA_FILE_EXTENSIONS.test(link.href);
      return { el: link, url: link.href, type: isMedia ? "MEDIA LINK" : "LINK" };
    }

    // Video container / player container
    const videoInside = el.querySelector("video, audio");
    if (videoInside) {
      const src = videoInside.currentSrc || videoInside.src || videoInside.querySelector("source")?.src || (isStreamSite() ? window.location.href : null);
      return { el, url: src, type: "VIDEO PLAYER" };
    }

    // Check for data-video-url or data-src
    const dataSrc = el.getAttribute("data-video-url") || el.getAttribute("data-src") || el.getAttribute("data-stream-url");
    if (dataSrc) {
      return { el, url: dataSrc, type: "STREAM" };
    }

    // If on a stream site (YouTube, Vimeo, etc.), clicking the video player wrapper
    if (isStreamSite() && (el.classList.contains("html5-video-player") || el.closest(".html5-video-player") || el.closest("#movie_player"))) {
      return { el: el.closest(".html5-video-player") || el, url: window.location.href, type: "VIDEO STREAM" };
    }

    return null;
  }

  function onPickerMouseMove(e) {
    if (!isPickerActive || !inspectorBox) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const media = findMediaOrLink(el);

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

    if (e.target.closest("#devizee-picker-banner")) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (currentHoverTarget && currentHoverTarget.url) {
      const targetUrl = currentHoverTarget.url;

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

  function showPickerToast(msg) {
    const toast = document.createElement("div");
    toast.className = "devizee-picker-toast";
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("devizee-toast-show");
    }, 10);
    setTimeout(() => {
      toast.classList.remove("devizee-toast-show");
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // ─── Floating Grabber Widget ───

  function updateWidgetState() {
    if (isDismissed) return;
    const mediaList = scanMediaOnPage();

    if (mediaList.length === 0) {
      if (widget) {
        widget.classList.remove("devizee-visible");
      }
      return;
    }

    if (!widget) {
      initWidget();
      return;
    }

    widget.classList.add("devizee-visible");
    const actionEl = widget.querySelector("#devizee-pill-action");
    if (!actionEl) return;

    const playingItem = mediaList.find((m) => m.isPlaying);
    if (playingItem) {
      actionEl.innerHTML = `<span style="color:#10b981; font-weight:bold; margin-right:4px;">▶</span> Send Playing Video`;
    } else if (mediaList.length > 1) {
      actionEl.textContent = `Devizee (${mediaList.length} detected)`;
    } else {
      actionEl.textContent = "Download in Devizee";
    }
  }

  async function initWidget() {
    if (isDismissed || widget) return;

    const settings = await chrome.storage.local.get({
      showFloatingPill: true,
      paused: false
    });

    if (!settings.showFloatingPill || settings.paused) {
      return;
    }

    const mediaList = scanMediaOnPage();
    if (mediaList.length === 0) {
      return;
    }

    const playingItem = mediaList.find((m) => m.isPlaying);
    let label = "Download in Devizee";
    if (playingItem) {
      label = `<span style="color:#10b981; font-weight:bold; margin-right:4px;">▶</span> Send Playing Video`;
    } else if (mediaList.length > 1) {
      label = `Devizee (${mediaList.length} detected)`;
    }

    widget = document.createElement("div");
    widget.id = "devizee-grabber-widget";
    widget.title = "Devizee - Privacy-Focused Download Manager";

    widget.innerHTML = `
      <div class="devizee-grabber-icon-btn" id="devizee-pill-logo" title="Devizee Sniffer: Click to pick any video or link">
        ${ICONS.devizeeLogo}
      </div>
      <div class="devizee-grabber-text" id="devizee-pill-action">${label}</div>
      <div class="devizee-grabber-sniff-btn" id="devizee-pill-sniffer" title="Inspect & Pick with Crosshair">
        ${ICONS.crosshair}
      </div>
      <div class="devizee-grabber-close" id="devizee-pill-close" title="Dismiss Widget">
        ${ICONS.close}
      </div>
    `;

    document.body.appendChild(widget);

    requestAnimationFrame(() => {
      widget.classList.add("devizee-visible");
    });

    // 1. Logo or Crosshair button click: Activates Interactive Picker Mode
    const logoBtn = widget.querySelector("#devizee-pill-logo");
    const sniffBtn = widget.querySelector("#devizee-pill-sniffer");

    const launchPicker = (e) => {
      e.stopPropagation();
      startPickerMode();
    };

    if (logoBtn) logoBtn.addEventListener("click", launchPicker);
    if (sniffBtn) sniffBtn.addEventListener("click", launchPicker);

    // 2. Main pill action click: Send active stream or first video to Devizee
    const actionEl = widget.querySelector("#devizee-pill-action");
    actionEl.addEventListener("click", (e) => {
      e.stopPropagation();

      const media = detectedMediaCache.find((m) => m.isPlaying) || detectedMediaCache[0];
      const targetUrl = media ? media.url : window.location.href;

      actionEl.textContent = "Relaying...";

      chrome.runtime.sendMessage({ action: "downloadUrl", url: targetUrl }, (res) => {
        widget.classList.add("devizee-success");
        actionEl.textContent = "✓ Sent to Devizee!";

        setTimeout(() => {
          if (widget) {
            widget.classList.remove("devizee-success");
            updateWidgetState();
          }
        }, 2200);
      });
    });

    // 3. Close / Dismiss button
    const closeBtn = widget.querySelector("#devizee-pill-close");
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissWidget();
    });
  }

  function dismissWidget() {
    isDismissed = true;
    if (widget) {
      widget.classList.remove("devizee-visible");
      setTimeout(() => {
        if (widget && widget.parentNode) {
          widget.parentNode.removeChild(widget);
          widget = null;
        }
      }, 250);
    }
  }

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

  // Initial Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      updateWidgetState();
    });
  } else {
    updateWidgetState();
  }
})();
