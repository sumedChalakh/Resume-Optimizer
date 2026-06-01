const DEFAULTS = {
  apiBaseUrl: "http://127.0.0.1:5000",
  ingestToken: "",
  autoAddEnabled: true,
  minConfidence: 0.7,
};

let currentPreviewPayload = null;

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

function renderPacketPreview(payload) {
  const previewEl = getEl("packetPreview");
  if (!previewEl) {
    return;
  }

  if (!payload) {
    previewEl.textContent = "No preview yet. Open a supported job page and click Preview Current Job Packet.";
    return;
  }

  previewEl.textContent = JSON.stringify(
    {
      title: payload.title,
      company: payload.company,
      location: payload.location,
      source: payload.source,
      job_url: payload.job_url,
      applied_date: payload.applied_date,
      apply_signal: payload.apply_signal,
      confidence: payload.confidence,
      confirmed_by_user: payload.confirmed_by_user,
      notes: payload.notes,
    },
    null,
    2
  );
}

async function extractCurrentJobPayload({
  sourceSuffix,
  applySignal,
  confidence,
  confirmedByUser,
  notes,
}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error("No active tab found.");
  }

  if (!isSupportedJobHost(tab.url)) {
    throw new Error("Open a LinkedIn, Naukri, Indeed, or Workday job page first.");
  }

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "EXTRACT_VISIBLE_JOB",
  });

  if (!response || !response.title) {
    throw new Error("Could not extract job info from this page. Check the job is visible.");
  }

  return {
    title: response.title || "Unknown Position",
    company: response.company || "Unknown Company",
    location: response.location || "",
    job_url: tab.url,
    source: `${response.source || "Job Board"}${sourceSuffix ? ` (${sourceSuffix})` : ""}`,
    applied_date: new Date().toISOString().slice(0, 10),
    apply_signal: applySignal,
    confidence,
    confirmed_by_user: confirmedByUser,
    notes,
  };
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
  try {
    const payload = await extractCurrentJobPayload({
      sourceSuffix: "Manual Add",
      applySignal: "manual_force_add",
      confidence: 0.95,
      confirmedByUser: true,
      notes: "Manual add from extension popup.",
    });

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

async function previewCurrentJobPacket() {
  try {
    currentPreviewPayload = await extractCurrentJobPayload({
      sourceSuffix: "Review Queue",
      applySignal: "review_queue",
      confidence: 0.6,
      confirmedByUser: false,
      notes: "Queued for review. Open ATSOptimizer to generate the application packet before submitting.",
    });

    renderPacketPreview(currentPreviewPayload);
    setMessage(`Preview ready: "${currentPreviewPayload.title}" @ ${currentPreviewPayload.company}`);
  } catch (error) {
    setMessage(`Error: ${error.message}`, true);
  }
}

async function queueCurrentJobForReview() {
  try {
    if (!currentPreviewPayload) {
      await previewCurrentJobPacket();
      if (!currentPreviewPayload) {
        return;
      }
    }

    const result = await chrome.runtime.sendMessage({
      type: "QUEUE_APPLICATION_REVIEW",
      payload: currentPreviewPayload,
    });

    if (result && result.ok) {
      setMessage(`✓ Queued for review: "${currentPreviewPayload.title}" @ ${currentPreviewPayload.company} (HTTP ${result.code})`);
    } else {
      const msg = result?.data?.error || result?.message || "Failed to queue job";
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

getEl("previewPacketBtn").addEventListener("click", () => {
  previewCurrentJobPacket().catch((error) => setMessage(String(error.message || error), true));
});

getEl("queueReviewBtn").addEventListener("click", () => {
  queueCurrentJobForReview().catch((error) => setMessage(String(error.message || error), true));
});

// AUTOFILL ENGINE LOGIC
let decryptedProfile = null;

// Cryptography Helpers (PBKDF2 + AES-GCM)
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(plainText, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(plainText)
  );
  
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, "0")).join("");
  const ctHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${ivHex}:${ctHex}`;
}

async function decryptData(cipherTextWithMeta, password) {
  const parts = cipherTextWithMeta.split(":");
  if (parts.length !== 3) throw new Error("Invalid cipher format");
  
  const salt = new Uint8Array(parts[0].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const iv = new Uint8Array(parts[1].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const ct = new Uint8Array(parts[2].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    ct
  );
  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

// Rendering UI based on encrypted state
async function renderAutofillUI() {
  const local = await chrome.storage.local.get(["encryptedProfile"]);
  const hasEncrypted = Boolean(local.encryptedProfile);
  
  if (!hasEncrypted) {
    getEl("autofillLockView").style.display = "block";
    getEl("autofillProfileView").style.display = "none";
    getEl("lockTitle").textContent = "Secure Profile Setup";
    getEl("lockDesc").textContent = "Create a Master PIN to encrypt and protect your candidate profile details locally.";
    getEl("unlockBtn").textContent = "Initialize Secure Profile";
  } else if (!decryptedProfile) {
    getEl("autofillLockView").style.display = "block";
    getEl("autofillProfileView").style.display = "none";
    getEl("lockTitle").textContent = "Enter Master PIN";
    getEl("lockDesc").textContent = "Enter your Master PIN to decrypt and unlock your profile details.";
    getEl("unlockBtn").textContent = "Unlock Autofill Profile";
  } else {
    getEl("autofillLockView").style.display = "none";
    getEl("autofillProfileView").style.display = "block";
    
    // Populate form fields
    getEl("profFirstName").value = decryptedProfile.firstName || "";
    getEl("profLastName").value = decryptedProfile.lastName || "";
    getEl("profEmail").value = decryptedProfile.email || "";
    getEl("profPhone").value = decryptedProfile.phone || "";
    getEl("profWebsite").value = decryptedProfile.website || "";
    getEl("profLinkedIn").value = decryptedProfile.linkedin || "";
    getEl("profGitHub").value = decryptedProfile.github || "";
    getEl("profCity").value = decryptedProfile.city || "";
    getEl("profCountry").value = decryptedProfile.country || "";
  }
}

// Tab Switching Listeners
getEl("tabSettings").addEventListener("click", () => {
  getEl("tabSettings").classList.add("active");
  getEl("tabAutofill").classList.remove("active");
  getEl("panelSettings").style.display = "block";
  getEl("panelAutofill").style.display = "none";
});

getEl("tabAutofill").addEventListener("click", () => {
  getEl("tabAutofill").classList.add("active");
  getEl("tabSettings").classList.remove("active");
  getEl("panelAutofill").style.display = "block";
  getEl("panelSettings").style.display = "none";
  renderAutofillUI();
});

// Unlock / Initialize Button Action
getEl("unlockBtn").addEventListener("click", async () => {
  const pin = getEl("masterPin").value.trim();
  if (!pin) {
    setMessage("Please enter your PIN.", true);
    return;
  }
  
  const local = await chrome.storage.local.get(["encryptedProfile"]);
  if (!local.encryptedProfile) {
    const emptyProfile = {
      firstName: "", lastName: "", email: "", phone: "",
      website: "", linkedin: "", github: "", city: "", country: ""
    };
    try {
      const encrypted = await encryptData(JSON.stringify(emptyProfile), pin);
      await chrome.storage.local.set({ encryptedProfile: encrypted });
      decryptedProfile = emptyProfile;
      getEl("masterPin").value = "";
      renderAutofillUI();
      setMessage("✓ Secure Profile initialized!");
    } catch (e) {
      setMessage(`Setup error: ${e.message}`, true);
    }
  } else {
    try {
      const decrypted = await decryptData(local.encryptedProfile, pin);
      decryptedProfile = JSON.parse(decrypted);
      getEl("masterPin").value = "";
      renderAutofillUI();
      setMessage("✓ Profile decrypted successfully.");
    } catch (e) {
      setMessage("Incorrect PIN. Please try again.", true);
    }
  }
});

// Sync from Server Action
getEl("syncProfBtn").addEventListener("click", async () => {
  const syncData = await chrome.storage.sync.get(DEFAULTS);
  const baseUrl = String(syncData.apiBaseUrl || DEFAULTS.apiBaseUrl).replace(/\/$/, "");
  const token = String(syncData.ingestToken || "").trim();
  
  if (!token) {
    setMessage("Sync error: Missing ingest token. Configure settings first.", true);
    return;
  }
  
  setMessage("Syncing profile from server...");
  try {
    const res = await fetch(`${baseUrl}/tracker/api/autofill-profile`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    
    const data = await res.json();
    if (data.profile) {
      getEl("profFirstName").value = data.profile.firstName || "";
      getEl("profLastName").value = data.profile.lastName || "";
      getEl("profEmail").value = data.profile.email || "";
      setMessage("✓ Profile synchronized successfully!");
    } else {
      throw new Error("No profile returned from server.");
    }
  } catch (e) {
    setMessage(`Sync error: ${e.message}`, true);
  }
});

// Save & Encrypt Action
getEl("saveProfBtn").addEventListener("click", async () => {
  if (!decryptedProfile) {
    setMessage("Profile is locked.", true);
    return;
  }
  
  const pin = window.prompt("Confirm PIN to encrypt and save changes:");
  if (!pin) {
    return;
  }
  
  const updated = {
    firstName: getEl("profFirstName").value.trim(),
    lastName: getEl("profLastName").value.trim(),
    email: getEl("profEmail").value.trim(),
    phone: getEl("profPhone").value.trim(),
    website: getEl("profWebsite").value.trim(),
    linkedin: getEl("profLinkedIn").value.trim(),
    github: getEl("profGitHub").value.trim(),
    city: getEl("profCity").value.trim(),
    country: getEl("profCountry").value.trim()
  };
  
  try {
    const encrypted = await encryptData(JSON.stringify(updated), pin);
    await chrome.storage.local.set({ encryptedProfile: encrypted });
    decryptedProfile = updated;
    setMessage("✓ Profile updated and encrypted safely!");
  } catch (e) {
    setMessage(`Error encrypting profile: ${e.message}`, true);
  }
});

// Lock Profile Action
getEl("lockProfBtn").addEventListener("click", () => {
  decryptedProfile = null;
  renderAutofillUI();
  setMessage("Profile locked successfully.");
});

// Trigger Active Page Autofill
getEl("autofillActiveBtn").addEventListener("click", async () => {
  if (!decryptedProfile) {
    setMessage("Profile is locked.", true);
    return;
  }
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error("No active tab found.");
    }
    
    setMessage("Triggering autofill on active page...");
    chrome.tabs.sendMessage(tab.id, {
      type: "AUTOFILL_FORM",
      profile: decryptedProfile
    }, (response) => {
      if (chrome.runtime.lastError) {
        setMessage(`Error: Make sure you are on a supported job portal.`, true);
      } else if (response && response.success) {
        setMessage("⚡ Autofill complete!");
      } else {
        setMessage("Autofill failed or was not accepted by the webpage.", true);
      }
    });
  } catch (e) {
    setMessage(`Autofill error: ${e.message}`, true);
  }
});

renderPacketPreview(null);
loadConfig().catch((error) => setMessage(String(error.message || error), true));

