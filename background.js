/**
 * Devizee - Privacy-Focused Download Manager
 * Background Service Worker (Manifest V3)
 *
 * Supports Devizee Lite (Port 42421) and Devizee Pro (Port 42422).
 * Privacy-First: Zero external network requests, zero telemetry.
 * All traffic stays strictly on local loopback (127.0.0.1) and native pipes.
 */

const LITE_PORT = 42421;
const PRO_PORT = 42422;
const NATIVE_HOST_NAME = "com.devizee.native_host";

const SUPPORTED_STREAM_DOMAINS = [
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

const DEFAULT_SETTINGS = {
  targetMode: "auto",        // "auto" | "lite" | "pro"
  interceptDownloads: false, // Default OFF for privacy
  paused: false,             // Master pause
  showFloatingPill: true,    // On-page video grabber button
  minFileSizeMB: 10,         // Minimum file size threshold for interception
  theme: "dark",             // "dark" | "light"
  excludedDomains: ["localhost", "127.0.0.1"]
};

// ─── Lifecycle & Context Menus ───

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const updated = { ...DEFAULT_SETTINGS, ...current };
  await chrome.storage.local.set(updated);

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "devizee-download-media",
      title: "Download with Devizee",
      contexts: ["page", "link", "video", "audio"]
    });
    chrome.contextMenus.create({
      id: "devizee-inspect-page",
      title: "Devizee Media & Link Sniffer",
      contexts: ["page"]
    });
  });

  updateBadgeForActiveTab();
});

// Update badge when tab changes or updates
chrome.tabs.onActivated.addListener(updateBadgeForActiveTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    updateBadgeForTab(tab);
  }
});

async function updateBadgeForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) updateBadgeForTab(tab);
}

async function updateBadgeForTab(tab) {
  if (!tab || !tab.url) return;
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

  if (settings.paused) {
    chrome.action.setBadgeText({ text: "OFF", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#64748b", tabId: tab.id });
    return;
  }

  if (isVideoWatchUrl(tab.url)) {
    chrome.action.setBadgeText({ text: "GET", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#6366f1", tabId: tab.id });
  } else {
    chrome.action.setBadgeText({ text: "", tabId: tab.id });
  }
}

function isVideoWatchUrl(urlStr) {
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

// ─── Context Menu Handler ───

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "devizee-download-media") {
    const targetUrl = info.linkUrl || info.srcUrl || info.pageUrl || tab?.url;
    if (!targetUrl) return;

    const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
    if (settings.paused) return;

    await relayUrlToDevizee(targetUrl);
  } else if (info.menuItemId === "devizee-inspect-page" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: "startPickerMode" }).catch(() => {});
  }
});

// Keyboard Shortcut Command (Alt+Shift+S)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-sniffer") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: "startPickerMode" }).catch(() => {});
    }
  }
});

// ─── Core Relay Engine (HTTP -> Native Messaging -> Deep Link) ───

/**
 * Checks which Devizee desktop app is currently running.
 * @returns {Promise<{ online: boolean, app?: string, port?: number }>}
 */
async function checkDesktopStatus() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const mode = settings.targetMode || "auto";

  const tryPort = async (port, expectedName) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);
      const res = await fetch(`http://127.0.0.1:${port}/status`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          online: true,
          port,
          app: data.app || expectedName,
          version: data.version || "0.5.0"
        };
      }
    } catch {
      // Port not responding
    }
    return null;
  };

  if (mode === "lite") {
    const lite = await tryPort(LITE_PORT, "Devizee Lite");
    return lite || { online: false };
  }

  if (mode === "pro") {
    const pro = await tryPort(PRO_PORT, "Devizee Pro");
    return pro || { online: false };
  }

  // Auto-detection mode: test Lite and Pro concurrently
  const [liteRes, proRes] = await Promise.all([
    tryPort(LITE_PORT, "Devizee Lite"),
    tryPort(PRO_PORT, "Devizee Pro")
  ]);

  if (proRes) return proRes;
  if (liteRes) return liteRes;
  return { online: false };
}

/**
 * Sends a URL to Devizee using the best available transport.
 */
async function relayUrlToDevizee(urlStr) {
  if (!urlStr || (!urlStr.startsWith("http://") && !urlStr.startsWith("https://"))) {
    return { success: false, error: "invalid_url", message: "Invalid HTTP/HTTPS URL" };
  }

  // 1. Try Local HTTP Bridge first
  const status = await checkDesktopStatus();
  if (status.online && status.port) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`http://127.0.0.1:${status.port}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlStr }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        return { success: true, transport: "http", app: status.app };
      }
    } catch (e) {
      console.warn("[Devizee] HTTP relay failed, falling back to Native Host:", e);
    }
  }

  // 2. Try Native Messaging Host
  const nativeResult = await new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { action: "download", url: urlStr },
        (res) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve({ success: true, transport: "native_host", res });
          }
        }
      );
    } catch (e) {
      resolve({ success: false, error: String(e) });
    }
  });

  if (nativeResult.success) {
    return nativeResult;
  }

  // 3. Fallback to Deep Link Protocol (devizee:// and streamgrab://)
  fallbackToProtocolHandler(urlStr);
  return {
    success: false,
    error: "app_closed",
    message: "Devizee Desktop is not running. Please open Devizee Lite or Devizee Pro to start downloads.",
    transport: "protocol_handler"
  };
}

/**
 * Sends a list of URLs to Devizee desktop app in batch.
 */
async function relayBatchUrlsToDevizee(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { success: false, error: "no_urls", message: "No URLs provided" };
  }

  const validUrls = urls.filter((u) => typeof u === "string" && (u.startsWith("http://") || u.startsWith("https://")));
  if (validUrls.length === 0) {
    return { success: false, error: "invalid_urls", message: "No valid HTTP/HTTPS URLs" };
  }

  // Check desktop status
  const status = await checkDesktopStatus();
  if (!status.online || !status.port) {
    return {
      success: false,
      error: "app_closed",
      message: "Devizee Desktop is not running. Please open Devizee Lite or Devizee Pro to receive downloads."
    };
  }

  // Send to Local HTTP Bridge (/batch-download)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`http://127.0.0.1:${status.port}/batch-download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: validUrls }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: true, transport: "http", app: status.app, count: data.count || validUrls.length };
    } else {
      return {
        success: false,
        error: "http_error",
        message: `Devizee returned error: HTTP ${res.status}`
      };
    }
  } catch (e) {
    console.warn("[Devizee] Batch HTTP relay failed:", e);
    return {
      success: false,
      error: "app_closed",
      message: "Connection to Devizee Desktop failed. Please ensure Devizee is running."
    };
  }
}

function fallbackToProtocolHandler(urlStr) {
  const deepLink = `devizee://download?url=${encodeURIComponent(urlStr)}`;
  chrome.tabs.create({ url: deepLink, active: false }, (tab) => {
    setTimeout(() => {
      if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
    }, 1200);
  });
}

// ─── Passive Download Interception (Optional, User-Gated) ───

function formatBytes(bytes) {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(val >= 10 ? 0 : 1)} ${units[i]}`;
}

function notifyUser({ title, message, isError = false }) {
  // 1. Chrome System / OS Notification
  try {
    if (chrome.notifications) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: title || "Devizee",
        message: message || "",
        priority: 1
      }, () => {
        if (chrome.runtime.lastError) {
          // Ignore
        }
      });
    }
  } catch { }

  // 2. Active Tab In-Page Toast
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "showToast",
        message: `${title}: ${message}`,
        isError,
        duration: 4500
      }).catch(() => {});
    }
  });
}

chrome.downloads.onDeterminingFilename.addListener((downloadItem) => {
  handleDownloadInterception(downloadItem);
  return false;
});

async function handleDownloadInterception(downloadItem) {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

  if (!settings.interceptDownloads || settings.paused) {
    return;
  }

  const urlStr = downloadItem.finalUrl || downloadItem.url;
  if (!urlStr || urlStr.startsWith("blob:") || urlStr.startsWith("data:")) {
    return;
  }

  try {
    const url = new URL(urlStr);
    if (settings.excludedDomains.some((d) => url.hostname === d || url.hostname.endsWith("." + d))) {
      return;
    }

    const minBytes = (settings.minFileSizeMB || 10) * 1024 * 1024;
    if (downloadItem.fileSize > 0 && downloadItem.fileSize < minBytes) {
      return;
    }

    const fileName = downloadItem.filename ? downloadItem.filename.replace(/^.*[\\\/]/, "") : "File";
    const sizeStr = downloadItem.fileSize > 0 ? ` (${formatBytes(downloadItem.fileSize)})` : "";

    // 1. CHECK IF DEVIZEE DESKTOP IS RUNNING BEFORE CANCELLING BROWSER DOWNLOAD!
    const status = await checkDesktopStatus();

    if (!status.online) {
      // Devizee is closed: DO NOT CANCEL browser download!
      // Let browser download automatically as fallback, and inform user!
      console.log("[Devizee] Desktop app closed. Allowing browser to download:", fileName);
      notifyUser({
        title: "Devizee Desktop is Closed",
        message: `${fileName}${sizeStr} downloaded with browser automatically. Open Devizee Lite or Pro to intercept.`,
        isError: true
      });
      return;
    }

    // 2. Devizee is running: Cancel browser download and hand off to desktop app
    chrome.downloads.cancel(downloadItem.id, () => {
      if (chrome.runtime.lastError) {
        console.warn("[Devizee] Cancel download error:", chrome.runtime.lastError.message);
      }
    });

    setTimeout(() => {
      chrome.downloads.erase({ id: downloadItem.id }).catch(() => {});
    }, 1000);

    const relayResult = await relayUrlToDevizee(urlStr);

    if (relayResult && relayResult.success) {
      notifyUser({
        title: "Sent to Devizee Desktop",
        message: `${fileName}${sizeStr} transferred to ${relayResult.app || "Devizee Lite"}`,
        isError: false
      });
    } else {
      // Fallback safeguard: if relay failed unexpectedly, restart download in browser so file is NEVER lost
      chrome.downloads.download({ url: urlStr }).catch(() => {});
      notifyUser({
        title: "Devizee Relay Failed",
        message: `${fileName} restarted with browser automatically.`,
        isError: true
      });
    }
  } catch (err) {
    console.error("[Devizee] Interception error:", err);
  }
}

// ─── Extension Message Router ───

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getStatus") {
    checkDesktopStatus().then(sendResponse);
    return true;
  }

  if (request.action === "downloadUrl" || request.action === "sendTabToDevizee") {
    const targetUrl = request.url || sender.tab?.url;
    if (targetUrl) {
      relayUrlToDevizee(targetUrl).then(sendResponse);
    } else {
      sendResponse({ success: false, error: "No URL provided" });
    }
    return true;
  }

  if ((request.action === "downloadBatchUrls" || request.action === "downloadBatch") && Array.isArray(request.urls)) {
    relayBatchUrlsToDevizee(request.urls).then(sendResponse);
    return true;
  }

  if (request.action === "mediaStateChanged" || request.action === "updateMediaBadge") {
    const tabId = sender.tab?.id;
    if (tabId) {
      if (request.isPlaying) {
        chrome.action.setBadgeText({ text: "▶", tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#10b981", tabId }); // Green indicator for active playing video
      } else if (request.count > 0) {
        const count = Number(request.count);
        chrome.action.setBadgeText({ text: count > 9 ? "9+" : String(count), tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#6366f1", tabId });
      } else {
        chrome.action.setBadgeText({ text: "", tabId });
      }
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "triggerPickerOnTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "startPickerMode" }, sendResponse);
      } else {
        sendResponse({ success: false });
      }
    });
    return true;
  }

  if (request.action === "triggerBatchCollectorOnTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "startBatchCollectorMode" }, sendResponse);
      } else {
        sendResponse({ success: false });
      }
    });
    return true;
  }
});
