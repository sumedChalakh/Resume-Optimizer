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

function ensureCompany(payload, confidence) {
  if (payload.company) {
    return payload;
  }

  const successState = successTextPresent(document.body) || successModalPresent(document.body);
  if (successState && confidence >= 0.74) {
    return {
      ...payload,
      company: "Unknown Company",
      notes: `${payload.notes || `Detected from ${getSiteName()} apply flow`}; company not visible on confirmation page`,
    };
  }

  return payload;
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
  const payload = {
    ...collectJobDetails(),
    apply_signal: signal,
    confidence,
    notes: note || `Detected from ${getSiteName()} apply flow`,
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
  if (request.type === "AUTOFILL_FORM") {
    try {
      autofillCommonATS(request.profile);
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

function autofillCommonATS(profile) {
  const host = getHost();
  
  if (host.includes("greenhouse")) {
    fillField(document.querySelector("#first_name"), profile.firstName);
    fillField(document.querySelector("#last_name"), profile.lastName);
    fillField(document.querySelector("#email"), profile.email);
    fillField(document.querySelector("#phone"), profile.phone);
    
    const websiteInput = document.querySelector("input[id*='website'], input[name*='website'], input[id*='portfolio'], input[name*='portfolio']");
    if (websiteInput) fillField(websiteInput, profile.website);
    
    const linkedinInput = document.querySelector("input[id*='linkedin'], input[name*='linkedin']");
    if (linkedinInput) fillField(linkedinInput, profile.linkedin);
    
    const githubInput = document.querySelector("input[id*='github'], input[name*='github']");
    if (githubInput) fillField(githubInput, profile.github);
  } 
  else if (host.includes("lever")) {
    fillField(document.querySelector("input[name='name']"), `${profile.firstName} ${profile.lastName}`.trim());
    fillField(document.querySelector("input[name='email']"), profile.email);
    fillField(document.querySelector("input[name='phone']"), profile.phone);
    
    fillField(document.querySelector("input[name='urls[LinkedIn]']"), profile.linkedin);
    fillField(document.querySelector("input[name='urls[GitHub]']"), profile.github);
    
    const leverWebsite = document.querySelector("input[name='urls[Portfolio]'], input[name='urls[Twitter]'], input[name*='website']");
    if (leverWebsite) fillField(leverWebsite, profile.website);
  }
  else {
    const firstNameInp = document.querySelector("input[name*='first_name'], input[id*='firstName'], input[placeholder*='First Name']");
    if (firstNameInp) fillField(firstNameInp, profile.firstName);
    
    const lastNameInp = document.querySelector("input[name*='last_name'], input[id*='lastName'], input[placeholder*='Last Name']");
    if (lastNameInp) fillField(lastNameInp, profile.lastName);
    
    const fullNameInp = document.querySelector("input[name*='name'], input[id*='name']");
    if (fullNameInp && !firstNameInp) fillField(fullNameInp, `${profile.firstName} ${profile.lastName}`.trim());
    
    const emailInp = document.querySelector("input[type='email'], input[name*='email'], input[id*='email']");
    if (emailInp) fillField(emailInp, profile.email);
    
    const phoneInp = document.querySelector("input[type='tel'], input[name*='phone'], input[id*='phone']");
    if (phoneInp) fillField(phoneInp, profile.phone);
    
    const linkedinInp = document.querySelector("input[name*='linkedin'], input[id*='linkedin']");
    if (linkedinInp) fillField(linkedinInp, profile.linkedin);
    
    const githubInp = document.querySelector("input[name*='github'], input[id*='github']");
    if (githubInp) fillField(githubInp, profile.github);
  }
}

// Floating Badge Injection
function injectAutofillBadge() {
  const host = getHost();
  if (!/(greenhouse\.io|lever\.co|smartrecruiters\.com|ashbyhq\.com|icims\.com|taleo\.net)/.test(host)) {
    return;
  }
  
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
