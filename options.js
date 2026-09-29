document.addEventListener("DOMContentLoaded", async () => {
  const targetMode = document.getElementById("targetMode");
  const minFileSizeMB = document.getElementById("minFileSizeMB");
  const excludedDomains = document.getElementById("excludedDomains");
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetBtn");
  const saveStatus = document.getElementById("saveStatus");
  const themeCards = document.querySelectorAll(".theme-card");

  const DEFAULT_SETTINGS = {
    theme: "signature",
    targetMode: "auto",
    minFileSizeMB: 10,
    excludedDomains: ["localhost", "127.0.0.1"]
  };

  let currentTheme = "signature";

  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    themeCards.forEach((card) => {
      if (card.dataset.themeVal === theme) {
        card.classList.add("active");
      } else {
        card.classList.remove("active");
      }
    });
  }

  themeCards.forEach((card) => {
    card.addEventListener("click", () => {
      applyTheme(card.dataset.themeVal);
    });
  });

  async function loadSettings() {
    const s = await chrome.storage.local.get(DEFAULT_SETTINGS);
    applyTheme(s.theme || "signature");
    targetMode.value = s.targetMode || "auto";
    minFileSizeMB.value = s.minFileSizeMB || 10;
    excludedDomains.value = (s.excludedDomains || []).join("\n");
  }

  await loadSettings();

  saveBtn.addEventListener("click", async () => {
    const rawDomains = excludedDomains.value
      .split("\n")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    await chrome.storage.local.set({
      theme: currentTheme,
      targetMode: targetMode.value,
      minFileSizeMB: parseInt(minFileSizeMB.value, 10) || 10,
      excludedDomains: rawDomains
    });

    saveStatus.textContent = "✓ Settings saved!";
    saveStatus.classList.add("show");
    setTimeout(() => {
      saveStatus.classList.remove("show");
    }, 2000);
  });

  resetBtn.addEventListener("click", async () => {
    await chrome.storage.local.set(DEFAULT_SETTINGS);
    await loadSettings();
    saveStatus.textContent = "✓ Reset to defaults";
    saveStatus.classList.add("show");
    setTimeout(() => {
      saveStatus.classList.remove("show");
      saveStatus.textContent = "✓ Settings saved!";
    }, 2000);
  });
});
