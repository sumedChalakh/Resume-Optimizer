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
const refreshBtnEl = document.getElementById("refreshBtn");

const metricGhostRateEl = document.getElementById("metricGhostRate");
const metricResponseTimeEl = document.getElementById("metricResponseTime");
const metricLongestWaitEl = document.getElementById("metricLongestWait");
const metricTotalApplicationsEl = document.getElementById("metricTotalApplications");
const metricMostActiveDayEl = document.getElementById("metricMostActiveDay");
const metricRateEl = document.getElementById("metricRate");
const metricAppliedToScreenEl = document.getElementById("metricAppliedToScreen");
const metricScreenToInterviewEl = document.getElementById("metricScreenToInterview");
const metricInterviewToOfferEl = document.getElementById("metricInterviewToOffer");

let lastApplications = [];

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
      card.innerHTML = `
        <div class="app-title">${app.title}</div>
        <div class="app-company">${app.company}</div>
        <div class="meta">${app.location || "No location"}</div>
        <div class="meta">Applied: ${app.applied_date || "N/A"}</div>
        <select class="status-select" data-id="${app.id}">
          ${buildStatusOptions(app.status)}
        </select>
        <button class="delete-btn" type="button" data-id="${app.id}">Delete</button>
      `;
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

  const layout = {
    margin: { l: 8, r: 8, t: 8, b: 8 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: {
      family: "Space Grotesk, sans-serif",
      size: 12,
      color: "#1a2238",
    },
  };

  window.Plotly.react(flowChartEl, data, layout, {
    displayModeBar: false,
    responsive: true,
  });
}

async function fetchFlowChartData() {
  const response = await fetch("/tracker/api/flow");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load flow chart data");
  }

  return data;
}

async function fetchApplications() {
  const searchValue = (searchInputEl.value || "").trim();
  const query = searchValue ? `?q=${encodeURIComponent(searchValue)}` : "";

  const response = await fetch(`/tracker/api/applications${query}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load tracker applications");
  }

  lastApplications = data.applications || [];
  renderStats(data.counts || {});
  renderBoard(lastApplications);

  try {
    const flowData = await fetchFlowChartData();
    renderFlowChart(flowData);
    const insights = computeInsights(lastApplications, data.counts || {}, flowData.links || []);
    renderInsights(insights);
  } catch (error) {
    renderFlowFallback(error.message || "Could not load flow chart.");
  }
}

async function addApplication(payload) {
  const response = await fetch("/tracker/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not add application");
  }
}

async function updateStatus(id, status) {
  const response = await fetch(`/tracker/api/applications/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not update status");
  }

  await fetchApplications();
}

async function deleteApplication(id) {
  const response = await fetch(`/tracker/api/applications/${id}`, {
    method: "DELETE",
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not delete application");
  }
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

refreshBtnEl.addEventListener("click", async () => {
  try {
    await fetchApplications();
    setMessage("Tracker refreshed.", "ok");
  } catch (error) {
    setMessage(error.message, "warn");
  }
});

(async function init() {
  try {
    await fetchApplications();
  } catch (error) {
    setMessage(error.message, "warn");
  }
})();
