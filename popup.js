document.addEventListener("DOMContentLoaded", async () => {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const statusSub = document.getElementById("statusSub");
  const refreshStatusBtn = document.getElementById("refreshStatusBtn");
  const activeTabUrlEl = document.getElementById("activeTabUrl");
  const downloadTabBtn = document.getElementById("downloadTabBtn");
  const downloadBtnText = document.getElementById("downloadBtnText");
  const sniffPageBtn = document.getElementById("sniffPageBtn");
  const mediaListContainer = document.getElementById("mediaListContainer");
  const downloadAllBtn = document.getElementById("downloadAllBtn");
  const detectedCountBadge = document.getElementById("detectedCountBadge");
  const toggleFloatingPill = document.getElementById("toggleFloatingPill");
  const toggleIntercept = document.getElementById("toggleIntercept");
  const selectTargetMode = document.getElementById("selectTargetMode");
  const themeSelect = document.getElementById("themeSelect");
  const optionsLink = document.getElementById("optionsLink");

  let currentTab = null;
  let detectedMediaItems = [];

  // 1. Theme Management (Instant Apply & Persist)
  const savedSettings = await chrome.storage.local.get({
    theme: "signature",
    targetMode: "auto",
    interceptDownloads: false,
    showFloatingPill: true
  });

  const activeTheme = savedSettings.theme || "signature";
  document.documentElement.setAttribute("data-theme", activeTheme);
  if (themeSelect) {
    themeSelect.value = activeTheme;
    themeSelect.addEventListener("change", async (e) => {
      const selected = e.target.value;
      document.documentElement.setAttribute("data-theme", selected);
      await chrome.storage.local.set({ theme: selected });
    });
  }

  // 2. Preferences Init
  toggleFloatingPill.checked = savedSettings.showFloatingPill;
  toggleIntercept.checked = savedSettings.interceptDownloads;
  selectTargetMode.value = savedSettings.targetMode;

  // 3. Query Active Tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      currentTab = tab;
      try {
        const parsed = new URL(tab.url);
        activeTabUrlEl.textContent = `${parsed.hostname}${parsed.pathname}`;
      } catch {
        activeTabUrlEl.textContent = tab.url;
      }

      // Query content script for all detected media on this tab
      loadDetectedMedia(tab.id);
    } else {
      activeTabUrlEl.textContent = "No accessible page";
      downloadTabBtn.disabled = true;
      sniffPageBtn.disabled = true;
      mediaListContainer.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 10px;">Cannot inspect internal browser pages</div>`;
    }
  } catch (err) {
    console.error("Tab query error:", err);
  }

  // 4. Desktop Status Check
  async function refreshStatus() {
    statusDot.className = "status-dot";
    statusText.textContent = "Scanning Desktop...";
    statusSub.textContent = "Ports 42421 & 42422";

    try {
      chrome.runtime.sendMessage({ action: "getStatus" }, (res) => {
        if (chrome.runtime.lastError || !res || !res.online) {
          statusDot.className = "status-dot";
          statusText.textContent = "Desktop Offline";
          statusSub.textContent = "Ready via Protocol / Native";
        } else {
          statusDot.className = "status-dot online";
          statusText.textContent = res.app || "Devizee Desktop";
          statusSub.textContent = `Online (Port ${res.port})`;
        }
      });
    } catch {
      statusText.textContent = "Offline";
    }
  }

  refreshStatus();
  refreshStatusBtn.addEventListener("click", refreshStatus);

  // 5. Load Detected Media from Content Script
  function loadDetectedMedia(tabId) {
    chrome.tabs.sendMessage(tabId, { action: "scanMedia" }, (res) => {
      if (chrome.runtime.lastError || !res || !Array.isArray(res.items)) {
        renderMediaItems([]);
        return;
      }

      detectedMediaItems = res.items;
      renderMediaItems(detectedMediaItems);
    });
  }

  function renderMediaItems(items) {
    if (!items || items.length === 0) {
      detectedCountBadge.textContent = "";
      downloadAllBtn.style.display = "none";
      mediaListContainer.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 12px 6px;">
          No direct media streams found on page.<br>
          <span style="font-size: 10px; opacity: 0.8;">Use "Sniff on Page" to pick any video or link!</span>
        </div>
      `;
      return;
    }

    detectedCountBadge.textContent = `${items.length} found`;
    downloadAllBtn.style.display = items.length > 1 ? "block" : "none";
    downloadAllBtn.textContent = `Queue All (${items.length})`;

    mediaListContainer.innerHTML = "";

    items.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "media-list-item";

      const typeLabel = item.type.toUpperCase();
      const metaParts = [];
      if (item.resolution) metaParts.push(item.resolution);
      if (item.duration) metaParts.push(item.duration);

      card.innerHTML = `
        <div class="media-item-info">
          <div class="media-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="media-item-meta">
            <span style="font-weight:700; color:var(--accent); font-size:9px;">${typeLabel}</span>
            ${item.isPlaying ? `<span class="badge-playing">PLAYING</span>` : ""}
            <span>${metaParts.join(" • ")}</span>
          </div>
        </div>
        <button class="btn-item-dl" title="Send to Devizee" data-url="${escapeHtml(item.url)}">
          Download
        </button>
      `;

      const dlBtn = card.querySelector(".btn-item-dl");
      dlBtn.addEventListener("click", () => {
        dlBtn.textContent = "Relaying...";
        chrome.runtime.sendMessage({ action: "downloadUrl", url: item.url }, (res) => {
          dlBtn.classList.add("success");
          dlBtn.textContent = "✓ Sent";
          setTimeout(() => {
            dlBtn.classList.remove("success");
            dlBtn.textContent = "Download";
          }, 2000);
        });
      });

      mediaListContainer.appendChild(card);
    });
  }

  // 6. Sniff on Page Button (Crosshair Picker)
  sniffPageBtn.addEventListener("click", () => {
    if (!currentTab || !currentTab.id) return;
    chrome.tabs.sendMessage(currentTab.id, { action: "startPickerMode" }, () => {
      window.close(); // Close extension popup so user interacts with page
    });
  });

  // 7. Download Tab / Active Video Button
  downloadTabBtn.addEventListener("click", async () => {
    if (!currentTab || !currentTab.url) return;

    // Pick currently playing media if any, else tab URL
    const playing = detectedMediaItems.find((m) => m.isPlaying);
    const targetUrl = playing ? playing.url : currentTab.url;

    downloadBtnText.textContent = "Relaying...";
    downloadTabBtn.style.opacity = "0.85";

    chrome.runtime.sendMessage({ action: "downloadUrl", url: targetUrl }, (res) => {
      downloadTabBtn.classList.add("success");
      downloadBtnText.textContent = "✓ Sent to Devizee!";

      setTimeout(() => {
        downloadTabBtn.classList.remove("success");
        downloadBtnText.textContent = "Send to Devizee";
        downloadTabBtn.style.opacity = "1";
      }, 2000);
    });
  });

  // 8. Queue All Media Button
  downloadAllBtn.addEventListener("click", () => {
    if (!detectedMediaItems || detectedMediaItems.length === 0) return;
    const urls = detectedMediaItems.map((m) => m.url).filter(Boolean);

    downloadAllBtn.textContent = "Queuing...";
    chrome.runtime.sendMessage({ action: "downloadBatch", urls }, (res) => {
      downloadAllBtn.textContent = `✓ Queued ${res?.count || urls.length}`;
      setTimeout(() => {
        downloadAllBtn.textContent = `Queue All (${detectedMediaItems.length})`;
      }, 2200);
    });
  });

  // 9. Preferences Change Handlers
  toggleFloatingPill.addEventListener("change", async (e) => {
    await chrome.storage.local.set({ showFloatingPill: e.target.checked });
  });

  toggleIntercept.addEventListener("change", async (e) => {
    await chrome.storage.local.set({ interceptDownloads: e.target.checked });
  });

  selectTargetMode.addEventListener("change", async (e) => {
    await chrome.storage.local.set({ targetMode: e.target.value });
    refreshStatus();
  });

  // 10. Options Link
  optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
