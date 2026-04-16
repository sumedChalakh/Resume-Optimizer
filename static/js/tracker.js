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
const searchInputEl = document.getElementById("searchInput");
const refreshBtnEl = document.getElementById("refreshBtn");

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
