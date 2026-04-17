const DEFAULTS = {
  apiBaseUrl: "http://127.0.0.1:5000",
  ingestToken: "",
  autoAddEnabled: true,
  minConfidence: 0.7,
};

function getEl(id) {
  return document.getElementById(id);
}

function setMessage(text, isError = false) {
  const el = getEl("message");
  el.textContent = text;
  el.style.color = isError ? "#b42318" : "#0f7a4b";
}

async function loadConfig() {
  const syncData = await chrome.storage.sync.get(DEFAULTS);
  const localData = await chrome.storage.local.get(["lastIngestResult", "lastIngestAt", "debugEvents"]);

  getEl("apiBaseUrl").value = syncData.apiBaseUrl || DEFAULTS.apiBaseUrl;
  getEl("ingestToken").value = syncData.ingestToken || "";
  getEl("autoAddEnabled").checked = Boolean(syncData.autoAddEnabled);
  getEl("minConfidence").value = Number(syncData.minConfidence || DEFAULTS.minConfidence);

  const lastResult = localData.lastIngestResult;
  if (lastResult) {
    getEl("lastResult").textContent = JSON.stringify(lastResult, null, 2);
  }

  const debugEvents = Array.isArray(localData.debugEvents) ? localData.debugEvents : [];
  if (debugEvents.length > 0) {
    getEl("debugEvents").textContent = JSON.stringify(debugEvents.slice(0, 12), null, 2);
  }
}

async function saveConfig() {
  const payload = {
    apiBaseUrl: String(getEl("apiBaseUrl").value || "").trim(),
    ingestToken: String(getEl("ingestToken").value || "").trim(),
    autoAddEnabled: Boolean(getEl("autoAddEnabled").checked),
    minConfidence: Number(getEl("minConfidence").value || DEFAULTS.minConfidence),
  };

  if (!payload.apiBaseUrl) {
    setMessage("Base URL is required.", true);
    return;
  }

  if (Number.isNaN(payload.minConfidence) || payload.minConfidence < 0 || payload.minConfidence > 1) {
    setMessage("Min confidence must be between 0 and 1.", true);
    return;
  }

  await chrome.storage.sync.set(payload);
  setMessage("Settings saved.");
}

async function testConnectionAndIngest() {
  const payload = {
    title: "Tracker Connection Test",
    company: "ATS Optimizer",
    location: "Local",
    job_url: "https://local.test/auto-ingest",
    source: "Extension Test",
    applied_date: new Date().toISOString().slice(0, 10),
    apply_signal: "manual_test",
    confidence: 0.99,
    confirmed_by_user: true,
  };

  const result = await chrome.runtime.sendMessage({
    type: "AUTO_TRACK_APPLICATION",
    payload,
  });

  if (result && result.ok) {
    setMessage(`Test success (HTTP ${result.code}).`);
  } else {
    const msg = result?.data?.error || result?.message || "Test failed";
    setMessage(msg, true);
  }

  await loadConfig();
}

async function forceAddCurrentJob() {
  // Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    setMessage("No active tab found.", true);
    return;
  }

  if (!tab.url.includes("linkedin.com")) {
    setMessage("Not on LinkedIn. Navigate to a LinkedIn job page.", true);
    return;
  }

  try {
    // Ask content script to extract visible job details
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "EXTRACT_VISIBLE_JOB",
    });

    if (!response || !response.title) {
      setMessage("Could not extract job info from this page. Check the job is visible.", true);
      return;
    }

    // Submit extracted job to tracker
    const payload = {
      title: response.title || "Unknown Position",
      company: response.company || "Unknown Company",
      location: response.location || "",
      job_url: tab.url,
      source: "LinkedIn (Manual Add)",
      applied_date: new Date().toISOString().slice(0, 10),
      apply_signal: "manual_force_add",
      confidence: 0.95,
      confirmed_by_user: true,
    };

    const result = await chrome.runtime.sendMessage({
      type: "AUTO_TRACK_APPLICATION",
      payload,
    });

    if (result && result.ok) {
      setMessage(`✓ Added: "${payload.title}" @ ${payload.company} (HTTP ${result.code})`);
    } else {
      const msg = result?.data?.error || result?.message || "Failed to add job";
      setMessage(msg, true);
    }

    await loadConfig();
  } catch (error) {
    setMessage(`Error: ${error.message}`, true);
  }
}

getEl("saveBtn").addEventListener("click", () => {
  saveConfig().catch((error) => setMessage(String(error.message || error), true));
});

getEl("testBtn").addEventListener("click", () => {
  testConnectionAndIngest().catch((error) => setMessage(String(error.message || error), true));
});

getEl("forceAddBtn").addEventListener("click", () => {
  forceAddCurrentJob().catch((error) => setMessage(String(error.message || error), true));
});

loadConfig().catch((error) => setMessage(String(error.message || error), true));
