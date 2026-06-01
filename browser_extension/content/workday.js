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
        source: "Workday",
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

function collectJobDetails() {
  const title = readFirstText([
    "h1[data-automation-id='jobPostingHeader']",
    "h1[data-automation-id='jobPostingHeaderTitle']",
    "h1.css-1id4kq0",
    "h1",
  ]);

  const company = readFirstText([
    "[data-automation-id='companyName']",
    "[data-automation-id='jobPostingCompany']",
    "[data-automation-id='jobPostingSubtitle'] a",
    "header a[href*='company']",
  ]);

  const location = readFirstText([
    "[data-automation-id='location']",
    "[data-automation-id='jobPostingLocation']",
    "[data-automation-id='jobPostingSubtitle']",
  ]);

  return {
    title: title || readPageTitleFallback(),
    company,
    location,
    job_url: window.location.href,
    source: "Workday",
    applied_date: new Date().toISOString().slice(0, 10),
  };
}

function applyClickedRecently() {
  return Date.now() - lastApplyClickAt < 240000;
}

function successTextPresent(root = document) {
  const text = cleanText(root.innerText || "").toLowerCase();
  const markers = [
    "thank you for applying",
    "application submitted",
    "application received",
    "your application has been submitted",
  ];
  return markers.some((marker) => text.includes(marker));
}

function buildPayload(signal, confidence, note) {
  return {
    ...collectJobDetails(),
    apply_signal: signal,
    confidence,
    notes: note || "Detected from Workday apply flow",
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
      }, 1500 * (attempt + 1));
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
    "button[data-automation-id*='apply'], button[aria-label*='Apply'], button[aria-label*='apply'], a[data-automation-id*='apply']"
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
          lowText.includes("thank you for applying") ||
          lowText.includes("application submitted") ||
          lowText.includes("application received");

        if (containsMarker && applyClickedRecently()) {
          emitDebug({ event: "mutation_success_recent_apply" });
          maybeSendAutoAdd("apply_success_page", 0.93, "Workday success confirmation detected");
          return;
        }
      }
    }

    if (applyClickedRecently() && successTextPresent(document.body)) {
      emitDebug({ event: "body_success_recent_apply" });
      maybeSendAutoAdd("success_text_detected", 0.86, "Workday success text detected");
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
    if (!window.location.href.includes("workday")) {
      return;
    }

    if (successTextPresent(document.body)) {
      emitDebug({ event: "passive_scan_success" });
      maybeSendAutoAdd("passive_success_scan", 0.76, "Passive scan detected Workday success state");
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
  if (request.type === "AUTOFILL_FORM") {
    try {
      autofillWorkday(request.profile);
      sendResponse({ success: true });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }
});

// AUTOFILL ENGINE LOGIC
function fillField(input, value) {
  if (!input || !value) return;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
}

function autofillWorkday(profile) {
  // Name Fields
  fillField(document.querySelector("input[data-automation-id='legalNameSection_firstName']"), profile.firstName);
  fillField(document.querySelector("input[data-automation-id='legalNameSection_lastName']"), profile.lastName);
  fillField(document.querySelector("input[id*='firstName']"), profile.firstName);
  fillField(document.querySelector("input[id*='lastName']"), profile.lastName);

  // Contact Info Fields
  fillField(document.querySelector("input[data-automation-id='contactInformationSection_emailAddress']"), profile.email);
  fillField(document.querySelector("input[data-automation-id='contactInformationSection_phoneNumber']"), profile.phone);
  fillField(document.querySelector("input[type='email']"), profile.email);
  fillField(document.querySelector("input[type='tel']"), profile.phone);

  // Address Details Fields
  fillField(document.querySelector("input[data-automation-id='addressSection_addressLine1']"), profile.city); // fallback or empty
  fillField(document.querySelector("input[data-automation-id='addressSection_city']"), profile.city);
  fillField(document.querySelector("input[data-automation-id='addressSection_postalCode']"), "94016"); // sample or empty
}

// Floating Badge Injection
function injectAutofillBadge() {
  if (document.getElementById("quickAutofillFAB")) return;
  
  const fab = document.createElement("div");
  fab.id = "quickAutofillFAB";
  fab.innerHTML = "⚡ Autofill Application";
  
  Object.assign(fab.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    background: "rgba(30, 41, 59, 0.85)",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    borderRadius: "12px",
    padding: "10px 16px",
    color: "#ffffff",
    fontFamily: "'Segoe UI', sans-serif",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.24)",
    backdropFilter: "blur(12px)",
    webkitBackdropFilter: "blur(12px)",
    zIndex: "999999",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    display: "flex",
    alignItems: "center",
    gap: "6px"
  });
  
  fab.addEventListener("mouseenter", () => {
    fab.style.transform = "translateY(-2px) scale(1.05)";
    fab.style.boxShadow = "0 12px 40px rgba(26, 86, 219, 0.4)";
    fab.style.borderColor = "rgba(26, 86, 219, 0.6)";
  });
  
  fab.addEventListener("mouseleave", () => {
    fab.style.transform = "translateY(0) scale(1)";
    fab.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.24)";
    fab.style.borderColor = "rgba(255, 255, 255, 0.15)";
  });
  
  fab.addEventListener("click", () => {
    alert("Please click the '⚡ Autofill Active Form' button in the ATS Tracker extension popup to unlock and inject your details securely.");
  });
  
  document.body.appendChild(fab);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectAutofillBadge);
} else {
  injectAutofillBadge();
}
