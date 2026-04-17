let lastApplyClickAt = 0;
let lastSentSignature = "";
let lastSentAt = 0;
let passiveScanStarted = false;

function emitDebug(payload) {
  try {
    chrome.runtime.sendMessage({
      type: "TRACKER_DEBUG_EVENT",
      payload: {
        ...payload,
        page: window.location.href,
      },
    });
  } catch (error) {
    // Ignore debug transport errors.
  }
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function readFirstText(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = cleanText(el?.textContent || "");
    if (text) {
      return text;
    }
  }
  return "";
}

function readPageTitleFallback() {
  const rawTitle = cleanText(document.title || "");
  if (!rawTitle) {
    return "";
  }

  const pieces = rawTitle.split(/\s*[\-|•|\|]\s*/).map(cleanText).filter(Boolean);
  return pieces[0] || rawTitle;
}

function getHost() {
  return String(window.location.hostname || "").toLowerCase();
}

function hostIs(pattern) {
  return getHost().includes(pattern);
}

function getSiteName() {
  const host = getHost();
  if (host.includes("greenhouse")) return "Greenhouse";
  if (host.includes("lever")) return "Lever";
  if (host.includes("smartrecruiters")) return "SmartRecruiters";
  if (host.includes("ashbyhq")) return "Ashby";
  if (host.includes("icims")) return "iCIMS";
  if (host.includes("taleo")) return "Taleo";
  return "ATS";
}

function collectJobDetails() {
  const site = getSiteName();
  const title = readFirstText([
    "h1",
    "header h1",
    "main h1",
    "[data-automation-id='jobPostingHeader']",
    "[data-qa='job-title']",
    ".job-title",
    ".posting-header h2",
  ]);

  const company = readFirstText([
    "[data-automation-id='companyName']",
    "[data-automation-id='jobPostingCompany']",
    "[data-qa='company-name']",
    ".company-name",
    ".posting-categories .company",
    "a[href*='/company/']",
    "a[href*='/companies/']",
  ]);

  const location = readFirstText([
    "[data-automation-id='location']",
    "[data-automation-id='jobPostingLocation']",
    "[data-qa='job-location']",
    ".location",
    ".job-location",
    ".posting-categories .location",
  ]);

  return {
    title: title || readPageTitleFallback(),
    company,
    location,
    job_url: window.location.href,
    source: site,
    applied_date: new Date().toISOString().slice(0, 10),
  };
}

function applyClickedRecently() {
  return Date.now() - lastApplyClickAt < 240000;
}

function successTextPresent(root = document) {
  const text = cleanText(root.innerText || "").toLowerCase();
  const markers = [
    "application submitted",
    "application received",
    "thanks for applying",
    "thank you for applying",
    "your application was submitted",
    "you have applied",
    "submitted successfully",
    "application complete",
  ];
  return markers.some((marker) => text.includes(marker));
}

function successModalPresent(root = document) {
  const text = cleanText(root.innerText || "").toLowerCase();
  return text.includes("thank you for applying") || text.includes("application submitted") || text.includes("application received");
}

function buildPayload(signal, confidence, note) {
  return {
    ...collectJobDetails(),
    apply_signal: signal,
    confidence,
    notes: note || `Detected from ${getSiteName()} apply flow`,
  };
}

function maybeSendAutoAdd(signal, confidence, note, attempt = 0) {
  const payload = buildPayload(signal, confidence, note);
  if (!payload.title || !payload.company) {
    emitDebug({
      event: attempt < 2 ? "skip_missing_fields_retry" : "skip_missing_fields",
      signal,
      confidence,
      title: payload.title || "",
      company: payload.company || "",
      attempt,
    });

    if (attempt < 2) {
      setTimeout(() => {
        maybeSendAutoAdd(signal, confidence, note, attempt + 1);
      }, 1400 * (attempt + 1));
    }
    return;
  }

  const signature = `${payload.title}|${payload.company}|${payload.job_url}|${payload.applied_date}`.toLowerCase();
  const now = Date.now();
  if (signature === lastSentSignature && now - lastSentAt < 120000) {
    emitDebug({ event: "skip_duplicate_window", signal, signature });
    return;
  }

  lastSentSignature = signature;
  lastSentAt = now;

  chrome.runtime.sendMessage({
    type: "AUTO_TRACK_APPLICATION",
    payload,
  });

  emitDebug({
    event: "auto_track_sent",
    signal,
    confidence,
    title: payload.title,
    company: payload.company,
    source: payload.source,
  });
}

function onDocumentClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const selectors = [
    "button[aria-label*='Apply']",
    "button[aria-label*='apply']",
    "button[title*='Apply']",
    "button[data-automation-id*='apply']",
    "a[aria-label*='Apply']",
    "a[title*='Apply']",
  ];

  for (const selector of selectors) {
    if (target.closest(selector)) {
      lastApplyClickAt = Date.now();
      emitDebug({ event: "apply_click_detected" });
      break;
    }
  }
}

function observeSuccessSignals() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }

        const lowText = cleanText(node.innerText || "").toLowerCase();
        const containsMarker =
          lowText.includes("application submitted") ||
          lowText.includes("application received") ||
          lowText.includes("thank you for applying") ||
          lowText.includes("thanks for applying") ||
          lowText.includes("submitted successfully") ||
          lowText.includes("application complete");

        if (containsMarker && applyClickedRecently()) {
          emitDebug({ event: "mutation_success_recent_apply" });
          maybeSendAutoAdd("apply_success_modal", 0.92, `${getSiteName()} success confirmation detected`);
          return;
        }
      }
    }

    if (applyClickedRecently() && successModalPresent(document.body)) {
      emitDebug({ event: "body_success_recent_apply" });
      maybeSendAutoAdd("success_text_detected", 0.84, `${getSiteName()} success text detected`);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function startPassiveScan() {
  if (passiveScanStarted) {
    return;
  }
  passiveScanStarted = true;

  setInterval(() => {
    if (!/(greenhouse|lever|smartrecruiters|ashbyhq|icims|taleo)/.test(getHost())) {
      return;
    }

    if (successTextPresent(document.body)) {
      emitDebug({ event: "passive_scan_success" });
      maybeSendAutoAdd("passive_success_scan", 0.76, `Passive scan detected ${getSiteName()} success state`);
    }
  }, 5000);
}

emitDebug({ event: "content_script_loaded", source: getSiteName() });
document.addEventListener("click", onDocumentClick, true);
observeSuccessSignals();
startPassiveScan();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTRACT_VISIBLE_JOB") {
    sendResponse(collectJobDetails());
  }
});
