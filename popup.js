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
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const themeIconSun = document.getElementById("themeIconSun");
  const themeIconMoon = document.getElementById("themeIconMoon");
  const optionsLink = document.getElementById("optionsLink");
  const currentDomainLabel = document.getElementById("currentDomainLabel");
  const toggleSiteBlacklistBtn = document.getElementById("toggleSiteBlacklistBtn");
  const siteBlacklistRow = document.getElementById("siteBlacklistRow");

  // Nav Tabs, Batch & History Elements
  const tabGrabberBtn = document.getElementById("tabGrabberBtn");
  const tabBatchBtn = document.getElementById("tabBatchBtn");
  const tabHistoryBtn = document.getElementById("tabHistoryBtn");
  const panelGrabber = document.getElementById("panelGrabber");
  const panelBatch = document.getElementById("panelBatch");
  const panelHistory = document.getElementById("panelHistory");
  const historyCountBadge = document.getElementById("historyCountBadge");
  const historyFilterPills = document.getElementById("historyFilterPills");
  const historyListContainer = document.getElementById("historyListContainer");
  const batchCountBadge = document.getElementById("batchCountBadge");
  const batchCollectPageBtn = document.getElementById("batchCollectPageBtn");
  const batchSummaryCount = document.getElementById("batchSummaryCount");
  const startBatchSnifferPopupBtn = document.getElementById("startBatchSnifferPopupBtn");
  const sendAllBatchBtn = document.getElementById("sendAllBatchBtn");
  const sendAllBatchBtnText = document.getElementById("sendAllBatchBtnText");
  const clearAllBatchBtn = document.getElementById("clearAllBatchBtn");
  const batchListContainer = document.getElementById("batchListContainer");

  let currentTab = null;
  let currentDomain = "";
  let detectedMediaItems = [];
  let desktopStatus = { online: false, port: 42421 };
  let activeMainTab = "grabber";
  let activeHistoryFilter = "all";
  let historyPollInterval = null;

  // 1. Theme Management (Instant Apply & Persist)
  const savedSettings = await chrome.storage.local.get({
    theme: "dark",
    targetMode: "auto",
    interceptDownloads: false,
    showFloatingPill: true,
    blacklistedDomains: ["netflix.com", "disneyplus.com", "primevideo.com", "hulu.com", "max.com"]
  });

  let blacklistedDomains = Array.isArray(savedSettings.blacklistedDomains) ? savedSettings.blacklistedDomains : [];

  let activeTheme = savedSettings.theme === "light" ? "light" : "dark";

  function applyTheme(th) {
    activeTheme = th;
    document.documentElement.setAttribute("data-theme", th);
    if (themeIconSun && themeIconMoon) {
      if (th === "light") {
        themeIconSun.style.display = "block";
        themeIconMoon.style.display = "none";
        themeToggleBtn.setAttribute("title", "Switch to Dark Mode");
      } else {
        themeIconSun.style.display = "none";
        themeIconMoon.style.display = "block";
        themeToggleBtn.setAttribute("title", "Switch to Light Mode");
      }
    }
  }

  applyTheme(activeTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", async () => {
      const next = activeTheme === "light" ? "dark" : "light";
      applyTheme(next);
      await chrome.storage.local.set({ theme: next });
    });
  }

  // 2. Preferences Init
  toggleFloatingPill.checked = savedSettings.showFloatingPill;
  toggleIntercept.checked = savedSettings.interceptDownloads;
  selectTargetMode.value = savedSettings.targetMode;

  function isDomainBlacklisted(domain) {
    if (!domain) return false;
    const clean = domain.toLowerCase();
    return blacklistedDomains.some((d) => {
      const dClean = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      return dClean && (clean === dClean || clean.endsWith("." + dClean));
    });
  }

  function updateBlacklistButtonUI() {
    if (!currentDomain || currentDomain === "--") {
      if (siteBlacklistRow) siteBlacklistRow.style.display = "none";
      return;
    }
    if (siteBlacklistRow) siteBlacklistRow.style.display = "flex";
    if (currentDomainLabel) currentDomainLabel.textContent = currentDomain;

    const isBlocked = isDomainBlacklisted(currentDomain);
    if (toggleSiteBlacklistBtn) {
      if (isBlocked) {
        toggleSiteBlacklistBtn.textContent = "✓ Blacklisted (Unblock)";
        toggleSiteBlacklistBtn.style.color = "var(--text-muted)";
        toggleSiteBlacklistBtn.style.borderColor = "var(--border)";
      } else {
        toggleSiteBlacklistBtn.textContent = "+ Blacklist Site";
        toggleSiteBlacklistBtn.style.color = "var(--accent)";
        toggleSiteBlacklistBtn.style.borderColor = "var(--border-hover)";
      }
    }

    // Set buttons to inactive / disabled state if domain is blacklisted
    if (isBlocked) {
      if (downloadTabBtn) {
        downloadTabBtn.disabled = true;
        downloadTabBtn.classList.add("btn-disabled");
        downloadTabBtn.classList.remove("is-playing");
        downloadTabBtn.title = "Site is blacklisted. Unblock below to send link.";
      }
      if (downloadBtnText) {
        downloadBtnText.textContent = "Site Blacklisted";
      }
      if (sniffPageBtn) {
        sniffPageBtn.disabled = true;
        sniffPageBtn.classList.add("btn-disabled");
        sniffPageBtn.title = "Site is blacklisted. Unblock below to sniff.";
      }
      if (batchCollectPageBtn) {
        batchCollectPageBtn.disabled = true;
        batchCollectPageBtn.classList.add("btn-disabled");
        batchCollectPageBtn.title = "Site is blacklisted. Unblock below to collect.";
      }
    } else {
      if (downloadTabBtn) {
        downloadTabBtn.disabled = false;
        downloadTabBtn.classList.remove("btn-disabled");
      }
      if (sniffPageBtn) {
        sniffPageBtn.disabled = false;
        sniffPageBtn.classList.remove("btn-disabled");
        sniffPageBtn.title = "Hover and click any video or download link on the page";
      }
      if (batchCollectPageBtn) {
        batchCollectPageBtn.disabled = false;
        batchCollectPageBtn.classList.remove("btn-disabled");
        batchCollectPageBtn.title = "Activate Batch Link Collector mode: click multiple videos or links on page to collect them";
      }
      updateDownloadTabBtn(detectedMediaItems);
    }
  }

  if (toggleSiteBlacklistBtn) {
    toggleSiteBlacklistBtn.addEventListener("click", async () => {
      if (!currentDomain || currentDomain === "--") return;
      const isBlocked = isDomainBlacklisted(currentDomain);
      if (isBlocked) {
        blacklistedDomains = blacklistedDomains.filter((d) => {
          const dClean = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
          return dClean !== currentDomain && !currentDomain.endsWith("." + dClean);
        });
      } else {
        blacklistedDomains.push(currentDomain);
      }
      await chrome.storage.local.set({ blacklistedDomains });
      updateBlacklistButtonUI();
    });
  }

  // 3. Query Active Tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      currentTab = tab;
      try {
        const parsed = new URL(tab.url);
        currentDomain = parsed.hostname.toLowerCase();
        activeTabUrlEl.textContent = `${parsed.hostname}${parsed.pathname}`;
      } catch {
        currentDomain = "";
        activeTabUrlEl.textContent = tab.url;
      }

      updateBlacklistButtonUI();

      // Query content script for all detected media on this tab
      loadDetectedMedia(tab.id);
    } else {
      activeTabUrlEl.textContent = "No accessible page";
      downloadTabBtn.disabled = true;
      sniffPageBtn.disabled = true;
      if (siteBlacklistRow) siteBlacklistRow.style.display = "none";
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
          desktopStatus = { online: false, port: 42421 };
          statusDot.className = "status-dot";
          statusText.textContent = "Desktop Offline";
          statusSub.textContent = "Ready via Protocol / Native";
        } else {
          desktopStatus = res;
          statusDot.className = "status-dot online";
          statusText.textContent = res.app || "Devizee Desktop";
          statusSub.textContent = `Online (Port ${res.port})`;
        }
        if (activeMainTab === "history") {
          loadHistory();
        }
      });
    } catch {
      desktopStatus = { online: false, port: 42421 };
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

  function isVideoWatchUrl(urlStr) {
    if (!urlStr) return false;
    try {
      const url = new URL(urlStr);
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

  function updateDownloadTabBtn(items) {
    if (isDomainBlacklisted(currentDomain)) {
      if (downloadTabBtn) {
        downloadTabBtn.disabled = true;
        downloadTabBtn.classList.add("btn-disabled");
        downloadTabBtn.classList.remove("is-playing");
      }
      if (downloadBtnText) downloadBtnText.textContent = "Site Blacklisted";
      return;
    }

    const playingItem = items.find((m) => m.isPlaying);
    const hasMedia = items.length > 0;
    const isWatch = currentTab?.url && isVideoWatchUrl(currentTab.url);

    if (playingItem) {
      downloadTabBtn.disabled = false;
      downloadTabBtn.classList.add("is-playing");
      downloadBtnText.textContent = "▶ Send Playing Video";
      downloadTabBtn.title = `Send active playing video (${playingItem.title}) to Devizee Desktop`;
    } else if (hasMedia) {
      downloadTabBtn.disabled = false;
      downloadTabBtn.classList.remove("is-playing");
      downloadBtnText.textContent = items.length === 1 ? "Send Detected Video" : `Send Video (${items.length} detected)`;
      downloadTabBtn.title = "Send detected video on page to Devizee Desktop";
    } else if (isWatch) {
      downloadTabBtn.disabled = false;
      downloadTabBtn.classList.remove("is-playing");
      downloadBtnText.textContent = "Send Stream to Devizee";
      downloadTabBtn.title = "Send video page stream to Devizee Desktop";
    } else {
      downloadTabBtn.disabled = false;
      downloadTabBtn.classList.remove("is-playing");
      downloadBtnText.textContent = "Send Link to Devizee";
      downloadTabBtn.title = "Send current webpage link to Devizee Desktop";
    }
  }

  function renderMediaItems(rawItems) {
    // Deduplicate by URL or title
    const items = [];
    const seen = new Set();
    for (const item of (rawItems || [])) {
      const key = (item.url || item.title || "").trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
    }

    updateDownloadTabBtn(items);

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

      let typeLabel = "VIDEO";
      if (item.type === "audio") typeLabel = "AUDIO";
      else if (item.type === "file") typeLabel = "FILE";

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
          if (!res || !res.success) {
            dlBtn.textContent = "App Closed";
            dlBtn.style.color = "#ef4444";
            setTimeout(() => {
              dlBtn.textContent = "Download";
              dlBtn.style.color = "";
            }, 3000);
            return;
          }
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
    if (downloadTabBtn.disabled || !currentTab || !currentTab.url) return;

    // Pick currently playing media if any, else first detected media, else tab URL
    const playing = detectedMediaItems.find((m) => m.isPlaying);
    const targetUrl = playing ? playing.url : (detectedMediaItems[0]?.url || currentTab.url);

    downloadBtnText.textContent = "Relaying...";
    downloadTabBtn.style.opacity = "0.85";

    chrome.runtime.sendMessage({ action: "downloadUrl", url: targetUrl }, (res) => {
      if (!res || !res.success) {
        downloadTabBtn.classList.remove("success");
        downloadBtnText.textContent = "Devizee App is Closed";
        downloadTabBtn.style.opacity = "1";
        setTimeout(() => {
          updateDownloadTabBtn(detectedMediaItems);
        }, 3000);
        return;
      }

      downloadTabBtn.classList.add("success");
      downloadBtnText.textContent = "✓ Sent to Devizee!";

      setTimeout(() => {
        downloadTabBtn.classList.remove("success");
        updateDownloadTabBtn(detectedMediaItems);
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

  // ─── 11. Tab Switching (Grabber <-> Batch <-> History) ───
  function switchTab(tabName) {
    activeMainTab = tabName;
    if (tabGrabberBtn) tabGrabberBtn.classList.toggle("active", tabName === "grabber");
    if (tabBatchBtn) tabBatchBtn.classList.toggle("active", tabName === "batch");
    if (tabHistoryBtn) tabHistoryBtn.classList.toggle("active", tabName === "history");

    if (panelGrabber) panelGrabber.style.display = tabName === "grabber" ? "block" : "none";
    if (panelBatch) panelBatch.style.display = tabName === "batch" ? "block" : "none";
    if (panelHistory) panelHistory.style.display = tabName === "history" ? "block" : "none";

    if (tabName === "history") {
      loadHistory();
      if (!historyPollInterval) {
        historyPollInterval = setInterval(loadHistory, 2000);
      }
    } else {
      if (historyPollInterval) {
        clearInterval(historyPollInterval);
        historyPollInterval = null;
      }
    }

    if (tabName === "batch") {
      loadBatchLinks();
    }
  }

  if (tabGrabberBtn) tabGrabberBtn.addEventListener("click", () => switchTab("grabber"));
  if (tabBatchBtn) tabBatchBtn.addEventListener("click", () => switchTab("batch"));
  if (tabHistoryBtn) tabHistoryBtn.addEventListener("click", () => switchTab("history"));

  // ─── 12. Download History & Active Downloads Engine ───
  function formatBytes(bytes) {
    if (!bytes || bytes <= 0 || isNaN(bytes)) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${val.toFixed(val >= 10 ? 1 : 2)} ${units[i]}`;
  }

  function getCategory(item) {
    const fmt = (item.format || "").toLowerCase();
    const title = (item.title || item.filename || "").toLowerCase();
    const ext = title.split(".").pop() || "";

    const videoExts = ["mp4", "mkv", "webm", "avi", "mov", "flv", "ts", "m4v", "wmv"];
    const audioExts = ["mp3", "m4a", "flac", "wav", "opus", "aac", "ogg", "wma"];
    const docExts = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip", "rar", "7z", "tar", "gz"];

    if (videoExts.includes(ext) || fmt.includes("video") || fmt.includes("1080") || fmt.includes("720") || fmt.includes("4k") || fmt.includes("2k") || fmt.includes("480")) {
      return "video";
    }
    if (audioExts.includes(ext) || fmt.includes("audio") || fmt.includes("mp3") || fmt.includes("m4a") || fmt.includes("flac") || fmt.includes("wav")) {
      return "audio";
    }
    if (docExts.includes(ext) || ext === "pdf") {
      return "documents";
    }
    return "other";
  }

  async function loadHistory() {
    if (!desktopStatus?.online) {
      try {
        const st = await new Promise((res) => chrome.runtime.sendMessage({ action: "getStatus" }, res));
        if (st && st.online) {
          desktopStatus = st;
        }
      } catch { }
    }

    let desktopRecords = [];
    if (desktopStatus?.online && desktopStatus?.port) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`http://127.0.0.1:${desktopStatus.port}/history`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          desktopRecords = await res.json().catch(() => []);
        }
      } catch { }
    }

    let chromeDownloads = [];
    try {
      chromeDownloads = await new Promise((resolve) => {
        chrome.downloads.search({ limit: 40, orderBy: ["-startTime"] }, (items) => {
          if (chrome.runtime.lastError || !items) resolve([]);
          else resolve(items);
        });
      });
    } catch { }

    const merged = [];
    const seenUrls = new Set();

    // 1. Process desktop records
    for (const rec of desktopRecords) {
      if (rec.url) seenUrls.add(rec.url);
      merged.push({
        id: rec.id,
        source: "desktop",
        title: rec.title || "Untitled Download",
        url: rec.url,
        filePath: rec.file_path,
        status: rec.status,
        percent: rec.percent || 0,
        format: rec.format || "MEDIA",
        dateAdded: rec.date_added ? new Date(rec.date_added * 1000) : new Date(),
        fileSize: rec.file_size || null,
        category: getCategory({ format: rec.format, title: rec.title })
      });
    }

    // 2. Process chrome downloads (if not already listed)
    for (const cd of chromeDownloads) {
      if (cd.url && seenUrls.has(cd.url)) continue;
      const fileName = cd.filename ? cd.filename.replace(/^.*[\\\/]/, "") : "Download";
      let status = "completed";
      if (cd.state === "in_progress") {
        status = cd.paused ? "interrupted" : "downloading";
      } else if (cd.state === "interrupted") {
        status = "error";
      }

      const total = cd.totalBytes > 0 ? cd.totalBytes : cd.fileSize;
      const pct = total > 0 && cd.bytesReceived ? Math.min(100, Math.round((cd.bytesReceived / total) * 100)) : (status === "completed" ? 100 : 0);

      merged.push({
        id: cd.id,
        chromeId: cd.id,
        source: "chrome",
        title: fileName,
        url: cd.finalUrl || cd.url,
        filePath: cd.filename,
        status,
        percent: pct,
        format: fileName.split(".").pop()?.toUpperCase() || "FILE",
        dateAdded: cd.startTime ? new Date(cd.startTime) : new Date(),
        bytesReceived: cd.bytesReceived,
        fileSize: total,
        estimatedEndTime: cd.estimatedEndTime,
        category: getCategory({ format: "", title: fileName })
      });
    }

    // Sort all records by date added descending (newest first)
    merged.sort((a, b) => new Date(b.dateAdded || 0).getTime() - new Date(a.dateAdded || 0).getTime());

    // Update history badge count
    const activeDlCount = merged.filter((m) => m.status === "downloading" || m.status === "starting" || m.status === "muxing").length;
    if (historyCountBadge) {
      if (activeDlCount > 0) {
        historyCountBadge.style.display = "inline-block";
        historyCountBadge.textContent = String(activeDlCount);
      } else {
        historyCountBadge.style.display = "none";
      }
    }

    renderHistoryUI(merged);
  }

  function renderHistoryUI(allItems) {
    if (!historyListContainer) return;

    let items = allItems;
    if (activeHistoryFilter !== "all") {
      items = allItems.filter((it) => it.category === activeHistoryFilter);
    }

    if (items.length === 0) {
      historyListContainer.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 30px 10px;">
          No downloads found in ${activeHistoryFilter === "all" ? "history" : activeHistoryFilter}.
        </div>
      `;
      return;
    }

    historyListContainer.innerHTML = "";

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "history-card";

      const isDownloading = item.status === "downloading" || item.status === "muxing" || item.status === "starting";
      const isPaused = item.status === "interrupted";
      const isCompleted = item.status === "completed";
      const isFailed = item.status === "error";

      let statusBadge = "";
      if (isDownloading) {
        statusBadge = `<span class="history-status-badge downloading">${Math.round(item.percent)}%</span>`;
      } else if (isPaused) {
        // CLEAN NEUTRAL BADGE - NEVER AMBER ALERT!
        statusBadge = `<span class="history-status-badge paused">Paused · ${Math.round(item.percent)}%</span>`;
      } else if (isCompleted) {
        statusBadge = `<span class="history-status-badge completed">Completed</span>`;
      } else if (isFailed) {
        statusBadge = `<span class="history-status-badge" style="color:var(--text-muted); border-color:rgba(239,68,68,0.3);">Failed</span>`;
      }

      // Action buttons: Show in Folder, Open File
      let actionButtons = "";
      if (isCompleted && item.filePath) {
        actionButtons = `
          <div class="history-actions">
            <button type="button" class="btn-history-action btn-show-folder" title="Show in Folder" data-path="${escapeHtml(item.filePath)}" data-chrome-id="${item.chromeId || ''}">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:11px;height:11px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              <span>Folder</span>
            </button>
            <button type="button" class="btn-history-action btn-open-file" title="Open in default app" data-path="${escapeHtml(item.filePath)}" data-chrome-id="${item.chromeId || ''}">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:11px;height:11px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Open</span>
            </button>
          </div>
        `;
      }

      // Progress bar for active or paused items
      let progressBlock = "";
      if (isDownloading || isPaused) {
        const barClass = isPaused ? "history-progress-bar paused" : "history-progress-bar";
        const bytesText = item.fileSize ? `${formatBytes(item.bytesReceived || (item.fileSize * item.percent / 100))} / ${formatBytes(item.fileSize)}` : "";
        let etaText = "";
        if (item.estimatedEndTime) {
          const diffMs = new Date(item.estimatedEndTime).getTime() - Date.now();
          if (diffMs > 0) {
            const sec = Math.round(diffMs / 1000);
            etaText = `${sec}s left`;
          }
        }

        progressBlock = `
          <div class="history-progress-wrap">
            <div class="${barClass}" style="width: ${Math.max(3, Math.min(100, item.percent))}%;"></div>
          </div>
          <div class="history-stats-row">
            <span>${bytesText || `${Math.round(item.percent)}% done`}</span>
            <span>${isPaused ? "Paused" : (etaText || "Downloading...")}</span>
          </div>
        `;
      }

      const sizeStr = item.fileSize ? formatBytes(item.fileSize) : "";
      const timeStr = formatRelativeTime(item.dateAdded);

      card.innerHTML = `
        <div class="history-top-row">
          <div class="history-title-wrap">
            <div class="history-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <div class="history-subtitle">
              <span class="history-format-badge">${escapeHtml(item.format || "MEDIA")}</span>
              ${sizeStr ? `<span>${sizeStr}</span>` : ""}
              ${timeStr ? `<span style="color:var(--text-muted); opacity:0.8;">• ${timeStr}</span>` : ""}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${statusBadge}
            ${actionButtons}
          </div>
        </div>
        ${progressBlock}
      `;

      // Event handlers
      const btnFolder = card.querySelector(".btn-show-folder");
      if (btnFolder) {
        btnFolder.addEventListener("click", async (e) => {
          e.stopPropagation();
          const p = btnFolder.getAttribute("data-path");
          const cid = btnFolder.getAttribute("data-chrome-id");
          if (cid && !p) {
            chrome.downloads.show(parseInt(cid, 10));
          } else if (desktopStatus?.online && desktopStatus?.port && p) {
            fetch(`http://127.0.0.1:${desktopStatus.port}/open-folder`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: p })
            }).catch(() => {});
          } else if (cid) {
            chrome.downloads.show(parseInt(cid, 10));
          }
        });
      }

      const btnOpen = card.querySelector(".btn-open-file");
      if (btnOpen) {
        btnOpen.addEventListener("click", async (e) => {
          e.stopPropagation();
          const p = btnOpen.getAttribute("data-path");
          const cid = btnOpen.getAttribute("data-chrome-id");
          if (cid && !p) {
            chrome.downloads.open(parseInt(cid, 10));
          } else if (desktopStatus?.online && desktopStatus?.port && p) {
            fetch(`http://127.0.0.1:${desktopStatus.port}/open-file`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path: p })
            }).catch(() => {});
          } else if (cid) {
            chrome.downloads.open(parseInt(cid, 10));
          }
        });
      }

      historyListContainer.appendChild(card);
    });
  }

  // Filter Pills Handler
  if (historyFilterPills) {
    historyFilterPills.querySelectorAll(".filter-pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        historyFilterPills.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        activeHistoryFilter = pill.getAttribute("data-filter") || "all";
        loadHistory();
      });
    });
  }

  // Options Link
  if (optionsLink) {
    optionsLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }

  // ─── 13. Batch Link Collector Engine ───
  async function updateBatchBadges() {
    const res = await chrome.storage.local.get({ batchCollectedLinks: [] });
    const links = Array.isArray(res.batchCollectedLinks) ? res.batchCollectedLinks : [];
    const count = links.length;

    if (batchCountBadge) {
      if (count > 0) {
        batchCountBadge.style.display = "inline-block";
        batchCountBadge.textContent = String(count);
      } else {
        batchCountBadge.style.display = "none";
      }
    }
    if (batchSummaryCount) {
      batchSummaryCount.textContent = `${count} link${count === 1 ? "" : "s"}`;
    }
    if (sendAllBatchBtn) {
      sendAllBatchBtn.disabled = count === 0;
      if (count === 0) {
        sendAllBatchBtn.classList.add("btn-disabled");
      } else {
        sendAllBatchBtn.classList.remove("btn-disabled");
      }
    }
    if (sendAllBatchBtnText) {
      sendAllBatchBtnText.textContent = count > 0 ? `Send All (${count})` : "Send All to Devizee";
    }
    return links;
  }

  async function loadBatchLinks() {
    const links = await updateBatchBadges();
    if (!batchListContainer) return;

    if (links.length === 0) {
      batchListContainer.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 32px 16px; line-height: 1.5;">
          <div style="font-size: 24px; margin-bottom: 8px;">🎯</div>
          <div style="font-weight: 600; color: var(--text); margin-bottom: 4px;">No batch links collected yet</div>
          <div>Click "Pick on Page" above or the radar icon on any webpage to click and collect multiple videos or links.</div>
        </div>
      `;
      return;
    }

    batchListContainer.innerHTML = "";

    links.forEach((item, index) => {
      let hostname = "";
      try {
        hostname = new URL(item.url).hostname.replace(/^www\./, "");
      } catch {
        hostname = "link";
      }

      const card = document.createElement("div");
      card.className = "batch-card";
      card.innerHTML = `
        <div class="batch-top-row">
          <div class="batch-title-wrap">
            <div class="batch-title" title="${escapeHtml(item.title || item.url)}">${escapeHtml(item.title || item.url)}</div>
            <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
              <span class="batch-host-badge">${escapeHtml(hostname)}</span>
              <span style="font-size: 9px; color: var(--text-muted); font-family: monospace;">#${index + 1}</span>
            </div>
            <div class="batch-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</div>
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <button type="button" class="btn-batch-copy" title="Copy URL">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:11px;height:11px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
            <button type="button" class="btn-batch-remove" title="Remove link from batch">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:11px;height:11px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      `;

      const copyBtn = card.querySelector(".btn-batch-copy");
      if (copyBtn) {
        copyBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(item.url);
            const span = copyBtn.querySelector("span");
            if (span) span.textContent = "Copied!";
            setTimeout(() => {
              if (span) span.textContent = "Copy";
            }, 1200);
          } catch { }
        });
      }

      const removeBtn = card.querySelector(".btn-batch-remove");
      if (removeBtn) {
        removeBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const current = await chrome.storage.local.get({ batchCollectedLinks: [] });
          const updated = (current.batchCollectedLinks || []).filter((_, i) => i !== index);
          await chrome.storage.local.set({ batchCollectedLinks: updated });
          loadBatchLinks();
        });
      }

      batchListContainer.appendChild(card);
    });
  }

  // Batch collection triggers
  if (batchCollectPageBtn) {
    batchCollectPageBtn.addEventListener("click", async () => {
      chrome.runtime.sendMessage({ action: "triggerBatchCollectorOnTab" }, () => {
        window.close();
      });
    });
  }

  if (startBatchSnifferPopupBtn) {
    startBatchSnifferPopupBtn.addEventListener("click", async () => {
      chrome.runtime.sendMessage({ action: "triggerBatchCollectorOnTab" }, () => {
        window.close();
      });
    });
  }

  if (clearAllBatchBtn) {
    clearAllBatchBtn.addEventListener("click", async () => {
      await chrome.storage.local.set({ batchCollectedLinks: [] });
      loadBatchLinks();
    });
  }

  if (sendAllBatchBtn) {
    sendAllBatchBtn.addEventListener("click", async () => {
      const res = await chrome.storage.local.get({ batchCollectedLinks: [] });
      const links = Array.isArray(res.batchCollectedLinks) ? res.batchCollectedLinks : [];
      if (links.length === 0) return;

      const urls = links.map((x) => x.url).filter(Boolean);
      if (sendAllBatchBtnText) sendAllBatchBtnText.textContent = "Sending...";
      sendAllBatchBtn.disabled = true;

      chrome.runtime.sendMessage({ action: "downloadBatchUrls", urls }, async (resp) => {
        if (!resp || !resp.success) {
          sendAllBatchBtn.disabled = false;
          if (sendAllBatchBtnText) sendAllBatchBtnText.textContent = "Devizee App is Closed!";
          sendAllBatchBtn.style.background = "#ef4444";
          setTimeout(() => {
            sendAllBatchBtn.style.background = "";
            updateBatchBadges();
          }, 3500);
          return;
        }

        await chrome.storage.local.set({ batchCollectedLinks: [] });
        if (sendAllBatchBtnText) sendAllBatchBtnText.textContent = "Sent to Devizee!";
        setTimeout(() => {
          loadBatchLinks();
        }, 600);
      });
    });
  }

  // Sync batch updates in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.batchCollectedLinks) {
      updateBatchBadges();
      if (activeMainTab === "batch") {
        loadBatchLinks();
      }
    }
  });

  // Init batch badge count
  updateBatchBadges();

  function formatRelativeTime(date) {
    if (!date) return "";
    try {
      const d = new Date(date);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return "Just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
      return d.toLocaleDateString();
    } catch {
      return "";
    }
  }

  function canonicalizeMediaUrl(urlStr) {
    if (!urlStr) return "";
    try {
      const clean = urlStr.trim();
      const url = new URL(clean);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
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
      return `${url.protocol}//${host}${url.pathname.replace(/\/+$/, "") || "/"}`;
    } catch {
      return urlStr.trim().replace(/\/+$/, "");
    }
  }

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
