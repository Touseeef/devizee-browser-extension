document.addEventListener("DOMContentLoaded", async () => {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const statusSub = document.getElementById("statusSub");
  const refreshStatusBtn = document.getElementById("refreshStatusBtn");
  const activeTabUrlEl = document.getElementById("activeTabUrl");
  const downloadTabBtn = document.getElementById("downloadTabBtn");
  const downloadBtnText = document.getElementById("downloadBtnText");
  const toggleFloatingPill = document.getElementById("toggleFloatingPill");
  const toggleIntercept = document.getElementById("toggleIntercept");
  const selectTargetMode = document.getElementById("selectTargetMode");
  const optionsLink = document.getElementById("optionsLink");

  let currentTab = null;

  // 1. Get Active Tab
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
    } else {
      activeTabUrlEl.textContent = "No active page";
      downloadTabBtn.disabled = true;
    }
  } catch (err) {
    console.error("Tab query error:", err);
  }

  // 2. Load Preferences
  const settings = await chrome.storage.local.get({
    targetMode: "auto",
    interceptDownloads: false,
    showFloatingPill: true
  });

  toggleFloatingPill.checked = settings.showFloatingPill;
  toggleIntercept.checked = settings.interceptDownloads;
  selectTargetMode.value = settings.targetMode;

  // 3. Check Live Desktop Status
  async function refreshStatus() {
    statusDot.className = "status-dot";
    statusText.textContent = "Checking...";
    statusSub.textContent = "Local ports";

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

  // 4. Download Tab Button Click
  downloadTabBtn.addEventListener("click", async () => {
    if (!currentTab || !currentTab.url) return;

    downloadBtnText.textContent = "Relaying...";
    downloadTabBtn.style.opacity = "0.8";

    chrome.runtime.sendMessage(
      { action: "downloadUrl", url: currentTab.url },
      (res) => {
        if (res && res.success) {
          downloadTabBtn.classList.add("success");
          downloadBtnText.textContent = "✓ Sent to Devizee!";
        } else {
          downloadBtnText.textContent = "Dispatched!";
        }

        setTimeout(() => {
          downloadTabBtn.classList.remove("success");
          downloadBtnText.textContent = "Download with Devizee";
          downloadTabBtn.style.opacity = "1";
        }, 1800);
      }
    );
  });

  // 5. Preference Change Listeners
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

  // 6. Settings Link
  optionsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});
