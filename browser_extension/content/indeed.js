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
        source: "Indeed",
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
  const raw = cleanText(document.title || "");
  if (!raw) {
    return "";
  }
  const parts = raw.split(/\s*[\-|•|\|]\s*/).map(cleanText).filter(Boolean);
  return parts[0] || raw;
}

function getActiveCard() {
  const selectors = [
    "[data-testid='slider_item'][aria-selected='true']",
    "[data-testid='result'][aria-selected='true']",
    ".job_seen_beacon[aria-selected='true']",
    ".jobsearch-SerpJobCard[aria-selected='true']",
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      return el;
    }
  }

  return null;
}

function collectJobDetails() {
  const title = readFirstText([
    "[data-testid='jobsearch-JobInfoHeader-title']",
    "[data-testid='simpler-jobTitle']",
    "h1.jobsearch-JobInfoHeader-title",
    "h1.icl-u-xs-mb--xs",
    "h1",
  ]);

  const company = readFirstText([
    "[data-testid='inlineHeader-companyName']",
    "[data-testid='company-name'] a",
    ".jobsearch-InlineCompanyRating div:first-child",
    "[data-testid='company-name']",
    ".icl-u-lg-mr--sm",
  ]);

  const location = readFirstText([
    "[data-testid='inlineHeader-companyLocation']",
    "[data-testid='job-location']",
    ".jobsearch-JobInfoHeader-subtitle > div:last-child",
    ".jobsearch-JobInfoHeader-subtitle div:last-child",
  ]);

  const activeCard = getActiveCard();
  const fallbackTitle = cleanText(activeCard?.querySelector("h2 a span, h2 a, [data-testid='job-title'], .jobTitle")?.textContent || "");
  const fallbackCompany = cleanText(activeCard?.querySelector("[data-testid='company-name'], .companyName, .company_location")?.textContent || "");
  const fallbackLocation = cleanText(activeCard?.querySelector("[data-testid='text-location'], .companyLocation, .locationsContainer")?.textContent || "");

  return {
    title: title || fallbackTitle || readPageTitleFallback(),
    company: company || fallbackCompany,
    location: location || fallbackLocation,
    job_url: window.location.href,
    source: "Indeed",
    applied_date: new Date().toISOString().slice(0, 10),
  };
}

function ensureCompany(payload, confidence) {
  if (payload.company) {
    return payload;
  }

  const successState = successTextPresent(document.body) || hasAppliedBadgeState();
  if (successState && confidence >= 0.74) {
    return {
      ...payload,
      company: "Unknown Company",
      notes: `${payload.notes || "Detected from Indeed apply flow"}; company not visible on confirmation page`,
    };
  }

  return payload;
}

function applyClickedRecently() {
  return Date.now() - lastApplyClickAt < 180000;
}

function successTextPresent(root = document) {
  const text = cleanText(root.innerText || "").toLowerCase();
  const markers = [
    "application submitted",
    "successfully applied",
    "you applied",
    "thanks for applying",
    "thank you for applying",
  ];
  return markers.some((marker) => text.includes(marker));
}

function hasAppliedBadgeState() {
  const detailPanel = document.querySelector(
    "#jobsearch-ViewjobPaneWrapper, [data-testid='jobsearch-JobComponent'], .jobsearch-JobComponent, main"
  );
  const text = cleanText((detailPanel || document.body).innerText || "").toLowerCase();

  const markers = [
    "applied",
    "already applied",
    "application submitted",
    "you applied",
  ];

  return markers.some((marker) => text.includes(marker));
}

function buildPayload(signal, confidence, note) {
  const payload = {
    ...collectJobDetails(),
    apply_signal: signal,
    confidence,
    notes: note || "Detected from Indeed apply flow",
  };

  return ensureCompany(payload, confidence);
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
      }, 1200 * (attempt + 1));
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
  });
}

function onDocumentClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const applyButton = target.closest(
    "button[aria-label*='Apply'], button[aria-label*='apply'], button[data-testid*='apply'], a[data-testid*='apply']"
  );
  if (applyButton) {
    lastApplyClickAt = Date.now();
    emitDebug({ event: "apply_click_detected" });
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
          lowText.includes("thanks for applying") ||
          lowText.includes("thank you for applying");

        if (containsMarker && applyClickedRecently()) {
          emitDebug({ event: "mutation_success_recent_apply" });
          maybeSendAutoAdd("apply_success_modal", 0.9, "Indeed success confirmation detected");
          return;
        }
      }
    }

    if (applyClickedRecently() && successTextPresent(document.body)) {
      emitDebug({ event: "body_success_recent_apply" });
      maybeSendAutoAdd("success_text_detected", 0.82, "Indeed success text detected");
    }

    if (hasAppliedBadgeState() && applyClickedRecently()) {
      emitDebug({ event: "body_applied_badge_recent_apply" });
      maybeSendAutoAdd("applied_badge_state", 0.77, "Indeed applied status badge detected");
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
    if (!window.location.href.includes("indeed")) {
      return;
    }

    if (successTextPresent(document.body)) {
      emitDebug({ event: "passive_scan_success" });
      maybeSendAutoAdd("passive_success_scan", 0.74, "Passive scan detected Indeed success state");
    }

    if (hasAppliedBadgeState()) {
      emitDebug({ event: "passive_scan_applied_badge" });
      maybeSendAutoAdd("passive_applied_badge", 0.71, "Passive scan detected Indeed applied badge state");
    }
  }, 5000);
}

emitDebug({ event: "content_script_loaded" });
document.addEventListener("click", onDocumentClick, true);
observeSuccessSignals();
startPassiveScan();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTRACT_VISIBLE_JOB") {
    sendResponse(collectJobDetails());
  }
});
