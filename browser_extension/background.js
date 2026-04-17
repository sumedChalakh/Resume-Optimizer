const DEFAULT_CONFIG = {
  apiBaseUrl: "http://127.0.0.1:5000",
  ingestToken: "",
  autoAddEnabled: true,
  minConfidence: 0.7,
};

const DEBUG_EVENTS_KEY = "debugEvents";

async function appendDebugEvent(type, details = {}) {
  const existing = await chrome.storage.local.get([DEBUG_EVENTS_KEY]);
  const events = Array.isArray(existing[DEBUG_EVENTS_KEY]) ? existing[DEBUG_EVENTS_KEY] : [];
  const next = [
    {
      at: new Date().toISOString(),
      type,
      details,
    },
    ...events,
  ].slice(0, 40);
  await chrome.storage.local.set({ [DEBUG_EVENTS_KEY]: next });
}

async function getConfig() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);
  return {
    apiBaseUrl: String(stored.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl).replace(/\/$/, ""),
    ingestToken: String(stored.ingestToken || "").trim(),
    autoAddEnabled: Boolean(stored.autoAddEnabled),
    minConfidence: Number(stored.minConfidence || DEFAULT_CONFIG.minConfidence),
  };
}

async function setLastResult(result) {
  await chrome.storage.local.set({ lastIngestResult: result, lastIngestAt: Date.now() });
}

function notify(title, message) {
  console.log(`[${title}] ${message}`);
}

async function pushToTracker(payload) {
  const config = await getConfig();
  await appendDebugEvent("push_start", {
    apiBaseUrl: config.apiBaseUrl,
    hasToken: Boolean(config.ingestToken),
    autoAddEnabled: config.autoAddEnabled,
    title: payload?.title || "",
    company: payload?.company || "",
    confidence: payload?.confidence,
    signal: payload?.apply_signal || "",
  });

  if (!config.autoAddEnabled) {
    const result = { status: "disabled", message: "Auto add is disabled in extension settings." };
    await appendDebugEvent("push_skipped", result);
    return result;
  }

  if (!config.ingestToken) {
    const result = { status: "error", message: "Missing ingest token in extension popup settings." };
    await appendDebugEvent("push_error", result);
    return result;
  }

  const endpoint = `${config.apiBaseUrl}/tracker/api/ingest`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.ingestToken}`,
    },
    body: JSON.stringify(payload),
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = { error: "Invalid JSON response from server." };
  }

  return {
    ok: response.ok,
    code: response.status,
    data,
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set(DEFAULT_CONFIG);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return;
  }

  if (message.type === "TRACKER_DEBUG_EVENT") {
    appendDebugEvent("content_debug", message.payload || {})
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error.message || error) }));
    return true;
  }

  if (message.type !== "AUTO_TRACK_APPLICATION") {
    return;
  }

  const payload = {
    ...message.payload,
    source: message.payload?.source || "LinkedIn",
    confidence: Number(message.payload?.confidence || 0),
  };

  pushToTracker(payload)
    .then(async (result) => {
      await appendDebugEvent("push_result", {
        ok: result.ok,
        code: result.code,
        status: result.data?.status || result.status || "",
        error: result.data?.error || result.message || "",
      });
      await setLastResult(result);

      if (result.status === "disabled") {
        notify("ATS Tracker", "Auto add is disabled.");
      } else if (result.status === "error") {
        notify("ATS Tracker", result.message);
      } else if (result.code === 201) {
        notify("ATS Tracker", "Application auto-added to tracker.");
      } else if (result.code === 200 && result.data?.status === "duplicate") {
        notify("ATS Tracker", "Application already tracked (duplicate skipped).");
      } else if (result.code === 202) {
        notify("ATS Tracker", "Low confidence detection. Open popup and confirm details.");
      } else if (!result.ok) {
        notify("ATS Tracker", result.data?.error || "Failed to auto-add application.");
      }

      sendResponse(result);
    })
    .catch(async (error) => {
      const failure = {
        ok: false,
        code: 0,
        data: { error: String(error.message || error) },
      };
      await appendDebugEvent("push_exception", {
        error: failure.data.error,
      });
      await setLastResult(failure);
      notify("ATS Tracker", "Could not reach tracker API.");
      sendResponse(failure);
    });

  return true;
});
