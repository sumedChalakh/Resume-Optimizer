const STATUSES = window.TRACKER_STATUSES || [
  "saved",
  "applied",
  "screen",
  "interview",
  "offer",
  "rejected"
];

const boardEl = document.getElementById("board");
const formEl = document.getElementById("addForm");
const messageEl = document.getElementById("formMessage");
const statsRowEl = document.getElementById("statsRow");
const flowChartEl = document.getElementById("flowChart");
const flowFallbackEl = document.getElementById("flowFallback");
const searchInputEl = document.getElementById("searchInput");
const daysFilterEl = document.getElementById("daysFilter");
const sourceFilterEl = document.getElementById("sourceFilter");
const refreshBtnEl = document.getElementById("refreshBtn");
const exportCsvBtnEl = document.getElementById("exportCsvBtn");
const exportJsonBtnEl = document.getElementById("exportJsonBtn");
const persistenceWarningEl = document.getElementById("persistenceWarning");

const metricGhostRateEl = document.getElementById("metricGhostRate");
const metricResponseTimeEl = document.getElementById("metricResponseTime");
const metricLongestWaitEl = document.getElementById("metricLongestWait");
const metricTotalApplicationsEl = document.getElementById("metricTotalApplications");
const metricMostActiveDayEl = document.getElementById("metricMostActiveDay");
const metricRateEl = document.getElementById("metricRate");
const metricAppliedToScreenEl = document.getElementById("metricAppliedToScreen");
const metricScreenToInterviewEl = document.getElementById("metricScreenToInterview");
const metricInterviewToOfferEl = document.getElementById("metricInterviewToOffer");
const sourceBreakdownEl = document.getElementById("sourceBreakdown");

let lastApplications = [];
let sourceOptions = [];
const TRACKER_WRITE_TOKEN_KEY = "tracker_write_token";

async function readApiJson(response, fallbackMessage) {
  const bodyText = await response.text();
  let data = null;

  if (bodyText) {
    try {
      data = JSON.parse(bodyText);
    } catch (error) {
      if (!response.ok) {
        throw new Error(`${fallbackMessage} (HTTP ${response.status})`);
      }
      throw new Error("Received invalid response format from server.");
    }
  }

  if (!response.ok) {
    const serverError = data && typeof data.error === "string" ? data.error : `${fallbackMessage} (HTTP ${response.status})`;
    throw new Error(serverError);
  }

  return data || {};
}

function getTrackerWriteHeaders() {
  const token = String(localStorage.getItem(TRACKER_WRITE_TOKEN_KEY) || "").trim();
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchTrackerWrite(url, options = {}) {
  let response = await fetch(url, {
    ...options,
    headers: {
      ...getTrackerWriteHeaders(),
      ...(options.headers || {}),
    },
  });

  if (response.status !== 401) {
    return response;
  }

  const token = window.prompt("Tracker write token is required.");
  if (!token) {
    return response;
  }

  localStorage.setItem(TRACKER_WRITE_TOKEN_KEY, token.trim());
  response = await fetch(url, {
    ...options,
    headers: {
      ...getTrackerWriteHeaders(),
      ...(options.headers || {}),
    },
  });
  return response;
}

function renderPersistenceWarning(healthData) {
  if (!persistenceWarningEl) {
    return;
  }

  const isSQLite = healthData?.database_type === "sqlite";
  if (isSQLite) {
    persistenceWarningEl.classList.add("hidden");
    persistenceWarningEl.textContent = "";
    return;
  }

  persistenceWarningEl.classList.add("hidden");
  persistenceWarningEl.textContent = "";
}

async function fetchTrackerHealth() {
  const response = await fetch("/tracker/api/health");
  return readApiJson(response, "Failed to load tracker health");
}

function setMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.classList.remove("ok", "warn");
  if (type) {
    messageEl.classList.add(type);
  }
}

function humanStatus(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function parseDateOnly(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function daysSince(dateValue) {
  const parsed = parseDateOnly(dateValue);
  if (!parsed) {
    return null;
  }

  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}

function setMetricValue(el, text) {
  if (el) {
    el.textContent = text;
  }
}

function toPercent(numerator, denominator) {
  if (!denominator || denominator <= 0) {
    return 0;
  }
  return (Number(numerator || 0) / Number(denominator)) * 100;
}

function formatPercent(value) {
  return `${Math.round((Number(value || 0) + Number.EPSILON) * 10) / 10}%`;
}

function findLinkValue(links, source, target) {
  const match = (links || []).find((link) => link.source === source && link.target === target);
  return Number(match?.value || 0);
}

function computeInsights(applications, counts, links) {
  const totalApplications = Number((applications || []).length || 0);

  const ghostCandidates = (applications || []).filter((app) => app.status === "applied");
  const ghostCount = ghostCandidates.filter((app) => {
    const age = daysSince(app.applied_date);
    return age !== null && age >= 7;
  }).length;
  const ghostRate = toPercent(ghostCount, ghostCandidates.length || totalApplications || 1);

  const progressed = (applications || []).filter((app) => ["screen", "interview", "offer", "rejected"].includes(app.status));
  const progressedAges = progressed
    .map((app) => daysSince(app.applied_date))
    .filter((value) => value !== null);
  const responseTimeDays = progressedAges.length
    ? Math.round(progressedAges.reduce((sum, value) => sum + value, 0) / progressedAges.length)
    : 0;

  const openApps = (applications || []).filter((app) => ["saved", "applied", "screen", "interview"].includes(app.status));
  const waitAges = openApps
    .map((app) => daysSince(app.applied_date))
    .filter((value) => value !== null);
  const longestWaitDays = waitAges.length ? Math.max(...waitAges) : 0;

  const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  (applications || []).forEach((app) => {
    const parsed = parseDateOnly(app.applied_date);
    if (parsed) {
      dayCounts[parsed.getDay()] += 1;
    }
  });
  const maxDayCount = Math.max(...dayCounts);
  const mostActiveDay = maxDayCount > 0 ? dayLabels[dayCounts.indexOf(maxDayCount)] : "N/A";

  const validDates = (applications || [])
    .map((app) => parseDateOnly(app.applied_date))
    .filter((value) => value instanceof Date);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msInDay = 86400000;

  const countInLastDays = (days) => {
    return validDates.filter((date) => {
      const ageDays = (startOfToday.getTime() - date.getTime()) / msInDay;
      return ageDays >= 0 && ageDays < days;
    }).length;
  };

  const dailyCount = countInLastDays(1);
  const weeklyCount = countInLastDays(7);
  const monthlyCount = countInLastDays(30);
  const yearlyCount = countInLastDays(365);

  const appliedNode = Number(counts.applied || 0);
  const screenNode = Number(counts.screen || 0);
  const interviewNode = Number(counts.interview || 0);

  const appliedToScreenValue = findLinkValue(links, "applied", "screen");
  const screenToInterviewValue = findLinkValue(links, "screen", "interview");
  const interviewToOfferValue = findLinkValue(links, "interview", "offer");

  const appliedToScreenPct = toPercent(appliedToScreenValue, appliedNode || totalApplications || 1);
  const screenToInterviewPct = toPercent(screenToInterviewValue, screenNode || 1);
  const interviewToOfferPct = toPercent(interviewToOfferValue, interviewNode || 1);

  return {
    ghostRate,
    responseTimeDays,
    longestWaitDays,
    totalApplications,
    mostActiveDay,
    dailyCount,
    weeklyCount,
    monthlyCount,
    yearlyCount,
    appliedToScreenPct,
    screenToInterviewPct,
    interviewToOfferPct,
  };
}

function renderInsights(insights) {
  setMetricValue(metricGhostRateEl, formatPercent(insights.ghostRate));
  setMetricValue(metricResponseTimeEl, `${insights.responseTimeDays} day${insights.responseTimeDays === 1 ? "" : "s"}`);
  setMetricValue(metricLongestWaitEl, `${insights.longestWaitDays} day${insights.longestWaitDays === 1 ? "" : "s"}`);
  setMetricValue(metricTotalApplicationsEl, String(insights.totalApplications));
  setMetricValue(metricMostActiveDayEl, insights.mostActiveDay);
  setMetricValue(
    metricRateEl,
    `${insights.dailyCount}/day · ${insights.weeklyCount}/week · ${insights.monthlyCount}/month · ${insights.yearlyCount}/year`
  );
  setMetricValue(metricAppliedToScreenEl, formatPercent(insights.appliedToScreenPct));
  setMetricValue(metricScreenToInterviewEl, formatPercent(insights.screenToInterviewPct));
  setMetricValue(metricInterviewToOfferEl, formatPercent(insights.interviewToOfferPct));
}

function renderSourceBreakdown(applications) {
  if (!sourceBreakdownEl) {
    return;
  }

  sourceBreakdownEl.innerHTML = "";
  const counts = {};
  applications.forEach((app) => {
    const source = String(app.source || "Unknown").trim() || "Unknown";
    counts[source] = (counts[source] || 0) + 1;
  });

  const items = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!items.length) {
    const empty = document.createElement("span");
    empty.className = "source-chip";
    empty.textContent = "No data";
    sourceBreakdownEl.appendChild(empty);
    return;
  }

  items.forEach(([source, count]) => {
    const chip = document.createElement("span");
    chip.className = "source-chip";
    chip.textContent = `${source}: ${count}`;
    sourceBreakdownEl.appendChild(chip);
  });
}

function renderSourceOptions(options) {
  if (!sourceFilterEl) {
    return;
  }

  const previousValue = sourceFilterEl.value;
  sourceFilterEl.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All sources";
  sourceFilterEl.appendChild(allOption);

  options.forEach((source) => {
    const opt = document.createElement("option");
    opt.value = source;
    opt.textContent = source;
    sourceFilterEl.appendChild(opt);
  });

  sourceFilterEl.value = options.includes(previousValue) ? previousValue : "";
}

function getActiveFilters() {
  const filters = {
    q: (searchInputEl.value || "").trim(),
    days: (daysFilterEl?.value || "all").trim(),
    source: (sourceFilterEl?.value || "").trim(),
  };
  if (window.currentBoardId) {
    filters.board_id = window.currentBoardId;
  }
  return filters;
}

function buildQueryString(filters) {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set("q", filters.q);
  }
  if (filters.days && filters.days !== "all") {
    params.set("days", filters.days);
  }
  if (filters.source) {
    params.set("source", filters.source);
  }
  if (filters.board_id) {
    params.set("board_id", filters.board_id);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCurrentAsCsv() {
  const header = [
    "id",
    "title",
    "company",
    "location",
    "source",
    "status",
    "applied_date",
    "job_url",
    "notes",
    "created_at",
    "updated_at",
  ];

  const rows = lastApplications.map((app) => [
    app.id,
    app.title,
    app.company,
    app.location,
    app.source,
    app.status,
    app.applied_date,
    app.job_url,
    app.notes,
    app.created_at,
    app.updated_at,
  ]);

  const lines = [header.map(csvEscape).join(",")];
  rows.forEach((row) => lines.push(row.map(csvEscape).join(",")));
  downloadTextFile("tracker_export.csv", `${lines.join("\n")}\n`, "text/csv;charset=utf-8");
}

function exportCurrentAsJson() {
  downloadTextFile("tracker_export.json", JSON.stringify(lastApplications, null, 2), "application/json;charset=utf-8");
}

function renderStats(counts) {
  statsRowEl.innerHTML = "";
  STATUSES.forEach((status) => {
    const count = Number(counts[status] || 0);
    const pill = document.createElement("span");
    pill.className = "stat-pill";
    pill.textContent = `${humanStatus(status)}: ${count}`;
    statsRowEl.appendChild(pill);
  });
}

function buildStatusOptions(current) {
  return STATUSES
    .map((status) => `<option value="${status}" ${status === current ? "selected" : ""}>${humanStatus(status)}</option>`)
    .join("");
}

function appendTextNode(parent, className, text) {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function renderBoard(applications) {
  boardEl.innerHTML = "";

  STATUSES.forEach((status) => {
    const column = document.createElement("article");
    column.className = "column";

    const header = document.createElement("div");
    header.className = "column-header";
    header.textContent = humanStatus(status);

    const list = document.createElement("div");
    list.className = "card-list";

    const apps = applications.filter((item) => item.status === status);
    apps.forEach((app) => {
      const card = document.createElement("div");
      card.className = "app-card";
      appendTextNode(card, "app-title", app.title || "");
      appendTextNode(card, "app-company", app.company || "");
      appendTextNode(card, "meta", app.location || "No location");
      appendTextNode(card, "meta", `Applied: ${app.applied_date || "N/A"}`);

      const statusSelect = document.createElement("select");
      statusSelect.className = "status-select";
      statusSelect.dataset.id = app.id;
      statusSelect.innerHTML = buildStatusOptions(app.status);
      card.appendChild(statusSelect);

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-btn";
      deleteButton.type = "button";
      deleteButton.dataset.id = app.id;
      deleteButton.textContent = "Delete";
      card.appendChild(deleteButton);

      // Card actions row
      const cardActions = document.createElement("div");
      cardActions.className = "app-card-actions";
      
      const archiveButton = document.createElement("button");
      archiveButton.className = "app-card-btn archive-btn";
      archiveButton.type = "button";
      archiveButton.textContent = "📁 Archive";
      archiveButton.onclick = (e) => {
        e.stopPropagation();
        archiveCard(app.id, true);
      };
      
      cardActions.appendChild(archiveButton);
      card.appendChild(cardActions);

      list.appendChild(card);
    });

    column.appendChild(header);
    column.appendChild(list);
    boardEl.appendChild(column);
  });

  boardEl.querySelectorAll(".status-select").forEach((selectEl) => {
    selectEl.addEventListener("change", async (event) => {
      const id = Number(event.target.getAttribute("data-id"));
      const status = event.target.value;
      await updateStatus(id, status);
    });
  });

  boardEl.querySelectorAll(".delete-btn").forEach((buttonEl) => {
    buttonEl.addEventListener("click", async (event) => {
      const id = Number(event.target.getAttribute("data-id"));
      if (!id) {
        return;
      }

      const shouldDelete = window.confirm("Delete this application permanently?");
      if (!shouldDelete) {
        return;
      }

      try {
        await deleteApplication(id);
        setMessage("Application deleted.", "ok");
        await fetchApplications();
      } catch (error) {
        setMessage(error.message || "Could not delete application", "warn");
      }
    });
  });
}

function buildNodeColors(labels) {
  const palette = {
    saved: "#4f46e5",
    applied: "#2563eb",
    screen: "#0ea5e9",
    interview: "#14b8a6",
    offer: "#22c55e",
    rejected: "#ef4444",
  };

  return labels.map((label) => palette[label.toLowerCase()] || "#64748b");
}

function buildLinkColors(links) {
  const base = {
    saved: "rgba(79, 70, 229, 0.30)",
    applied: "rgba(37, 99, 235, 0.30)",
    screen: "rgba(14, 165, 233, 0.30)",
    interview: "rgba(20, 184, 166, 0.30)",
    offer: "rgba(34, 197, 94, 0.30)",
    rejected: "rgba(239, 68, 68, 0.25)",
  };

  return links.map((link) => base[String(link.source || "").toLowerCase()] || "rgba(100, 116, 139, 0.30)");
}

function renderFlowFallback(message) {
  if (flowFallbackEl) {
    flowFallbackEl.textContent = message;
  }
  if (flowChartEl) {
    flowChartEl.innerHTML = "";
  }
}

function renderFlowChart(flowData) {
  if (!flowChartEl) {
    return;
  }

  if (!window.Plotly) {
    renderFlowFallback("Flow chart library not available right now.");
    return;
  }

  const nodes = Array.isArray(flowData?.nodes) ? flowData.nodes : [];
  const links = Array.isArray(flowData?.links) ? flowData.links : [];

  if (!nodes.length || !links.length) {
    renderFlowFallback("No transition data yet. Move statuses to build your flow chart.");
    return;
  }

  const labels = nodes.map((node) => {
    const id = String(node.id || "");
    const count = Number(node.count || 0);
    return `${humanStatus(id)} (${count})`;
  });
  const nodeIndex = {};
  nodes.forEach((node, idx) => {
    nodeIndex[node.id] = idx;
  });

  const chartLinks = links
    .filter((link) => nodeIndex[link.source] !== undefined && nodeIndex[link.target] !== undefined && Number(link.value || 0) > 0)
    .map((link) => ({
      source: link.source,
      target: link.target,
      value: Number(link.value || 0),
    }));

  if (!chartLinks.length) {
    renderFlowFallback("No valid transitions to display yet.");
    return;
  }

  if (flowFallbackEl) {
    flowFallbackEl.textContent = "";
  }

  const data = [{
    type: "sankey",
    orientation: "h",
    arrangement: "snap",
    valueformat: ".0f",
    node: {
      label: labels,
      color: buildNodeColors(nodes.map((node) => String(node.id || ""))),
      pad: 16,
      thickness: 18,
      line: {
        color: "rgba(15, 23, 42, 0.25)",
        width: 1,
      },
    },
    link: {
      source: chartLinks.map((link) => nodeIndex[link.source]),
      target: chartLinks.map((link) => nodeIndex[link.target]),
      value: chartLinks.map((link) => link.value),
      color: buildLinkColors(chartLinks),
    },
  }];

  const savedTheme = localStorage.getItem("theme") || "light";
  const fontColor = savedTheme === "dark" ? "#f8fafc" : "#1a2238";

  const layout = {
    margin: { l: 8, r: 8, t: 8, b: 8 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      family: "Space Grotesk, sans-serif",
      size: 12,
      color: fontColor,
    },
  };

  window.Plotly.react(flowChartEl, data, layout, {
    displayModeBar: false,
    responsive: true,
  });
}

async function fetchFlowChartData() {
  const query = buildQueryString(getActiveFilters());
  const response = await fetch(`/tracker/api/flow${query}`);
  return readApiJson(response, "Failed to load flow chart data");
}

async function fetchApplications() {
  const query = buildQueryString(getActiveFilters());

  const response = await fetch(`/tracker/api/applications${query}`);
  const data = await readApiJson(response, "Failed to load tracker applications");

  lastApplications = data.applications || [];
  sourceOptions = Array.isArray(data.source_options) ? data.source_options : sourceOptions;
  renderSourceOptions(sourceOptions);
  renderStats(data.counts || {});
  renderBoard(lastApplications);
  renderSourceBreakdown(lastApplications);

  try {
    const flowData = await fetchFlowChartData();
    renderFlowChart(flowData);
    const insights = computeInsights(lastApplications, data.counts || {}, flowData.links || []);
    renderInsights(insights);
  } catch (error) {
    renderFlowFallback(error.message || "Could not load flow chart.");
  }

  // Fetch and update Archived Cabinet data
  try {
    const activeBoardId = window.currentBoardId || 1;
    const archQuery = `?board_id=${activeBoardId}&archived=true`;
    const archResponse = await fetch(`/tracker/api/applications${archQuery}`);
    const archData = await readApiJson(archResponse, "Failed to load archived applications");
    window.archivedApplicationsList = archData.applications || [];
    
    const countEl = document.getElementById("archiveCount");
    if (countEl) {
      countEl.textContent = window.archivedApplicationsList.length;
    }
    
    if (window.showArchived) {
      renderArchiveCabinet();
    }
  } catch (error) {
    console.error("Could not load archived cards:", error);
  }
}

async function addApplication(payload) {
  const response = await fetchTrackerWrite("/tracker/api/applications", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await readApiJson(response, "Could not add application");
}

async function updateStatus(id, status) {
  const response = await fetchTrackerWrite(`/tracker/api/applications/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  await readApiJson(response, "Could not update status");

  await fetchApplications();
}

async function deleteApplication(id) {
  const response = await fetchTrackerWrite(`/tracker/api/applications/${id}`, {
    method: "DELETE",
  });
  await readApiJson(response, "Could not delete application");
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(formEl);

  const payload = {
    title: formData.get("title"),
    company: formData.get("company"),
    location: formData.get("location"),
    source: formData.get("source"),
    job_url: formData.get("job_url"),
    applied_date: formData.get("applied_date"),
    notes: formData.get("notes"),
    status: "applied",
    board_id: window.currentBoardId || 1,
  };

  try {
    await addApplication(payload);
    formEl.reset();
    setMessage("Application saved.", "ok");
    await fetchApplications();
  } catch (error) {
    setMessage(error.message, "warn");
  }
});

searchInputEl.addEventListener("input", async () => {
  try {
    await fetchApplications();
  } catch (error) {
    setMessage(error.message, "warn");
  }
});

daysFilterEl.addEventListener("change", async () => {
  try {
    await fetchApplications();
  } catch (error) {
    setMessage(error.message, "warn");
  }
});

sourceFilterEl.addEventListener("change", async () => {
  try {
    await fetchApplications();
  } catch (error) {
    setMessage(error.message, "warn");
  }
});

refreshBtnEl.addEventListener("click", async () => {
  try {
    await fetchApplications();
    setMessage("Tracker refreshed.", "ok");
  } catch (error) {
    setMessage(error.message, "warn");
  }
});

exportCsvBtnEl.addEventListener("click", () => {
  exportCurrentAsCsv();
  setMessage("Exported CSV for current filtered results.", "ok");
});

exportJsonBtnEl.addEventListener("click", () => {
  exportCurrentAsJson();
  setMessage("Exported JSON for current filtered results.", "ok");
});

function initializeThemeToggle() {
  const btn = document.getElementById("themeToggleBtn");
  
  function updateToggleIcons(theme) {
    const iconSpan = document.getElementById("themeToggleIcon");
    const emoji = theme === "dark" ? "🌙" : "☀️";
    if (iconSpan) {
      iconSpan.textContent = emoji;
    }
  }
  
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateToggleIcons(newTheme);
    refreshPlotlyFontColor(newTheme);
  }
  
  const savedTheme = localStorage.getItem("theme") || "light";
  updateToggleIcons(savedTheme);
  
  if (btn) {
    btn.addEventListener("click", toggleTheme);
  }
}

function refreshPlotlyFontColor(theme) {
  const flowChartEl = document.getElementById("flowChart");
  if (flowChartEl && flowChartEl.layout) {
    const color = theme === "dark" ? "#f8fafc" : "#1a2238";
    const update = {
      font: {
        family: "Space Grotesk, sans-serif",
        size: 12,
        color: color
      }
    };
    window.Plotly.relayout(flowChartEl, update);
  }
}

/* --- EMAIL PARSER & SYNC SYSTEM --- */

const EMAIL_TEMPLATES = {
  stripe_interview: {
    sender: "careers@stripe.com",
    subject: "Stripe Technical Screen Invite - Software Engineer",
    body: "Hi Candidate,\n\nWe were impressed by your resume and would like to invite you for a 45-minute technical screening chat on CoderPad. Please use the following link to choose a slot: dashboard.stripe.com/invite/screen.\n\nBest,\nThe Stripe Talent Team"
  },
  google_oa: {
    sender: "jobs-noreply@google.com",
    subject: "Google Software Engineer - Online Assessment Invite",
    body: "Hello Candidate,\n\nThank you for applying to Google! We would like you to complete a brief coding assessment on Hackerrank to show your algorithmic skills. You will have 90 minutes to solve 2 questions. Please complete it within 7 days using your link.\n\nRegards,\nGoogle Recruitment"
  },
  openai_offer: {
    sender: "comp@openai.com",
    subject: "OpenAI Offer Proposal & Compensation Details",
    body: "Hi Candidate,\n\nWe are absolutely thrilled to extend you an official offer to join OpenAI as a Member of Technical Staff! The compensation details are outlined below:\n- Base salary: $210,000 / year\n- Equity: $350,000 / year PPU grants\n- Sign-on: $25,000\n\nLet us know when you have time for a brief call to finalize details.\n\nBest,\nOpenAI Recruiting"
  },
  netflix_rejection: {
    sender: "no-reply@netflix.com",
    subject: "Netflix Software Engineering Application Status",
    body: "Dear Candidate,\n\nThank you for the time you invested in applying and interviewing for the Software Engineer position at Netflix. While our team was impressed with your background, we have decided not to move forward with your application at this time as we are pursuing other candidates whose profiles align more closely with current requirements.\n\nWe wish you the best in your search.\n\nSincerely,\nNetflix Recruiting"
  },
  custom_applied: {
    sender: "confirmations@linkedin.com",
    subject: "LinkedIn Application Confirmed: Senior Developer at Microsoft",
    body: "Hello Candidate,\n\nYour application for the Senior Developer role at Microsoft has been successfully submitted and confirmed through LinkedIn Easy Apply. The Microsoft hiring team will review your application details shortly.\n\nThanks,\nThe LinkedIn Jobs Team"
  }
};

function loadEmailTemplate(templateId) {
  const t = EMAIL_TEMPLATES[templateId];
  if (!t) return;
  
  document.getElementById("emailSender").value = t.sender;
  document.getElementById("emailSubject").value = t.subject;
  document.getElementById("emailBody").value = t.body;
  
  const resultDiv = document.getElementById("emailParseResult");
  resultDiv.style.display = "none";
  resultDiv.innerHTML = "";
  
  // Highlight active template pill visually
  document.querySelectorAll(".email-template-pill").forEach(el => {
    el.style.borderColor = "var(--line)";
  });
  if (event && event.target) {
    event.target.style.borderColor = "var(--accent)";
  }
}

async function parseRecruiterEmail() {
  const sender = document.getElementById("emailSender").value.trim();
  const subject = document.getElementById("emailSubject").value.trim();
  const body = document.getElementById("emailBody").value.trim();
  
  const parseBtn = document.getElementById("emailParseBtn");
  const resultDiv = document.getElementById("emailParseResult");
  
  parseBtn.disabled = true;
  parseBtn.innerHTML = `
    <span class="email-loader-dots">
      <span class="email-loader-dot"></span>
      <span class="email-loader-dot"></span>
      <span class="email-loader-dot"></span>
    </span>
    AI analyzing email context...
  `;
  
  resultDiv.style.display = "none";
  resultDiv.innerHTML = "";
  
  try {
    const response = await fetch("/tracker/api/parse-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender, subject, body })
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to parse email");
    }
    
    const data = await response.json();
    const p = data.parsed;
    
    resultDiv.style.display = "block";
    
    const statusNames = {
      saved: "Saved Opportunity",
      applied: "Applied",
      screen: "Technical Screening",
      interview: "Interview Rounds",
      offer: "Job Offer Extended!",
      rejected: "Not Moving Forward (Rejected)"
    };
    
    const prettyStatus = statusNames[p.status] || p.status;
    const providerBadge = data.provider.includes("ai") ? "⚡ AI Parsed" : "🔍 Keyword Parsed";
    
    if (data.matched) {
      resultDiv.className = "email-parse-result matched";
      resultDiv.innerHTML = `
        <div class="email-result-header ok">
          <span>✔</span> Board Synced Successfully!
        </div>
        <div class="email-result-meta" style="color: var(--text);">
          <strong>Company:</strong> ${p.company}<br/>
          <strong>Detected Status:</strong> <span class="badge font-bold" style="color:var(--accent);">${prettyStatus}</span><br/>
          <strong>Summary:</strong> ${p.summary}<br/>
          <span style="font-size: 10px; opacity:0.7; color: var(--muted);">Engine: ${providerBadge}</span>
        </div>
        <div class="text-xs font-semibold" style="color: var(--ok);">
          🎉 Moved your "${p.company}" tracker card to the "${prettyStatus}" column!
        </div>
      `;
      setMessage(`Board updated: "${p.company}" application synced to "${prettyStatus}" column.`, "ok");
      await fetchApplications();
    } else {
      resultDiv.className = "email-parse-result unmatched";
      resultDiv.innerHTML = `
        <div class="email-result-header warn">
          <span>⚠</span> Parsing complete (No Match Found)
        </div>
        <div class="email-result-meta" style="color: var(--text);">
          We parsed an update for <strong>"${p.company}"</strong> but didn't find a matching card on your board.<br/>
          <strong>Detected Status:</strong> ${prettyStatus}<br/>
          <strong>Summary:</strong> ${p.summary}<br/>
          <span style="font-size: 10px; opacity:0.7; color: var(--muted);">Engine: ${providerBadge}</span>
        </div>
        <div class="email-action-row mt-3">
          <button class="email-action-btn primary" onclick="autoCreateFromEmail('${escapeJsString(p.company)}', '${escapeJsString(p.job_title || 'Software Engineer')}', '${p.status}', '${escapeJsString(p.summary)}')">
            [+] Auto-Track this Application
          </button>
          <button class="email-action-btn" onclick="document.getElementById('emailParseResult').style.display='none';">Dismiss</button>
        </div>
      `;
    }
  } catch (error) {
    resultDiv.style.display = "block";
    resultDiv.className = "email-parse-result unmatched";
    resultDiv.innerHTML = `
      <div class="email-result-header warn">
        <span>❌</span> Sync failed
      </div>
      <div class="email-result-meta">
        ${error.message || "An error occurred while communicating with the parser."}
      </div>
    `;
    setMessage(error.message || "Email sync failed.", "warn");
  } finally {
    parseBtn.disabled = false;
    parseBtn.innerHTML = `<span>⚡</span> Sync & Parse Email`;
  }
}

async function autoCreateFromEmail(company, title, status, notes) {
  const resultDiv = document.getElementById("emailParseResult");
  const payload = {
    title: title,
    company: company,
    location: "Remote (auto)",
    source: "Email Sync Integration",
    status: status,
    applied_date: new Date().toISOString().split('T')[0],
    notes: notes + "\n[Synced automatically via Recruiter Email Simulator]"
  };
  
  try {
    const response = await fetch("/tracker/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Failed to create application");
    }
    
    resultDiv.className = "email-parse-result matched";
    resultDiv.innerHTML = `
      <div class="email-result-header ok">
        <span>✔</span> Created & Synced successfully!
      </div>
      <div class="email-result-meta" style="color: var(--text);">
        Added <strong>"${company}"</strong> for <strong>"${title}"</strong> in the <strong>"${status}"</strong> column.
      </div>
    `;
    setMessage(`Added new application for "${company}" to your tracking board!`, "ok");
    await fetchApplications();
  } catch (error) {
    setMessage(error.message || "Could not auto-track application", "warn");
  }
}

function escapeJsString(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Bind handlers globally
window.loadEmailTemplate = loadEmailTemplate;
window.parseRecruiterEmail = parseRecruiterEmail;
window.autoCreateFromEmail = autoCreateFromEmail;

/* --- CRM MULTI-BOARD & ARCHIVING SYSTEM --- */

window.currentBoardId = null;
window.activeBoards = [];
window.showArchived = false;
window.archivedApplicationsList = [];

async function fetchBoards() {
  try {
    const response = await fetch("/tracker/api/boards");
    const data = await readApiJson(response, "Failed to load boards");
    window.activeBoards = data.boards || [];
    
    const cachedBoardId = localStorage.getItem("active_board_id");
    const boardExists = window.activeBoards.some(b => b.id == cachedBoardId);
    if (boardExists) {
      window.currentBoardId = parseInt(cachedBoardId);
    } else {
      window.currentBoardId = window.activeBoards[0]?.id || 1;
    }
    
    renderBoardTabs();
  } catch (error) {
    setMessage(error.message, "warn");
  }
}

function renderBoardTabs() {
  const container = document.getElementById("boardTabs");
  if (!container) return;
  
  container.innerHTML = "";
  window.activeBoards.forEach(b => {
    const isActive = b.id === window.currentBoardId;
    const tab = document.createElement("div");
    tab.className = `board-tab ${isActive ? "active" : ""}`;
    tab.onclick = () => selectBoard(b.id);
    
    const label = document.createElement("span");
    label.textContent = b.name;
    label.title = "Double-click to rename board";
    label.ondblclick = (e) => {
      e.stopPropagation();
      renameBoardPrompt(b.id, b.name);
    };
    tab.appendChild(label);
    
    const editBtn = document.createElement("span");
    editBtn.className = "board-tab-edit-btn ml-1";
    editBtn.innerHTML = "✏️";
    editBtn.title = "Rename board";
    editBtn.onclick = (e) => {
      e.stopPropagation();
      renameBoardPrompt(b.id, b.name);
    };
    tab.appendChild(editBtn);
    
    if (window.activeBoards.length > 1) {
      const deleteBtn = document.createElement("span");
      deleteBtn.className = "board-tab-delete-btn ml-1";
      deleteBtn.innerHTML = "❌";
      deleteBtn.title = "Delete board and all cards inside it";
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteBoardPrompt(b.id, b.name);
      };
      tab.appendChild(deleteBtn);
    }
    
    container.appendChild(tab);
  });
}

async function selectBoard(boardId) {
  window.currentBoardId = boardId;
  localStorage.setItem("active_board_id", boardId);
  renderBoardTabs();
  await fetchApplications();
}

async function addNewBoardPrompt() {
  const name = prompt("Enter a name for the new hunt board:");
  if (!name || !name.trim()) return;
  
  try {
    const response = await fetchTrackerWrite("/tracker/api/boards", {
      method: "POST",
      body: JSON.stringify({ name: name.trim() })
    });
    const data = await readApiJson(response, "Could not create board");
    setMessage(`Board "${data.board.name}" created successfully.`, "ok");
    
    await fetchBoards();
    await selectBoard(data.board.id);
  } catch (error) {
    setMessage(error.message, "warn");
  }
}

async function renameBoardPrompt(boardId, oldName) {
  const name = prompt("Rename board:", oldName);
  if (!name || !name.trim() || name.trim() === oldName) return;
  
  try {
    const response = await fetchTrackerWrite(`/tracker/api/boards/${boardId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() })
    });
    await readApiJson(response, "Could not rename board");
    setMessage("Board renamed.", "ok");
    
    await fetchBoards();
  } catch (error) {
    setMessage(error.message, "warn");
  }
}

async function deleteBoardPrompt(boardId, name) {
  if (!confirm(`Are you absolutely sure you want to delete board "${name}"?\nWARNING: All applications on this board will be permanently deleted!`)) {
    return;
  }
  
  try {
    const response = await fetchTrackerWrite(`/tracker/api/boards/${boardId}`, {
      method: "DELETE"
    });
    await readApiJson(response, "Could not delete board");
    setMessage("Board deleted.", "ok");
    
    await fetchBoards();
    const fallbackId = window.activeBoards[0]?.id || 1;
    await selectBoard(fallbackId);
  } catch (error) {
    setMessage(error.message, "warn");
  }
}

async function archiveCard(appId, archived) {
  try {
    const response = await fetchTrackerWrite(`/tracker/api/applications/${appId}/archive`, {
      method: "POST",
      body: JSON.stringify({ archived })
    });
    await readApiJson(response, "Could not update archive state");
    
    const action = archived ? "archived" : "restored";
    setMessage(`Application ${action} successfully.`, "ok");
    
    await fetchApplications();
  } catch (error) {
    setMessage(error.message, "warn");
  }
}

function toggleArchiveCabinet() {
  const container = document.getElementById("archiveCabinet");
  const btn = document.getElementById("toggleArchiveCabinetBtn");
  if (!container || !btn) return;
  
  window.showArchived = !window.showArchived;
  if (window.showArchived) {
    container.style.display = "block";
    btn.textContent = "📂 Close Archived Cabinet";
    renderArchiveCabinet();
  } else {
    container.style.display = "none";
    btn.textContent = `📂 Open Archived Cabinet (${window.archivedApplicationsList.length})`;
  }
}

function renderArchiveCabinet() {
  const listEl = document.getElementById("archiveCabinetList");
  if (!listEl) return;
  
  listEl.innerHTML = "";
  
  if (window.archivedApplicationsList.length === 0) {
    listEl.innerHTML = '<div class="text-xs text-center py-6 text-slate-400" style="color: var(--muted); padding: 16px; text-align: center;">No archived applications.</div>';
    return;
  }
  
  window.archivedApplicationsList.forEach(app => {
    const item = document.createElement("div");
    item.className = "archive-cabinet-item";
    
    item.innerHTML = `
      <div class="archive-item-info">
        <span class="archive-item-title">${escapeHtml(app.title)}</span>
        <span class="archive-item-meta">${escapeHtml(app.company)} · ${escapeHtml(app.status.toUpperCase())}</span>
      </div>
      <div class="archive-item-actions">
        <button class="archive-item-btn restore" onclick="archiveCard(${app.id}, false)">Restore to Board</button>
        <button class="archive-item-btn purge" onclick="purgeArchivedCard(${app.id}, '${escapeJsString(app.title)}', '${escapeJsString(app.company)}')">Delete Permanently</button>
      </div>
    `;
    listEl.appendChild(item);
  });
}

async function purgeArchivedCard(appId, title, company) {
  if (!confirm(`Are you sure you want to permanently delete "${title}" at "${company}"?\nThis action cannot be undone.`)) {
    return;
  }
  
  try {
    const response = await fetchTrackerWrite(`/tracker/api/applications/${appId}`, {
      method: "DELETE"
    });
    await readApiJson(response, "Could not delete application");
    setMessage("Application permanently deleted.", "ok");
    
    await fetchApplications();
  } catch (error) {
    setMessage(error.message, "warn");
  }
}

// Bind handlers globally
window.addNewBoardPrompt = addNewBoardPrompt;
window.archiveCard = archiveCard;
window.toggleArchiveCabinet = toggleArchiveCabinet;
window.purgeArchivedCard = purgeArchivedCard;

(async function init() {
  try {
    initializeThemeToggle();
    const health = await fetchTrackerHealth();
    renderPersistenceWarning(health);
    await fetchBoards();
    await fetchApplications();
  } catch (error) {
    setMessage(error.message, "warn");
  }
})();
