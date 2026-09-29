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
  theme: "signature",        // "signature" | "oled" | "frost" | "light"
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

  const isStream = isSupportedStreamUrl(tab.url);
  if (isStream) {
    chrome.action.setBadgeText({ text: "GET", tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: "#6366f1", tabId: tab.id });
  } else {
    chrome.action.setBadgeText({ text: "", tabId: tab.id });
  }
}

function isSupportedStreamUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    return SUPPORTED_STREAM_DOMAINS.some(
      (d) => url.hostname === d || url.hostname.endsWith("." + d)
    );
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
    return { success: false, error: "Invalid HTTP/HTTPS URL" };
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
  return { success: true, transport: "protocol_handler" };
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

    chrome.downloads.cancel(downloadItem.id, () => {
      if (chrome.runtime.lastError) {
        console.warn("[Devizee] Cancel download error:", chrome.runtime.lastError.message);
      }
    });

    setTimeout(() => {
      chrome.downloads.erase({ id: downloadItem.id }).catch(() => {});
    }, 1000);

    await relayUrlToDevizee(urlStr);
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

  if (request.action === "downloadBatch" && Array.isArray(request.urls)) {
    (async () => {
      let sent = 0;
      for (const u of request.urls) {
        if (u) {
          await relayUrlToDevizee(u);
          sent++;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      sendResponse({ success: true, count: sent });
    })();
    return true;
  }

  if (request.action === "updateMediaBadge") {
    const count = Number(request.count) || 0;
    const tabId = sender.tab?.id;
    if (tabId) {
      if (count > 0) {
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
});
