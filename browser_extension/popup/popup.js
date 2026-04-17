const DEFAULTS = {
  apiBaseUrl: "http://127.0.0.1:5000",
  ingestToken: "",
  autoAddEnabled: true,
  minConfidence: 0.7,
};

const SUPPORTED_JOB_HOSTS = [
  "linkedin.com",
  "naukri.com",
  "indeed.com",
  "indeed.co.in",
  "myworkdayjobs.com",
  "workday.com",
  "greenhouse.io",
  "lever.co",
  "smartrecruiters.com",
  "ashbyhq.com",
  "icims.com",
  "taleo.net",
];

function isSupportedJobHost(url) {
  const normalized = String(url || "").toLowerCase();
  return SUPPORTED_JOB_HOSTS.some((host) => normalized.includes(host));
}

function getEl(id) {
  return document.getElementById(id);
}

function hostToSource(host) {
  const low = String(host || "").toLowerCase();
  if (low.includes("linkedin")) return "LinkedIn";
  if (low.includes("naukri")) return "Naukri";
  if (low.includes("indeed")) return "Indeed";
  if (low.includes("workday")) return "Workday";
  if (low.includes("greenhouse")) return "Greenhouse";
  if (low.includes("lever")) return "Lever";
  if (low.includes("smartrecruiters")) return "SmartRecruiters";
  if (low.includes("ashbyhq")) return "Ashby";
  if (low.includes("icims")) return "iCIMS";
  if (low.includes("taleo")) return "Taleo";
  return "Unknown";
}

function sourceFromPageUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return hostToSource(u.hostname);
  } catch (error) {
    return "Unknown";
  }
}

function resolveSource(eventItem) {
  const details = eventItem?.details || {};
  if (details.source) {
    return String(details.source);
  }
  if (details.page) {
    return sourceFromPageUrl(details.page);
  }
  return "Unknown";
}

function createEmptyStats() {
  return {
    attempts: 0,
    success: 0,
    duplicate: 0,
    lowConfidence: 0,
    missingFields: 0,
    errors: 0,
  };
}

function ensureStats(map, source) {
  const key = source || "Unknown";
  if (!map[key]) {
    map[key] = createEmptyStats();
  }
  return map[key];
}

function addSummaryChip(container, text) {
  const chip = document.createElement("span");
  chip.className = "accuracy-chip";
  chip.textContent = text;
  container.appendChild(chip);
}

function addSourceBadge(container, text) {
  const badge = document.createElement("span");
  badge.className = "source-badge";
  badge.textContent = text;
  container.appendChild(badge);
}

function buildAccuracyStats(debugEvents) {
  const bySource = {};

  (debugEvents || []).forEach((item) => {
    const source = resolveSource(item);
    const sourceStats = ensureStats(bySource, source);
    const details = item?.details || {};

    if (item.type === "push_start") {
      sourceStats.attempts += 1;
      return;
    }

    if (item.type === "push_result") {
      const code = Number(details.code || 0);
      const status = String(details.status || "").toLowerCase();

      if (code === 201) {
        sourceStats.success += 1;
      } else if (code === 200 && status === "duplicate") {
        sourceStats.duplicate += 1;
      } else if (code === 202) {
        sourceStats.lowConfidence += 1;
      } else if (!details.ok || code >= 400 || code === 0) {
        sourceStats.errors += 1;
      }
      return;
    }

    if (item.type === "push_exception" || item.type === "push_error") {
      sourceStats.errors += 1;
      return;
    }

    if (item.type === "content_debug") {
      const eventName = String(details.event || "");
      if (eventName.includes("skip_missing_fields")) {
        sourceStats.missingFields += 1;
      }
    }
  });

  return bySource;
}

function renderAccuracyDashboard(debugEvents) {
  const summaryEl = getEl("accuracySummary");
  const sourceEl = getEl("accuracyBySource");
  if (!summaryEl || !sourceEl) {
    return;
  }

  const statsBySource = buildAccuracyStats(debugEvents);
  const entries = Object.entries(statsBySource)
    .map(([source, stats]) => ({ source, ...stats }))
    .sort((a, b) => b.attempts - a.attempts);

  summaryEl.innerHTML = "";
  sourceEl.innerHTML = "";

  if (!entries.length) {
    summaryEl.textContent = "No telemetry yet. Apply to a job to start tracking accuracy.";
    return;
  }

  const totalAttempts = entries.reduce((sum, row) => sum + row.attempts, 0);
  const totalSuccess = entries.reduce((sum, row) => sum + row.success, 0);
  const totalDuplicates = entries.reduce((sum, row) => sum + row.duplicate, 0);
  const totalLowConfidence = entries.reduce((sum, row) => sum + row.lowConfidence, 0);
  const totalMissing = entries.reduce((sum, row) => sum + row.missingFields, 0);
  const totalErrors = entries.reduce((sum, row) => sum + row.errors, 0);
  const successRate = totalAttempts > 0 ? Math.round((totalSuccess / totalAttempts) * 100) : 0;

  addSummaryChip(summaryEl, `Attempts: ${totalAttempts}`);
  addSummaryChip(summaryEl, `Success: ${totalSuccess}`);
  addSummaryChip(summaryEl, `Success Rate: ${successRate}%`);
  addSummaryChip(summaryEl, `Duplicates: ${totalDuplicates}`);
  addSummaryChip(summaryEl, `Low Confidence: ${totalLowConfidence}`);
  addSummaryChip(summaryEl, `Missing Fields: ${totalMissing}`);
  addSummaryChip(summaryEl, `Errors: ${totalErrors}`);

  entries.forEach((row) => {
    const card = document.createElement("div");
    card.className = "source-card";

    const head = document.createElement("div");
    head.className = "source-head";
    const rowRate = row.attempts > 0 ? Math.round((row.success / row.attempts) * 100) : 0;
    head.textContent = `${row.source} (${rowRate}% success)`;

    const metrics = document.createElement("div");
    metrics.className = "source-metrics";
    addSourceBadge(metrics, `Attempts ${row.attempts}`);
    addSourceBadge(metrics, `Success ${row.success}`);
    addSourceBadge(metrics, `Dup ${row.duplicate}`);
    addSourceBadge(metrics, `Low ${row.lowConfidence}`);
    addSourceBadge(metrics, `Missing ${row.missingFields}`);
    addSourceBadge(metrics, `Err ${row.errors}`);

    card.appendChild(head);
    card.appendChild(metrics);
    sourceEl.appendChild(card);
  });
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
  } else {
    getEl("debugEvents").textContent = "No debug events yet.";
  }

  renderAccuracyDashboard(debugEvents);
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

  if (!isSupportedJobHost(tab.url)) {
    setMessage("Open a LinkedIn, Naukri, Indeed, or Workday job page first.", true);
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
      source: `${response.source || "Job Board"} (Manual Add)`,
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
