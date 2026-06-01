let lastSubmitClickAt = 0;
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
    if (el && cleanText(el.textContent)) {
      return cleanText(el.textContent);
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

function splitPrimaryDescription(raw) {
  const text = cleanText(raw);
  if (!text) {
    return { company: "", location: "" };
  }

  const parts = text
    .split(/\s*[\u00b7|•|\|]\s*/)
    .map(cleanText)
    .filter(Boolean);

  return {
    company: parts[0] || "",
    location: parts[1] || "",
  };
}

function getActiveJobCard() {
  const selectors = [
    "li.jobs-search-results__list-item--active",
    "li.jobs-search-results-list__list-item--active",
    "ul.jobs-search__results-list li[aria-current='true']",
    "ul.jobs-search-results-list li[aria-current='true']",
    "li[data-occludable-job-id][aria-current='true']",
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
    ".job-details-jobs-unified-top-card__job-title",
    ".job-details-jobs-unified-top-card__job-title h1",
    ".jobs-unified-top-card__job-title",
    ".job-details-jobs-unified-top-card h1",
    ".job-view-layout h1",
    "main h1",
    "h1.t-24"
  ]);

  const company = readFirstText([
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name",
    ".job-details-jobs-unified-top-card__primary-description-without-tagline a",
    ".job-details-jobs-unified-top-card__primary-description a",
    ".jobs-unified-top-card__subtitle-primary-grouping a",
    ".job-details-jobs-unified-top-card a[href*='/company/']",
    "main a[href*='/company/']"
  ]);

  const location = readFirstText([
    ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
    ".job-details-jobs-unified-top-card__primary-description-without-tagline",
    ".jobs-unified-top-card__bullet",
    ".jobs-unified-top-card__subtitle-secondary-grouping .tvm__text",
    "main .jobs-unified-top-card__bullet"
  ]);

  const primaryDescription = readFirstText([
    ".job-details-jobs-unified-top-card__primary-description-without-tagline",
    ".job-details-jobs-unified-top-card__primary-description",
    ".jobs-unified-top-card__primary-description",
  ]);
  const parsedPrimary = splitPrimaryDescription(primaryDescription);

  // Fallback from active left-panel card if right-panel selectors change.
  const activeCard = getActiveJobCard();
  const fallbackTitle = cleanText(activeCard?.querySelector(".job-card-list__title, .job-card-container__link, a, h3, h4")?.textContent || "");
  const fallbackCompany = cleanText(activeCard?.querySelector(".job-card-container__primary-description, .job-card-container__company-name, h4, .artdeco-entity-lockup__subtitle")?.textContent || "");
  const fallbackLocation = cleanText(activeCard?.querySelector(".job-card-container__metadata-item, .job-card-container__metadata-wrapper, .artdeco-entity-lockup__caption")?.textContent || "");

  return {
    title: title || fallbackTitle || readPageTitleFallback(),
    company: company || parsedPrimary.company || fallbackCompany,
    location: location || parsedPrimary.location || fallbackLocation,
    job_url: window.location.href,
    source: "LinkedIn",
    applied_date: new Date().toISOString().slice(0, 10),
  };
}

function submitDetectedRecently() {
  return Date.now() - lastSubmitClickAt < 180000;
}

function successTextPresent(root = document) {
  const text = cleanText(root.innerText || "").toLowerCase();
  const markers = [
    "application submitted",
    "application sent",
    "your application was sent",
    "thanks for applying",
    "you successfully applied",
  ];
  return markers.some((marker) => text.includes(marker));
}

function hasApplicationStatusSubmitted(root = document) {
  const text = cleanText(root.innerText || "").toLowerCase();
  return text.includes("application status") && text.includes("application submitted");
}

function hasAppliedBadgeState(root = document) {
  const text = cleanText(root.innerText || "").toLowerCase();
  const hasApplied = text.includes("applied") && text.includes("ago");
  const hasSeeApplication = text.includes("see application");
  return hasApplied && hasSeeApplication;
}

function buildPayload(signal, confidence, note) {
  const details = collectJobDetails();
  return {
    ...details,
    apply_signal: signal,
    confidence,
    notes: note || "Detected from LinkedIn apply flow",
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

    // LinkedIn often renders right-panel company/title slightly after status text.
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

  const submitButton = target.closest("button[aria-label*='Submit application'], button[aria-label*='submit application']");
  if (submitButton) {
    lastSubmitClickAt = Date.now();
    emitDebug({ event: "submit_click_detected" });
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
        const containsMarker = lowText.includes("application submitted") || lowText.includes("your application was sent") || lowText.includes("thanks for applying");
        if (containsMarker && submitDetectedRecently()) {
          emitDebug({ event: "mutation_success_recent_submit" });
          maybeSendAutoAdd("submit_modal_success", 0.92, "LinkedIn success confirmation detected");
          return;
        }

        if (containsMarker && hasApplicationStatusSubmitted(document.body)) {
          emitDebug({ event: "mutation_status_submitted" });
          maybeSendAutoAdd("application_status_submitted", 0.81, "LinkedIn application status submitted detected");
          return;
        }
      }
    }

    if (submitDetectedRecently() && successTextPresent(document.body)) {
      emitDebug({ event: "body_success_recent_submit" });
      maybeSendAutoAdd("success_text_detected", 0.84, "LinkedIn success text detected in page");
    }

    if (hasApplicationStatusSubmitted(document.body) && successTextPresent(document.body)) {
      emitDebug({ event: "body_status_panel_submitted" });
      maybeSendAutoAdd("application_status_panel", 0.78, "LinkedIn status panel shows application submitted");
    }

    if (hasAppliedBadgeState(document.body)) {
      emitDebug({ event: "body_applied_badge_state" });
      maybeSendAutoAdd("applied_badge_state", 0.74, "LinkedIn card shows applied badge state");
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

  // Polling helps with SPA page transitions where mutation timing is inconsistent.
  setInterval(() => {
    if (!window.location.href.includes("/jobs/")) {
      return;
    }

    if (hasApplicationStatusSubmitted(document.body) && successTextPresent(document.body)) {
      emitDebug({ event: "passive_scan_status_submitted" });
      maybeSendAutoAdd("passive_status_scan", 0.76, "Passive scan detected LinkedIn application submitted state");
    }

    if (hasAppliedBadgeState(document.body)) {
      emitDebug({ event: "passive_scan_applied_badge" });
      maybeSendAutoAdd("passive_applied_badge", 0.72, "Passive scan detected LinkedIn applied badge state");
    }
  }, 5000);
}

emitDebug({ event: "content_script_loaded" });
document.addEventListener("click", onDocumentClick, true);
observeSuccessSignals();
startPassiveScan();

// Handle popup requests to manually extract visible job
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTRACT_VISIBLE_JOB") {
    const details = collectJobDetails();
    sendResponse(details);
  }
});

// MATCH SCORE ENGINE
let lastProcessedJobKey = "";

function injectMatchCard(targetContainer, score, matched, missing, jdText) {
  const existing = document.getElementById("atsMatchScoreCard");
  if (existing) {
    existing.remove();
  }
  
  const card = document.createElement("div");
  card.id = "atsMatchScoreCard";
  
  let glowColor = "rgba(16, 185, 129, 0.2)";
  let borderGlow = "#10b981";
  if (score < 50) {
    glowColor = "rgba(239, 68, 68, 0.2)";
    borderGlow = "#ef4444";
  } else if (score < 75) {
    glowColor = "rgba(245, 158, 11, 0.2)";
    borderGlow = "#f59e0b";
  }
  
  Object.assign(card.style, {
    background: "rgba(30, 41, 59, 0.95)",
    border: `1px solid rgba(255, 255, 255, 0.1)`,
    borderRadius: "12px",
    padding: "16px",
    margin: "12px 0 16px 0",
    fontFamily: "'Segoe UI', sans-serif",
    color: "#ffffff",
    boxShadow: `0 8px 32px rgba(0, 0, 0, 0.3), 0 0 16px ${glowColor}`,
    backdropFilter: "blur(12px)",
    webkitBackdropFilter: "blur(12px)",
    transition: "all 0.3s ease"
  });
  
  card.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 20px;">⚡</span>
        <strong style="font-size: 13px; font-weight: 700; tracking-wide: 0.05em; text-transform: uppercase; color: #94a3b8;">ATS Match Rating</strong>
      </div>
      <div style="font-size: 24px; font-weight: 800; color: ${borderGlow}; text-shadow: 0 0 8px ${glowColor};">${score}%</div>
    </div>
    
    <div style="display: flex; gap: 8px; margin-bottom: 14px; align-items: center;">
      <div style="flex: 1; height: 8px; background: rgba(255,255,255,0.08); border-radius: 99px; overflow: hidden; display: flex;">
        <div style="width: ${score}%; background: ${borderGlow}; height: 100%; border-radius: 99px; box-shadow: 0 0 8px ${borderGlow};"></div>
      </div>
    </div>
    
    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
      <span style="padding: 4px 8px; border-radius: 99px; font-size: 10px; font-weight: 700; background: rgba(16, 185, 129, 0.12); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2);">${matched.length} Matched</span>
      <span style="padding: 4px 8px; border-radius: 99px; font-size: 10px; font-weight: 700; background: rgba(245, 158, 11, 0.12); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.2);">${missing.length} Missing</span>
    </div>
    
    <div id="atsRevealDrawer" style="display: none; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px; margin-top: 10px;">
      <div style="margin-bottom: 10px;">
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #34d399; margin-bottom: 4px;">Matched Keywords</div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${matched.map(kw => `<span style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.15); border-radius: 4px; padding: 2px 6px; font-size: 10px; color: #34d399;">✓ ${kw}</span>`).join("") || '<span style="font-size: 10px; color: #94a3b8;">None</span>'}
        </div>
      </div>
      <div>
        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #fbbf24; margin-bottom: 4px;">Missing Keywords</div>
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${missing.map(kw => `<span style="background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.15); border-radius: 4px; padding: 2px 6px; font-size: 10px; color: #fbbf24;">⚡ ${kw}</span>`).join("") || '<span style="font-size: 10px; color: #94a3b8;">None</span>'}
        </div>
      </div>
    </div>
    
    <div style="display: flex; gap: 8px; margin-top: 12px;">
      <button id="atsToggleDrawerBtn" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #e2e8f0; font-size: 11px; font-weight: 700; padding: 8px; cursor: pointer; transition: all 0.2s;">👁️ Reveal Details</button>
      <a id="atsOptimizeBtn" href="http://127.0.0.1:5000/?prefill_jd=${encodeURIComponent(jdText)}" target="_blank" style="flex: 1; text-align: center; text-decoration: none; background: linear-gradient(135deg, #1a56db, #7a08c2); border: none; border-radius: 8px; color: #ffffff; font-size: 11px; font-weight: 700; padding: 8px; cursor: pointer; box-shadow: 0 0 10px rgba(26,86,219,0.3); transition: all 0.2s;">⚡ Optimize Resume</a>
    </div>
  `;
  
  const toggleBtn = card.querySelector("#atsToggleDrawerBtn");
  const drawer = card.querySelector("#atsRevealDrawer");
  toggleBtn.addEventListener("click", () => {
    if (drawer.style.display === "none") {
      drawer.style.display = "block";
      toggleBtn.textContent = "▲ Hide Details";
    } else {
      drawer.style.display = "none";
      toggleBtn.textContent = "👁️ Reveal Details";
    }
  });
  
  targetContainer.prepend(card);
}

function startMatchScoreScanner() {
  setInterval(() => {
    if (!window.location.href.includes("/jobs/")) {
      return;
    }
    
    const details = collectJobDetails();
    const jobKey = `${details.title}|${details.company}`.toLowerCase();
    
    if (!details.title || !details.company || jobKey === lastProcessedJobKey) {
      return;
    }
    
    const jdContainer = document.querySelector("#job-details, .jobs-description__container, .jobs-description");
    if (!jdContainer) return;
    
    const jdText = jdContainer.innerText || jdContainer.textContent || "";
    if (jdText.length < 50) return;
    
    lastProcessedJobKey = jobKey;
    emitDebug({ event: "match_score_request", key: jobKey });
    
    chrome.runtime.sendMessage({
      type: "GET_MATCH_SCORE",
      jd: jdText
    }, (response) => {
      if (response && response.ok && response.data) {
        const { score, matched, missing } = response.data;
        const targetContainer = document.querySelector(".jobs-description__container, #job-details");
        if (targetContainer) {
          injectMatchCard(targetContainer, score || 0, matched || [], missing || [], jdText);
        }
      } else {
        emitDebug({ event: "match_score_error", error: response?.error || "Unknown error" });
      }
    });
  }, 2000);
}

startMatchScoreScanner();

