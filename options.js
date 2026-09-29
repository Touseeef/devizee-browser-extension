document.addEventListener("DOMContentLoaded", async () => {
  const targetMode = document.getElementById("targetMode");
  const minFileSizeMB = document.getElementById("minFileSizeMB");
  const excludedDomains = document.getElementById("excludedDomains");
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetBtn");
  const saveStatus = document.getElementById("saveStatus");

  const DEFAULT_SETTINGS = {
    targetMode: "auto",
    minFileSizeMB: 10,
    excludedDomains: ["localhost", "127.0.0.1"]
  };

  async function loadSettings() {
    const s = await chrome.storage.local.get(DEFAULT_SETTINGS);
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
      targetMode: targetMode.value,
      minFileSizeMB: parseInt(minFileSizeMB.value, 10) || 10,
      excludedDomains: rawDomains
    });

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
