/**
 * Devizee - Privacy Focused Content Script
 * Detects media players and provides a clean floating download button.
 */

(function () {
  let widget = null;
  let isDismissed = false;

  const STREAM_DOMAINS = [
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "reddit.com",
    "facebook.com",
    "vimeo.com",
    "soundcloud.com",
    "twitch.tv",
    "bilibili.com",
    "dailymotion.com",
    "threads.net"
  ];

  function isStreamSite() {
    const host = window.location.hostname;
    return STREAM_DOMAINS.some((d) => host === d || host.endsWith("." + d));
  }

  function hasMediaOnPage() {
    return isStreamSite() || document.querySelector("video, audio") !== null;
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

    if (!hasMediaOnPage()) {
      return;
    }

    widget = document.createElement("div");
    widget.id = "devizee-grabber-widget";

    widget.innerHTML = `
      <div class="devizee-grabber-icon">⚡</div>
      <div class="devizee-grabber-text">Download with Devizee</div>
      <div class="devizee-grabber-close" title="Dismiss">×</div>
    `;

    document.body.appendChild(widget);

    // Fade in
    requestAnimationFrame(() => {
      widget.classList.add("devizee-visible");
    });

    // Click handler to download
    widget.addEventListener("click", (e) => {
      if (e.target.classList.contains("devizee-grabber-close")) {
        e.stopPropagation();
        dismissWidget();
        return;
      }

      const textEl = widget.querySelector(".devizee-grabber-text");
      textEl.textContent = "Relaying...";

      chrome.runtime.sendMessage(
        { action: "downloadUrl", url: window.location.href },
        (res) => {
          widget.classList.add("devizee-success");
          textEl.textContent = "✓ Sent to Devizee!";

          setTimeout(() => {
            if (widget) {
              widget.classList.remove("devizee-success");
              textEl.textContent = "Download with Devizee";
            }
          }, 2500);
        }
      );
    });

    // Close button
    const closeBtn = widget.querySelector(".devizee-grabber-close");
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

  // Observer to detect dynamically loaded videos (YouTube SPAs, TikTok, etc.)
  const observer = new MutationObserver(() => {
    if (!isDismissed && !widget && hasMediaOnPage()) {
      initWidget();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Initial check
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidget);
  } else {
    initWidget();
  }
})();
