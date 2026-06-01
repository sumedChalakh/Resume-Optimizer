let currentResumeData = null;
let currentOriginalResumeText = '';
let currentCoverLetterData = null;
let lastOptimizeResponse = null;
let currentAutoPacket = null;
let currentLatexSource = '';
const BUILDER_STATE_KEY = 'ats_optimizer_builder_state_v1';
const AUTO_QUEUE_KEY = 'ats_optimizer_auto_queue_v1';
const TRACKER_WRITE_TOKEN_KEY = 'tracker_write_token';

function getTrackerWriteHeaders() {
  const token = String(localStorage.getItem(TRACKER_WRITE_TOKEN_KEY) || '').trim();
  const headers = { 'Content-Type': 'application/json' };
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

  const token = window.prompt('Tracker write token is required.');
  if (!token) {
    return response;
  }

  localStorage.setItem(TRACKER_WRITE_TOKEN_KEY, token.trim());
  return fetch(url, {
    ...options,
    headers: {
      ...getTrackerWriteHeaders(),
      ...(options.headers || {}),
    },
  });
}

function getBuilderStateSnapshot() {
  const resumeInputEl = document.getElementById('resumeInput');
  const jdInputEl = document.getElementById('jdInput');
  const lowCreditEl = document.getElementById('lowCreditMode');
  const providerBadgeEl = document.getElementById('providerBadge');
  const inputSectionEl = document.getElementById('inputSection');
  const resultsSectionEl = document.getElementById('resultsSection');

  return {
    resumeInput: resumeInputEl ? resumeInputEl.value : '',
    jdInput: jdInputEl ? jdInputEl.value : '',
    lowCreditMode: Boolean(lowCreditEl && lowCreditEl.checked),
    providerLabel: providerBadgeEl ? providerBadgeEl.textContent : 'Provider: Auto',
    currentOriginalResumeText,
    currentResumeData,
    currentCoverLetterData,
    lastOptimizeResponse,
    inputVisible: inputSectionEl ? inputSectionEl.style.display !== 'none' : true,
    resultsVisible: resultsSectionEl ? resultsSectionEl.style.display !== 'none' : false,
    savedAt: Date.now(),
  };
}

function persistBuilderState() {
  try {
    const snapshot = getBuilderStateSnapshot();
    sessionStorage.setItem(BUILDER_STATE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    // Ignore storage errors.
  }
}

function clearBuilderState() {
  try {
    sessionStorage.removeItem(BUILDER_STATE_KEY);
  } catch (error) {
    // Ignore storage errors.
  }
}

function restoreBuilderState() {
  try {
    const raw = sessionStorage.getItem(BUILDER_STATE_KEY);
    if (!raw) {
      return;
    }

    const saved = JSON.parse(raw);
    const resumeInputEl = document.getElementById('resumeInput');
    const jdInputEl = document.getElementById('jdInput');
    const lowCreditEl = document.getElementById('lowCreditMode');

    if (resumeInputEl) {
      resumeInputEl.value = String(saved.resumeInput || '');
      document.getElementById('resumeCount').textContent = resumeInputEl.value.length.toLocaleString() + ' characters';
    }

    if (jdInputEl) {
      jdInputEl.value = String(saved.jdInput || '');
      document.getElementById('jdCount').textContent = jdInputEl.value.length.toLocaleString() + ' characters';
    }

    if (lowCreditEl) {
      lowCreditEl.checked = Boolean(saved.lowCreditMode);
    }

    currentOriginalResumeText = String(saved.currentOriginalResumeText || '');
    currentResumeData = saved.currentResumeData || null;
    currentCoverLetterData = saved.currentCoverLetterData || null;
    lastOptimizeResponse = saved.lastOptimizeResponse || null;

    setProviderBadge(saved.providerLabel || 'Provider: Auto');

    if (saved.resultsVisible && saved.lastOptimizeResponse) {
      renderResults(saved.lastOptimizeResponse, { scroll: false, persist: false });
    }
  } catch (error) {
    // Ignore malformed state.
  }
}

function setProviderBadge(label) {
  const badge = document.getElementById('providerBadge');
  if (!badge) return;
  badge.textContent = label || 'Provider: Auto';
}

function setSidebarActive(mode) {
  const links = document.querySelectorAll('.sidebar-nav .sidebar-link');
  links.forEach(link => {
    link.classList.remove('active');
    link.setAttribute('aria-current', 'false');
  });

  let activeId = '';
  if (mode === 'home') activeId = 'homeNavLink';
  else if (mode === 'builder') activeId = 'builderNavLink';
  else if (mode === 'latex') activeId = 'latexNavLink';
  else if (mode === 'auto') activeId = 'autoApplyNavLink';
  else if (mode === 'salary') activeId = 'salaryNavLink';
  else if (mode === 'tracker') activeId = 'trackerNavLink';
  else if (mode === 'admin') activeId = 'adminNavLink';
  else if (mode === 'interview') activeId = 'interviewNavLink';

  if (activeId) {
    const activeLink = document.getElementById(activeId);
    if (activeLink) {
      activeLink.classList.add('active');
      activeLink.setAttribute('aria-current', 'page');
    }
  }
}

function bindSidebarHandlers() {
  const links = document.querySelectorAll('.sidebar-link');
  const descBox = document.getElementById('productDescriptionBox');

  links.forEach(link => {
    // Contextual Hint Engine
    link.addEventListener('mouseenter', () => {
      const desc = link.getAttribute('data-desc');
      if (desc && descBox) {
        descBox.textContent = desc;
      }
    });

    link.addEventListener('click', (e) => {
      // Mobile menu closing
      const sidebar = document.getElementById('leftSidebar');
      if (sidebar && !sidebar.classList.contains('hidden') && window.innerWidth < 1024) {
        sidebar.classList.add('hidden');
      }
      
      const targetHash = new URL(link.href).hash;
      if (targetHash === '#homeSection') setSidebarActive('home');
      else if (targetHash === '#inputSection') setSidebarActive('builder');
      else if (targetHash === '#latexResumeSection') setSidebarActive('latex');
      else if (targetHash === '#autoApplySection') setSidebarActive('auto');
      else if (targetHash === '#salarySection') setSidebarActive('salary');
      else if (targetHash === '#trackerSection') setSidebarActive('tracker');
      else if (targetHash === '#adminSection') setSidebarActive('admin');
      else if (targetHash === '#interviewSection') setSidebarActive('interview');
    });
  });

  // Mobile menu toggle
  const mobileBtn = document.getElementById('mobileMenuBtn');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      const sidebar = document.getElementById('leftSidebar');
      if (sidebar) sidebar.classList.toggle('hidden');
    });
  }

  // Token Persistence
  const tokenInput = document.getElementById('rightSidebarTokenInput');
  const saveBtn = document.getElementById('saveTokenBtn');
  if (tokenInput && saveBtn) {
    tokenInput.value = localStorage.getItem(TRACKER_WRITE_TOKEN_KEY) || '';
    saveBtn.addEventListener('click', () => {
      const val = tokenInput.value.trim();
      if (val) {
        localStorage.setItem(TRACKER_WRITE_TOKEN_KEY, val);
        showToast('Token saved successfully', '#22c55e');
      } else {
        localStorage.removeItem(TRACKER_WRITE_TOKEN_KEY);
        showToast('Token cleared', '#f59e0b');
      }
    });
  }
}


function getPageModeFromHash() {
  const hash = String(window.location.hash || '').toLowerCase();
  if (hash === '#inputsection' || hash === '#resumebuildersection') {
    return 'builder';
  }
  if (hash === '#latexresumesection' || hash === '#latexresume' || hash === '#latex') {
    return 'latex';
  }
  if (hash === '#autoapplysection' || hash === '#autoapply') {
    return 'auto';
  }
  if (hash === '#salarysection' || hash === '#salary') {
    return 'salary';
  }
  if (hash === '#trackersection' || hash === '#tracker') {
    return 'tracker';
  }
  if (hash === '#adminsection' || hash === '#admin') {
    return 'admin';
  }
  if (hash === '#interviewsection' || hash === '#interview') {
    return 'interview';
  }
  return 'home';
}

function applyPageModeFromHash() {
  const mode = getPageModeFromHash();
  setSidebarActive(mode);
  
  // 1. Unified Section Toggling
  const dashboardViews = document.querySelectorAll('.dashboard-view');
  if (dashboardViews.length > 0) {
    dashboardViews.forEach(el => el.classList.add('hidden'));
  } else {
    // Fallback if elements don't have .dashboard-view yet
    ['homeSection', 'inputSection', 'latexResumeSection', 'autoApplySection', 'salarySection', 'trackerSection', 'resultsSection', 'coverLetterStandaloneSection', 'adminSection', 'interviewSection'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        el.classList.add('hidden');
      }
    });
  }

  let targetId = null;
  if (mode === 'home') targetId = 'homeSection';
  else if (mode === 'builder') targetId = 'inputSection';
  else if (mode === 'latex') targetId = 'latexResumeSection';
  else if (mode === 'auto') targetId = 'autoApplySection';
  else if (mode === 'salary') targetId = 'salarySection';
  else if (mode === 'tracker') targetId = 'trackerSection';
  else if (mode === 'admin') targetId = 'adminSection';
  else if (mode === 'interview') targetId = 'interviewSection';

  // 2. Target Reveal
  if (targetId) {
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.classList.remove('hidden');
      targetEl.style.display = 'block'; // Ensure block display if legacy inline style was used
    }
  }

  // Handle specific section initializations
  if (mode === 'latex') {
    loadLatexEngineStatus();
  } else if (mode === 'builder') {
    restoreBuilderState();
    renderAutoQueue();
    // Bring back results if they were visible
    const resultsSection = document.getElementById('resultsSection');
    const inputSection = document.getElementById('inputSection');
    if (resultsSection && inputSection) {
       // Only show inputSection for now, restoreBuilderState handles rendering results if needed
       inputSection.classList.remove('hidden');
       inputSection.style.display = 'block';
    }
  } else if (mode === 'tracker') {
    // 4. Auto-Fetch Core Data
    if (typeof fetchApplications === 'function') {
      fetchApplications();
    }
  } else if (mode === 'admin') {
    loadAdminStats();
  }
}

async function predictSalary() {
  const btn = document.getElementById('predictSalaryBtn');
  const jdText = document.getElementById('salaryJd')?.value.trim();
  const location = document.getElementById('salaryLocation')?.value.trim() || 'Bangalore';
  const yoe = document.getElementById('salaryYoe')?.value || 0;
  const companySize = document.getElementById('salaryCompanySize')?.value || 'Scale-up';

  if (!jdText) return showError('Please enter a job description to predict salary.');

  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Predicting...';

  try {
    const response = await fetch('/api/predict_salary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jd_text: jdText, location, yoe, company_size: companySize })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Prediction failed');

    document.getElementById('salaryOutputCard').style.display = 'block';
    document.getElementById('salaryRangeOutput').textContent = `₹ ${data.salary_min_lpa} - ${data.salary_max_lpa} LPA`;
    document.getElementById('salaryDetailsOutput').textContent = `Detected Role: ${data.detected_role} | Confidence: ${(data.confidence * 100).toFixed(0)}%`;
    
    // Update levels.fyi iframe track if applicable
    const iframe = document.getElementById('levelsIframe');
    if (iframe) {
      let track = 'Software Engineer';
      if (data.detected_role && data.detected_role.toLowerCase().includes('data scientist')) {
        track = 'Data Scientist';
      }
      iframe.src = `https://www.levels.fyi/charts_embed.html?company=Google&track=${encodeURIComponent(track)}&hide_selector=false`;
    }

    showToast('Salary predicted successfully', '#22c55e');
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function loadLatexEngineStatus() {
  const badge = document.getElementById('latexEngineStatus');
  if (!badge) return;

  badge.classList.remove('ready', 'missing');
  badge.textContent = 'Checking PDF engine...';

  try {
    const response = await fetch('/latex-engine-status');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Status unavailable');
    }

    if (data.available) {
      badge.classList.add('ready');
      badge.textContent = `PDF engine ready: ${data.engine}`;
      return;
    }

    badge.classList.add('missing');
    badge.textContent = 'PDF engine missing: install MiKTeX or TeX Live';
  } catch (error) {
    badge.classList.add('missing');
    badge.textContent = 'PDF engine status unavailable';
  }
}

function loadAutoQueue() {
  try {
    const raw = localStorage.getItem(AUTO_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveAutoQueue(queue) {
  try {
    localStorage.setItem(AUTO_QUEUE_KEY, JSON.stringify(queue || []));
  } catch (error) {
    // Ignore storage errors.
  }
}

function renderAutoQueue() {
  const listEl = document.getElementById('autoQueueList');
  if (!listEl) return;

  const queue = loadAutoQueue();
  if (!queue.length) {
    listEl.innerHTML = '<div class="auto-empty-state">No queued roles yet.</div>';
    return;
  }

  listEl.innerHTML = queue.slice(0, 6).map((item) => `
    <div class="auto-queue-item">
      <strong>${escapeHtml(item.company || 'Company')} — ${escapeHtml(item.title || 'Role')}</strong>
      <div>Status: ${escapeHtml(item.status || 'saved')}</div>
      <div>Source: ${escapeHtml(item.source || 'Browser')}</div>
      <div>Date: ${escapeHtml(item.applied_date || '')}</div>
    </div>
  `).join('');
}

function getAutoFormData() {
  const title = document.getElementById('autoTitle')?.value.trim() || '';
  const company = document.getElementById('autoCompany')?.value.trim() || '';
  const location = document.getElementById('autoLocation')?.value.trim() || '';
  const source = document.getElementById('autoSource')?.value.trim() || 'Auto Apply Assistant';
  const jobUrl = document.getElementById('autoJobUrl')?.value.trim() || '';
  const notes = document.getElementById('autoNotes')?.value.trim() || '';
  const jobDescription = document.getElementById('autoJobDescription')?.value.trim() || '';
  const resumeInput = document.getElementById('resumeInput')?.value.trim() || '';
  const builderJdInput = document.getElementById('jdInput')?.value.trim() || '';

  // Fallback to persisted builder state if fields are currently empty.
  const resume = resumeInput || String(currentOriginalResumeText || '').trim();
  const builderJd = builderJdInput || String(lastOptimizeResponse?.keyword_analysis?.jd_text || '').trim();

  return {
    title,
    company,
    location,
    source,
    job_url: jobUrl,
    notes,
    job_description: jobDescription || builderJd,
    resume,
    builderJd,
  };
}

function buildAutoPacketSummary(packet, formData) {
  const matched = packet?.keyword_analysis?.matched_in_resume || [];
  const missing = packet?.keyword_analysis?.missing_keywords || [];
  const score = Number(packet?.ats_score?.total ?? packet?.ats_score_total ?? 0);
  const lines = [
    `Role: ${formData.title} @ ${formData.company}`,
    `Packet status: ready for review`,
    `ATS score: ${score}%`,
    `Matched keywords: ${matched.slice(0, 8).join(', ') || 'None detected yet'}`,
    `Missing keywords: ${missing.slice(0, 8).join(', ') || 'None'}`,
    '',
    'This packet is prepared for queueing in the tracker.',
    'Final submission should still be reviewed and confirmed by you.'
  ];
  return lines.join('\n');
}

function sanitizeLatexText(value) {
  return String(value || '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function parseLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function fetchLatexSourceFromBackend() {
  const templateId = document.getElementById('latexTemplateId')?.value || 'classic';
  const response = await fetch('/render-latex-source', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      latex_data: getLatexFormData(),
      template_id: templateId,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Could not render LaTeX source');
  }

  return String(data.source || '');
}

function getLatexFormData() {
  return {
    full_name: document.getElementById('latexName')?.value.trim() || '',
    email: document.getElementById('latexEmail')?.value.trim() || '',
    phone: document.getElementById('latexPhone')?.value.trim() || '',
    location: document.getElementById('latexLocation')?.value.trim() || '',
    linkedin: document.getElementById('latexLinkedin')?.value.trim() || '',
    github: document.getElementById('latexGithub')?.value.trim() || '',
    headline: document.getElementById('latexHeadline')?.value.trim() || '',
    summary: document.getElementById('latexSummary')?.value.trim() || '',
    skills: parseLines(document.getElementById('latexSkills')?.value || ''),
    experience: parseLines(document.getElementById('latexExperience')?.value || ''),
    projects: parseLines(document.getElementById('latexProjects')?.value || ''),
    education: parseLines(document.getElementById('latexEducation')?.value || ''),
    certifications: parseLines(document.getElementById('latexCertifications')?.value || ''),
  };
}

function renderLatexOutput(source) {
  const card = document.getElementById('latexOutputCard');
  const output = document.getElementById('latexOutput');
  if (!card || !output) return;

  card.style.display = 'block';
  output.innerHTML = `<pre class="latex-source">${escapeHtml(source)}</pre>`;
}

async function generateLatexResume() {
  try {
    const source = await fetchLatexSourceFromBackend();
    currentLatexSource = source;
    renderLatexOutput(source);
    showToast('LaTeX source generated from template.', '#22c55e');
  } catch (error) {
    showError(error.message || 'Could not render LaTeX source');
  }
}

async function copyLatexSource() {
  if (!currentLatexSource) {
    await generateLatexResume();
  }
  if (!currentLatexSource) return;

  navigator.clipboard.writeText(currentLatexSource).then(() => {
    showToast('LaTeX copied to clipboard.', '#22c55e');
  });
}

async function downloadLatexSource() {
  if (!currentLatexSource) {
    await generateLatexResume();
  }
  if (!currentLatexSource) return;

  const blob = new Blob([currentLatexSource], { type: 'text/x-tex;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'resume.tex';
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadLatexPdf() {
  if (!currentLatexSource) {
    await generateLatexResume();
  }
  if (!currentLatexSource) return;

  try {
    const templateId = document.getElementById('latexTemplateId')?.value || 'classic';
    const response = await fetch('/export-latex-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latex_data: getLatexFormData(),
        template_id: templateId,
      }),
    });

    if (!response.ok) {
      let message = 'PDF generation failed.';
      try {
        const errorData = await response.json();
        message = errorData.error || message;
      } catch (parseError) {
        // Ignore JSON parse errors and keep default message.
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'resume.pdf';
    link.click();
    URL.revokeObjectURL(url);

    const fallbackMode = response.headers.get('X-Latex-Fallback');
    if (fallbackMode === 'plain-text') {
      showToast('PDF generated in fallback mode (plain-text layout).', '#f59e0b');
    } else {
      showToast('PDF generated successfully.', '#22c55e');
    }
  } catch (error) {
    showError(error.message || 'Could not generate PDF from LaTeX source.');
  }
}

async function downloadLatexDocx() {
  try {
    const response = await fetch('/export-latex-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latex_data: getLatexFormData(),
      }),
    });

    if (!response.ok) {
      let message = 'Word generation failed.';
      try {
        const errorData = await response.json();
        message = errorData.error || message;
      } catch (parseError) {
        // Ignore JSON parse errors and keep default message.
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'resume.docx';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Word file generated successfully.', '#22c55e');
  } catch (error) {
    showError(error.message || 'Could not generate Word file.');
  }
}

async function generateAutoPacket() {
  const formData = getAutoFormData();
  if (!formData.title) return showError('Please enter a job title.');
  if (!formData.company) return showError('Please enter a company name.');
  if (!formData.resume) return showError('Please use the Resume Builder section first.');
  if (!formData.job_description) return showError('Please paste the job description or use the builder JD.');

  const msgEl = document.getElementById('autoApplyMessage');
  const summaryEl = document.getElementById('autoPacketSummary');
  const btn = document.getElementById('generatePacketBtn');
  const lowCreditMode = document.getElementById('lowCreditMode')?.checked || false;

  btn.disabled = true;
  msgEl.textContent = 'Generating application packet...';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const response = await fetch('/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume: formData.resume,
        jd: formData.job_description,
        low_credit_mode: lowCreditMode,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseError) {
      throw new Error('Server returned an invalid response format. Please retry.');
    }

    if (!response.ok || data.error) {
      throw new Error(data.error || 'Could not generate packet');
    }

    currentAutoPacket = {
      generated_at: new Date().toISOString(),
      formData,
      optimization: data,
    };

    summaryEl.textContent = buildAutoPacketSummary(data, formData);
    msgEl.textContent = 'Packet ready. You can queue it in the tracker now.';
    showToast('Application packet generated.', '#22c55e');
  } catch (error) {
    if (error.name === 'AbortError') {
      msgEl.textContent = 'Packet generation timed out. Try a shorter JD or enable Low Credit Mode.';
      showError('Packet generation timed out after 120s. Try again with a shorter JD.');
      return;
    }
    msgEl.textContent = 'Could not generate packet.';
    showError(error.message || 'Could not generate packet');
  } finally {
    btn.disabled = false;
  }
}

async function queueAutoJob() {
  const formData = getAutoFormData();
  if (!formData.title) return showError('Please enter a job title.');
  if (!formData.company) return showError('Please enter a company name.');

  if (!currentAutoPacket || currentAutoPacket.formData.title !== formData.title || currentAutoPacket.formData.company !== formData.company) {
    await generateAutoPacket();
  }

  const payload = {
    title: formData.title,
    company: formData.company,
    location: formData.location,
    source: formData.source,
    job_url: formData.job_url,
    applied_date: new Date().toISOString().slice(0, 10),
    notes: [
      formData.notes,
      `Auto Apply Assistant prepared a packet for review.`,
      currentAutoPacket?.optimization?.notice || ''
    ].filter(Boolean).join(' '),
    status: 'saved',
    confirmed_by_user: false,
    apply_signal: 'queued_review',
  };

  const response = await fetchTrackerWrite('/tracker/api/applications', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || 'Could not queue application');
  }

  const queue = loadAutoQueue();
  queue.unshift({
    title: payload.title,
    company: payload.company,
    source: payload.source,
    status: payload.status,
    applied_date: payload.applied_date,
  });
  saveAutoQueue(queue);
  renderAutoQueue();
  showToast('Queued in tracker as saved.', '#22c55e');
  document.getElementById('autoApplyMessage').textContent = 'Queued in tracker. Review before final submission.';
}

function copyAutoPacketNotes() {
  const summary = document.getElementById('autoPacketSummary');
  if (!summary || !summary.textContent.trim()) return;
  navigator.clipboard.writeText(summary.textContent.trim()).then(() => {
    showToast('Packet notes copied.', '#22c55e');
  });
}

function getHomeEl(id) {
  return document.getElementById(id);
}

function renderHomeMetrics(applications, counts) {
  const statEl = getHomeEl('homeStatCards');
  if (!statEl) return;

  const total = Number((applications || []).length || 0);
  const applied = Number(counts.applied || 0);
  const interview = Number(counts.interview || 0);
  const offer = Number(counts.offer || 0);

  statEl.innerHTML = `
    <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
      <span class="text-slate-400 text-sm uppercase tracking-wider mb-1">Total</span>
      <strong class="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-electricBlue to-blue-400">${total}</strong>
    </div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
      <span class="text-slate-400 text-sm uppercase tracking-wider mb-1">Applied</span>
      <strong class="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">${applied}</strong>
    </div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
      <span class="text-slate-400 text-sm uppercase tracking-wider mb-1">Interview</span>
      <strong class="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">${interview}</strong>
    </div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
      <span class="text-slate-400 text-sm uppercase tracking-wider mb-1">Offers</span>
      <strong class="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-energeticOrange to-yellow-400">${offer}</strong>
    </div>
  `;
}

function renderHomeSourceViz(applications) {
  const vizEl = getHomeEl('homeSourceViz');
  if (!vizEl) return;

  const sourceCounts = {};
  (applications || []).forEach((item) => {
    const source = String(item.source || 'Unknown').trim() || 'Unknown';
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  });

  const entries = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (!entries.length) {
    vizEl.innerHTML = '<div class="text-slate-400 p-4 bg-white/5 border border-white/10 rounded-xl text-center">No application data yet. Add your first tracked job to see source insights.</div>';
    return;
  }

  const maxValue = entries[0][1] || 1;
  vizEl.innerHTML = entries.map(([source, value]) => {
    const width = Math.max(8, Math.round((value / maxValue) * 100));
    return `
      <div class="flex items-center gap-4 group mb-3">
        <span class="w-24 truncate text-slate-300 text-sm font-medium" title="${escapeHtml(source)}">${escapeHtml(source)}</span>
        <div class="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-electricBlue to-energeticOrange rounded-full transition-all duration-1000 ease-out group-hover:opacity-80" style="width:${width}%"></div>
        </div>
        <span class="w-8 text-right font-bold text-white">${value}</span>
      </div>
    `;
  }).join('');
}

async function loadHomeOverview() {
  const statEl = getHomeEl('homeStatCards');
  if (!statEl) return;

  try {
    const token = localStorage.getItem(TRACKER_WRITE_TOKEN_KEY) || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const response = await fetch('/tracker/api/applications', { headers });
    const text = await response.text();
    let data = { applications: [], counts: {} };
    if (text) {
      try { data = JSON.parse(text); } catch(e) {}
    }
    if (!response.ok) {
      throw new Error(data.error || 'Could not load tracker snapshot');
    }

    renderHomeMetrics(data.applications || [], data.counts || {});
    renderHomeSourceViz(data.applications || []);
  } catch (error) {
    statEl.innerHTML = '<div class="col-span-2 text-center text-slate-400 p-4 bg-white/5 border border-white/10 rounded-xl">Tracker metrics unavailable right now.</div>';
    const vizEl = getHomeEl('homeSourceViz');
    if (vizEl) {
      vizEl.innerHTML = '<div class="text-center text-slate-400 p-4 bg-white/5 border border-white/10 rounded-xl">Could not load source distribution.</div>';
    }
  }
}

function inferProviderLabel(data) {
  const notice = String((data && data.notice) || '').toLowerCase();
  if (notice.includes('github models')) return 'Provider: GitHub Models';
  if (notice.includes('hugging face')) return 'Provider: Hugging Face';
  if (data && data.fallback_mode) return 'Provider: Local Fallback';
  return 'Provider: OpenRouter/Auto';
}

const resumeFileInput = document.getElementById('resumeFile');
resumeFileInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  await uploadResumeFile(file);
  e.target.value = '';
});

const latexResumeFileInput = document.getElementById('latexResumeFile');
if (latexResumeFileInput) {
  latexResumeFileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await uploadLatexResumeFile(file);
    e.target.value = '';
  });
}

// Character counters
document.getElementById('resumeInput').addEventListener('input', e => {
  document.getElementById('resumeCount').textContent = e.target.value.length.toLocaleString() + ' characters';
  persistBuilderState();
});
document.getElementById('jdInput').addEventListener('input', e => {
  document.getElementById('jdCount').textContent = e.target.value.length.toLocaleString() + ' characters';
  persistBuilderState();
});

async function uploadResumeFile(file) {
  const extractedText = await extractResumeTextFromFile(file);
  if (!extractedText) return;

  const textarea = document.getElementById('resumeInput');
  textarea.value = extractedText;
  document.getElementById('resumeCount').textContent = textarea.value.length.toLocaleString() + ' characters';
  persistBuilderState();
  showToast('Resume text loaded from file.', '#22c55e');
}

async function extractResumeTextFromFile(file) {
  const allowed = ['pdf', 'doc', 'docx', 'txt'];
  const ext = file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) {
    showError('Unsupported file type. Use PDF, DOC, DOCX, or TXT.');
    return '';
  }

  const formData = new FormData();
  formData.append('resume_file', file);

  try {
    const response = await fetch('/extract-resume', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Failed to parse file');
    }

    return String(data.text || '');
  } catch (err) {
    showError(err.message || 'Could not read uploaded file.');
    return '';
  }
}

function cleanResumeLine(line) {
  return String(line || '')
    .replace(/^[-*\u2022\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseResumeSections(text) {
  const sections = {
    header: [],
    summary: [],
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
  };

  const headingMap = [
    { key: 'summary', re: /^(professional\s+summary|summary|profile)$/i },
    { key: 'skills', re: /^(skills|technical\s+skills|core\s+skills)$/i },
    { key: 'experience', re: /^(experience|work\s+experience|professional\s+experience|employment)$/i },
    { key: 'projects', re: /^(projects|personal\s+projects|key\s+projects)$/i },
    { key: 'education', re: /^(education|academic\s+background|qualifications)$/i },
    { key: 'certifications', re: /^(certifications?|certifications?\s*[&/]\s*courses?|courses|licenses?)$/i },
  ];

  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => cleanResumeLine(line))
    .filter(Boolean);

  let current = 'header';
  for (const line of lines) {
    const mapped = headingMap.find((item) => item.re.test(line));
    if (mapped) {
      current = mapped.key;
      continue;
    }
    sections[current].push(line);
  }

  return sections;
}

function limitImportedLines(lines, maxLines, maxLen) {
  return (lines || [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .map((line) => (line.length > maxLen ? `${line.slice(0, maxLen - 1)}…` : line));
}

function parseHeaderDetails(lines) {
  const headerLines = (lines || []).map((line) => String(line || '').trim()).filter(Boolean);
  const joined = String(headerLines.join(' '));

  const emailMatch = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = joined.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
  const linkedinMatch = joined.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[\S]+/i) || joined.match(/linkedin[:\s\/]*([A-Za-z0-9\-_.]+)/i);
  const githubMatch = joined.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\S]+/i) || joined.match(/github[:\s\/]*([A-Za-z0-9\-_.]+)/i);

  const looksLikeContact = (value) => /@|linkedin|github|http|www|\d{4,}/i.test(value);
  const looksLikeRoleLine = (value) => /(engineer|scientist|manager|developer|analyst|data|ml|machine|learning|designer|architect|consultant)/i.test(value);
  const looksLikeLocation = (value) => {
    const cleaned = String(value || '').trim();
    if (!cleaned) return false;
    if (looksLikeContact(cleaned)) return false;
    if (looksLikeRoleLine(cleaned)) return false;
    if (cleaned.length > 60) return false;
    if (/\b(?:summary|skills|experience|education|projects|certifications?)\b/i.test(cleaned)) return false;
    if (cleaned.includes(',')) return true;
    return /^[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2}$/.test(cleaned);
  };

  let name = '';
  let headline = '';
  let location = '';

  for (const line of headerLines) {
    if (!name && !looksLikeContact(line) && !looksLikeRoleLine(line)) {
      const words = line.split(/\s+/).filter(Boolean);
      if (words.length >= 1 && words.length <= 6) {
        name = line;
        continue;
      }
    }

    const segments = line.split(/[|•·—–\/\u2022]/).map((segment) => segment.trim()).filter(Boolean);
    for (const segment of segments) {
      if (!location && segment !== name && segment !== headline && looksLikeLocation(segment)) {
        location = segment;
      }
    }

    if (!headline && line !== name) {
      const headlineCandidate = segments.find((segment) => looksLikeRoleLine(segment) || segment.includes('|')) || '';
      if (headlineCandidate && !looksLikeContact(headlineCandidate)) {
        headline = headlineCandidate;
        continue;
      }
      if (!looksLikeContact(line) && looksLikeRoleLine(line)) {
        headline = line;
      }
    }
  }

  if (!headline) {
    const fallbackHeadline = headerLines.find((line) => line !== name && !looksLikeContact(line) && (line.includes('|') || looksLikeRoleLine(line)));
    if (fallbackHeadline) headline = fallbackHeadline;
  }

  if (!location) {
    const fallbackLocation = headerLines
      .flatMap((line) => line.split(/[|•·—–\/\u2022]/).map((segment) => segment.trim()))
      .find((segment) => segment !== name && segment !== headline && looksLikeLocation(segment));
    if (fallbackLocation) location = fallbackLocation;
  }

  // Normalize detected social handles/urls
  let linkedin = '';
  if (linkedinMatch) {
    linkedin = linkedinMatch[0] || (linkedinMatch[1] ? `https://www.linkedin.com/in/${linkedinMatch[1]}` : '');
  }

  let github = '';
  if (githubMatch) {
    github = githubMatch[0] || (githubMatch[1] ? `https://github.com/${githubMatch[1]}` : '');
  }

  return {
    name,
    headline,
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? phoneMatch[0] : '',
    location: location || '',
    linkedin: linkedin || '',
    github: github || '',
  };
}

function extractSocialLinksFromText(text) {
  const value = String(text || '');
  const headerBlock = value
    .split(/\r?\n/)
    .slice(0, 8)
    .join(' ');

  const linkedinMatch = headerBlock.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|company|school)\/[A-Za-z0-9\-_.%/]+/i)
    || headerBlock.match(/linkedin[:\s\/]*((?:in|company|school)\/[A-Za-z0-9\-_.%/]+)/i);

  const githubMatch = headerBlock.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9\-_.%]+\/?(?![A-Za-z0-9\-_.%/])/i)
    || headerBlock.match(/github[:\s\/]*([A-Za-z0-9\-_.%]+)\/?(?![A-Za-z0-9\-_.%/])/i);

  const normalize = (match, provider) => {
    if (!match) return '';
    const raw = String(match[0] || match[1] || '').trim().replace(/[.,;]+$/g, '');
    if (!raw) return '';
    const candidate = /^https?:\/\//i.test(raw)
      ? raw
      : raw.toLowerCase().startsWith('www.')
        ? `https://${raw}`
        : raw.toLowerCase().startsWith(`${provider}.com`)
          ? `https://${raw}`
          : raw.toLowerCase().startsWith(provider)
            ? `https://www.${provider}.com/${raw.replace(new RegExp(`^${provider}[:\s\/]*`, 'i'), '').replace(/^\/+/, '')}`
            : '';

    if (!candidate) return '';

    try {
      const url = new URL(candidate);
      const segments = url.pathname.split('/').filter(Boolean);
      if (provider === 'github') {
        if (segments.length !== 1) return '';
      } else if (provider === 'linkedin') {
        if (segments.length < 2 || !['in', 'company', 'school'].includes(segments[0])) return '';
        if (segments.length !== 2) return '';
      }
      return url.toString().replace(/[.,;]+$/g, '');
    } catch (error) {
      return '';
    }
  };

  return {
    linkedin: normalize(linkedinMatch, 'linkedin'),
    github: normalize(githubMatch, 'github'),
  };
}

function setLatexFieldValue(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.value = value || '';
  }
}

function populateLatexFieldsFromResumeText(text) {
  const sections = parseResumeSections(text);
  const header = parseHeaderDetails(sections.header);

  setLatexFieldValue('latexName', header.name);
  setLatexFieldValue('latexEmail', header.email);
  setLatexFieldValue('latexPhone', header.phone);
  setLatexFieldValue('latexLocation', header.location);
  setLatexFieldValue('latexLinkedin', header.linkedin);
  setLatexFieldValue('latexGithub', header.github);
  setLatexFieldValue('latexHeadline', header.headline);

  const inferredSummary = sections.summary.length
    ? sections.summary.join(' ').slice(0, 550)
    : sections.header.slice(2, 5).join(' ');
  setLatexFieldValue('latexSummary', inferredSummary);

  const skillLines = sections.skills.length
    ? sections.skills
    : ['Core Skills: Add your main skills here'];
  setLatexFieldValue('latexSkills', limitImportedLines(skillLines, 8, 150).join('\n'));

  const experienceLines = sections.experience.length
    ? sections.experience
    : ['Role | Company | Duration | Add impact-focused bullet'];
  setLatexFieldValue('latexExperience', limitImportedLines(experienceLines, 28, 220).join('\n'));

  const projectLines = sections.projects.length
    ? sections.projects
    : ['Project Name | Tech Stack | Add measurable outcome'];
  setLatexFieldValue('latexProjects', limitImportedLines(projectLines, 20, 220).join('\n'));

  const educationLines = sections.education.length
    ? sections.education
    : ['Degree | University | Year'];
  setLatexFieldValue('latexEducation', limitImportedLines(educationLines, 6, 180).join('\n'));

  const certificationLines = sections.certifications.length
    ? sections.certifications
    : [];
  setLatexFieldValue('latexCertifications', limitImportedLines(certificationLines, 10, 180).join('\n'));
}

async function uploadLatexResumeFile(file) {
  const statusEl = document.getElementById('latexUploadStatus');
  if (statusEl) {
    statusEl.textContent = 'Reading resume file and preparing editable fields...';
  }

  const extractedText = await extractResumeTextFromFile(file);
  if (!extractedText) {
    if (statusEl) {
      statusEl.textContent = 'Could not read this file. Try PDF, DOC, DOCX, or TXT.';
    }
    return;
  }

  populateLatexFieldsFromResumeText(extractedText);
  currentLatexSource = '';
  const card = document.getElementById('latexOutputCard');
  if (card) {
    card.style.display = 'none';
  }

  if (statusEl) {
    statusEl.textContent = `Imported ${extractedText.length.toLocaleString()} characters. Edit fields and click Generate LaTeX.`;
  }
  showToast('Resume imported into editable LaTeX fields.', '#22c55e');
}

// Animate loading steps
function animateSteps() {
  const steps = ['step1', 'step2', 'step3', 'step4'];
  let i = 0;
  const interval = setInterval(() => {
    if (i > 0) {
      document.getElementById(steps[i - 1]).classList.remove('active');
      document.getElementById(steps[i - 1]).classList.add('done');
      document.getElementById(steps[i - 1]).textContent = '✓ ' + document.getElementById(steps[i - 1]).textContent.replace('✓ ', '');
    }
    if (i < steps.length) {
      document.getElementById(steps[i]).classList.add('active');
      i++;
    } else {
      clearInterval(interval);
    }
  }, 1200);
  return interval;
}

async function optimizeResume() {
  const resume = document.getElementById('resumeInput').value.trim();
  const jd = document.getElementById('jdInput').value.trim();
  const lowCreditMode = document.getElementById('lowCreditMode')?.checked || false;

  if (!resume) return showError('Please paste your resume text.');
  if (!jd) return showError('Please paste the job description.');

  setProviderBadge('Provider: Processing...');

  const btn = document.getElementById('optimizeBtn');
  btn.disabled = true;
  currentOriginalResumeText = resume;

  if (lowCreditMode) {
    showToast('Low Credit Mode enabled: using smaller model output budget.', '#f59e0b');
  }

  document.getElementById('loadingOverlay').style.display = 'flex';
  const stepInterval = animateSteps();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 140000);

  try {
    const response = await fetch('/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, jd, low_credit_mode: lowCreditMode }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.json();
    clearInterval(stepInterval);

    if (!response.ok || data.error) {
      throw new Error(data.error || 'Unknown error');
    }

    setProviderBadge(inferProviderLabel(data));

    if (data.notice) {
      showToast(data.notice, '#f59e0b');
    }

    document.getElementById('loadingOverlay').style.display = 'none';
    renderResults(data);
    persistBuilderState();

  } catch (err) {
    clearTimeout(timeoutId);
    clearInterval(stepInterval);
    document.getElementById('loadingOverlay').style.display = 'none';
    btn.disabled = false;
    if (err.name === 'AbortError') {
      setProviderBadge('Provider: Request timed out');
      showError('Request timed out. Try a shorter JD or resume, then retry.');
      return;
    }
    setProviderBadge('Provider: Error (check API keys)');
    showError(err.message || 'Something went wrong. Please try again.');
  }
}

async function generateCoverLetterOnly() {
  const resume = document.getElementById('resumeInput').value.trim();
  const jd = document.getElementById('jdInput').value.trim();
  const lowCreditMode = document.getElementById('lowCreditMode')?.checked || false;

  if (!resume) return showError('Please paste your resume text.');
  if (!jd) return showError('Please paste the job description.');

  setProviderBadge('Provider: Processing cover letter...');

  const btn = document.getElementById('coverLetterBtn');
  btn.disabled = true;

  if (lowCreditMode) {
    showToast('Low Credit Mode enabled: using smaller model output budget.', '#f59e0b');
  }

  try {
    const response = await fetch('/generate-cover-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, jd, low_credit_mode: lowCreditMode })
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Unknown error');
    }

    const cover = data.cover_letter || data;
    currentCoverLetterData = cover;
    currentOriginalResumeText = resume;
    setProviderBadge(inferProviderLabel(data));

    if (data.notice) {
      showToast(data.notice, '#f59e0b');
    }

    document.getElementById('inputSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    const standalone = document.getElementById('coverLetterStandaloneSection');
    standalone.style.display = 'block';
    document.getElementById('coverLetterStandaloneContent').innerHTML = '';
    renderStandaloneCoverLetter(cover);
    standalone.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    setProviderBadge('Provider: Error (check API keys)');
    showError(err.message || 'Something went wrong. Please try again.');
  } finally {
    btn.disabled = false;
  }
}

async function generateCoverLetterFromResults() {
  const resume = currentOriginalResumeText || document.getElementById('resumeInput').value.trim();
  const jd = document.getElementById('jdInput').value.trim();
  const lowCreditMode = document.getElementById('lowCreditMode')?.checked || false;

  const btn = document.getElementById('coverLetterBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Generating...';
  }
  setProviderBadge('Provider: Processing cover letter...');

  try {
    const response = await fetch('/generate-cover-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, jd, low_credit_mode: lowCreditMode })
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || 'Unknown error');
    }

    currentCoverLetterData = data.cover_letter || data;
    setProviderBadge(inferProviderLabel(data));

    if (data.notice) {
      showToast(data.notice, '#f59e0b');
    }

    const promptArea = document.getElementById('coverLetterPromptArea');
    if (promptArea) promptArea.style.display = 'none';

    renderCoverLetter(currentCoverLetterData);
    
    // Scroll down slightly so they see it
    const outputArea = document.getElementById('coverLetterOutput');
    if (outputArea) {
      outputArea.scrollIntoView({ behavior: 'smooth' });
    }

    persistBuilderState();
  } catch (err) {
    setProviderBadge('Provider: Error');
    showError(err.message || 'Failed to generate cover letter.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">📝</span> Yes, Generate Cover Letter';
    }
  }
}

function renderResults(data, options = {}) {
  const shouldScroll = options.scroll !== false;
  const shouldPersist = options.persist !== false;

  document.getElementById('inputSection').style.display = 'none';
  const results = document.getElementById('resultsSection');
  results.style.display = 'block';

  lastOptimizeResponse = data;
  const resume = data.optimized_resume;
  currentResumeData = resume;
  currentCoverLetterData = data.cover_letter || null;

  // ATS Score
  const score = Number(
    (data.ats_score && typeof data.ats_score === 'object' ? data.ats_score.total : data.ats_score) ||
    data.ats_score_total ||
    0
  );
  animateScore(score);

  const breakdownEl = document.getElementById('scoreBreakdown');
  if (breakdownEl) {
    if (data.ats_score && data.ats_score.breakdown) {
      const tech = data.ats_score.breakdown.local_technical_match || 0;
      const struct = data.ats_score.breakdown.structural_score || 0;
      const ai = data.ats_score.breakdown.ai_alignment_score || 0;
      breakdownEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 8px;">
          <div style="display: flex; gap: 12px; justify-content: center; font-size: 11px; font-weight: 600;">
            <span style="color: #34d399;">🎯 Tech Fit: ${tech}/60</span>
            <span style="color: #60a5fa;">🏗️ Structure: ${struct}/25</span>
            <span style="color: #c084fc;">🤖 AI Fit: ${ai}/15</span>
          </div>
          <a href="javascript:void(0)" onclick="openAtsDrawer()" style="color: var(--accent); font-size: 11px; font-weight: 700; text-decoration: underline; margin-top: 4px; display: inline-block;" class="hover:text-accent-hover">
            🔍 View Deep-Dive ATS Breakdown Report
          </a>
        </div>
      `;
    } else {
      breakdownEl.innerHTML = '';
    }
  }

  // Missing keywords
  const missing = data.missing_keywords || (data.keyword_analysis && data.keyword_analysis.missing_keywords) || [];
  const missingEl = document.getElementById('missingKeywords');
  missingEl.innerHTML = missing.length
    ? missing.map(k => `<span class="tag tag-red">${escapeHtml(k)}</span>`).join('')
    : '<span style="color:var(--green);font-size:13px">✓ No critical keywords missing</span>';

  // Matched keywords
  const matched =
    (data.analysis && data.analysis.matched_keywords) ||
    (data.keyword_analysis && data.keyword_analysis.matched_in_resume) ||
    [];
  document.getElementById('matchedKeywords').innerHTML = matched.length
    ? matched.slice(0, 12).map(k => `<span class="tag tag-green">${escapeHtml(k)}</span>`).join('')
    : '<span style="color:var(--text-muted);font-size:13px">—</span>';

  // Improvements
  const improvements = data.improvements || [];
  document.getElementById('improvementsList').innerHTML =
    improvements.map(i => `<li>${escapeHtml(i)}</li>`).join('');

  // Resume Content
  renderResumeHTML(resume);
  renderCoverLetter(currentCoverLetterData);
  
  const promptArea = document.getElementById('coverLetterPromptArea');
  if (promptArea) {
    promptArea.style.display = currentCoverLetterData ? 'none' : 'block';
  }

  if (shouldPersist) {
    persistBuilderState();
  }

  if (shouldScroll) {
    results.scrollIntoView({ behavior: 'smooth' });
  }
}

function animateScore(score) {
  const ring = document.getElementById('ringFill');
  const numEl = document.getElementById('scoreNum');
  const circumference = 314;

  // Color based on score
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  ring.style.stroke = color;

  let current = 0;
  const step = score / 60;
  const timer = setInterval(() => {
    current = Math.min(current + step, score);
    numEl.textContent = Math.round(current) + '%';
    ring.style.strokeDashoffset = circumference - (circumference * current / 100);
    if (current >= score) clearInterval(timer);
  }, 16);
}

function renderResumeHTML(resume) {
  resume = {
    ...(resume || {}),
    education: (resume?.education || []).map((edu) => ({
      ...edu,
      degree: escapeHtml(edu?.degree || ''),
      institution: escapeHtml(edu?.institution || ''),
      year: escapeHtml(edu?.year || ''),
      details: escapeHtml(edu?.details || ''),
    })),
    certifications: (resume?.certifications || []).map((cert) => {
      if (typeof cert === 'string') return cert;
      return {
        ...cert,
        name: escapeHtml(cert?.name || ''),
        issuer: escapeHtml(cert?.issuer || ''),
        year: escapeHtml(cert?.year || ''),
      };
    }),
  };
  let html = '';

  // Summary
  if (resume.summary) {
    html += `<div class="r-section">
      <div class="r-section-title">Professional Summary</div>
      <div class="r-summary editable-field" contenteditable="true" oninput="updateSummary(this)">${escapeHtml(resume.summary)}</div>
    </div>`;
  }

  // Skills
  const skills = resume.skills || {};
  const hasSkills = Object.values(skills).some(arr => arr && arr.length > 0);
  if (hasSkills) {
    html += `<div class="r-section"><div class="r-section-title">Skills</div><div class="r-skills-grid">`;
    for (const [cat, list] of Object.entries(skills)) {
      if (list && list.length > 0) {
        html += `<div class="r-skill-row">
          <span class="r-skill-cat editable-field" contenteditable="true" oninput="updateSkillCategory(this, '${escapeHtml(cat)}')">${escapeHtml(cat)}</span>
          <div class="r-skill-tags">${list.map((s, sIdx) => `<span class="r-skill-tag editable-field" contenteditable="true" oninput="updateSkillTag(this, '${escapeHtml(cat)}', ${sIdx})">${escapeHtml(s)}</span>`).join('')}</div>
        </div>`;
      }
    }
    html += `</div></div>`;
  }

  // Experience
  const experience = resume.experience || [];
  if (experience.length > 0) {
    html += `<div class="r-section"><div class="r-section-title">Experience</div>`;
    experience.forEach((exp, expIdx) => {
      html += `<div class="r-exp-item">
        <div class="r-exp-header">
          <span class="r-exp-title editable-field" contenteditable="true" oninput="updateExperienceField(this, ${expIdx}, 'title')">${escapeHtml(exp.title || '')}</span>
          <span class="r-exp-duration editable-field" contenteditable="true" oninput="updateExperienceField(this, ${expIdx}, 'duration')">${escapeHtml(exp.duration || '')}</span>
        </div>
        <div class="r-exp-company editable-field" contenteditable="true" oninput="updateExperienceField(this, ${expIdx}, 'company')">${escapeHtml(exp.company || '')}</div>
        <ul class="r-bullets">${(exp.bullets || []).map((b, bIdx) => {
          return `<li class="group relative pr-8">
            <span class="bullet-text editable-field" contenteditable="true" oninput="updateExperienceBullet(this, ${expIdx}, ${bIdx})">${escapeHtml(b)}</span>
            <button class="boost-trigger-btn absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-electricBlue hover:text-energeticOrange cursor-pointer border-none bg-transparent text-sm p-1" 
                    onclick="event.stopPropagation(); openBulletDrawer('experience', ${expIdx}, ${bIdx})" 
                    title="Boost with AI metrics" style="right: 8px;">
              ⚡
            </button>
          </li>`;
        }).join('')}</ul>
      </div>`;
    });
    html += `</div>`;
  }

  // Projects
  const projects = resume.projects || [];
  if (projects.length > 0) {
    html += `<div class="r-section"><div class="r-section-title">Projects</div>`;
    projects.forEach((proj, projIdx) => {
      html += `<div class="r-proj-item">
        <div class="r-proj-name editable-field" contenteditable="true" oninput="updateProjectField(this, ${projIdx}, 'name')">${escapeHtml(proj.name || '')}</div>
        <div class="r-proj-tech editable-field" contenteditable="true" oninput="updateProjectField(this, ${projIdx}, 'tech')">${escapeHtml(proj.tech || '')}</div>
        <ul class="r-bullets">${(proj.bullets || []).map((b, bIdx) => {
          return `<li class="group relative pr-8">
            <span class="bullet-text editable-field" contenteditable="true" oninput="updateProjectBullet(this, ${projIdx}, ${bIdx})">${escapeHtml(b)}</span>
            <button class="boost-trigger-btn absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-electricBlue hover:text-energeticOrange cursor-pointer border-none bg-transparent text-sm p-1" 
                    onclick="event.stopPropagation(); openBulletDrawer('project', ${projIdx}, ${bIdx})" 
                    title="Boost with AI metrics" style="right: 8px;">
              ⚡
            </button>
          </li>`;
        }).join('')}</ul>
      </div>`;
    });
    html += `</div>`;
  }

  // Education
  const education = resume.education || [];
  if (education.length > 0) {
    html += `<div class="r-section"><div class="r-section-title">Education</div>`;
    education.forEach((edu, eduIdx) => {
      html += `<div class="r-edu-item">
        <div class="r-edu-degree">
          <span class="editable-field" contenteditable="true" oninput="updateEducationField(this, ${eduIdx}, 'degree')">${edu.degree || ''}</span>
          ${edu.year ? ` — <span class="editable-field" contenteditable="true" oninput="updateEducationField(this, ${eduIdx}, 'year')">${edu.year}</span>` : ''}
        </div>
        <div class="r-edu-inst editable-field" contenteditable="true" oninput="updateEducationField(this, ${eduIdx}, 'institution')">${edu.institution || ''}</div>
        ${edu.details ? `<div class="editable-field" contenteditable="true" oninput="updateEducationField(this, ${eduIdx}, 'details')" style="font-size:13px;color:var(--text-muted);margin-top:2px">${edu.details}</div>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // Certifications
  const certifications = resume.certifications || [];
  if (certifications.length > 0) {
    html += `<div class="r-section"><div class="r-section-title">Certifications</div>`;
    certifications.forEach((cert, certIdx) => {
      if (typeof cert === 'string') {
        html += `<div class="r-edu-item"><div class="r-edu-degree editable-field" contenteditable="true" oninput="updateCertificationField(this, ${certIdx}, 'name')">${escapeHtml(cert)}</div></div>`;
      } else {
        html += `<div class="r-edu-item">
          <div class="r-edu-degree">
            <span class="editable-field" contenteditable="true" oninput="updateCertificationField(this, ${certIdx}, 'name')">${cert.name || ''}</span>
            ${cert.year ? ` — <span class="editable-field" contenteditable="true" oninput="updateCertificationField(this, ${certIdx}, 'year')">${cert.year}</span>` : ''}
          </div>
          <div class="r-edu-inst editable-field" contenteditable="true" oninput="updateCertificationField(this, ${certIdx}, 'issuer')">${cert.issuer || ''}</div>
        </div>`;
      }
    });
    html += `</div>`;
  }

  document.getElementById('resumeContent').innerHTML = html;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getCoverLetterBody(cover) {
  if (!cover) return [];
  if (typeof cover === 'string') {
    return cover.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  }
  if (typeof cover.body === 'string' && cover.body.trim()) {
    return cover.body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  }
  if (Array.isArray(cover.body_paragraphs)) {
    return cover.body_paragraphs.map(p => String(p).trim()).filter(Boolean);
  }
  if (typeof cover.body_paragraphs === 'string') {
    return cover.body_paragraphs.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  }
  return [];
}

function buildCoverLetterText(cover) {
  if (!cover) return '';
  const body = getCoverLetterBody(cover);
  const company = typeof cover === 'object' ? (cover.company_name || '') : '';
  const subject = typeof cover === 'object' ? (cover.subject || cover.subject_line || '') : '';
  const hiringManager = typeof cover === 'object' ? (cover.hiring_manager || 'Hiring Manager') : 'Hiring Manager';
  const closing = typeof cover === 'object' ? (cover.closing || 'Sincerely') : 'Sincerely';
  const signature = typeof cover === 'object' ? (cover.signature_name || '') : '';

  let text = '';
  if (company) text += `${company}\n`;
  text += `Dear ${hiringManager},\n\n`;
  if (subject) text += `Subject: ${subject}\n\n`;
  text += `${body.join('\n\n')}\n\n${closing},\n${signature}`.trim();
  return text.trim();
}

function renderCoverLetter(cover) {
  const wrapper = document.getElementById('coverLetterOutput');
  const content = document.getElementById('coverLetterContent');

  const text = buildCoverLetterText(cover);
  if (!text) {
    wrapper.style.display = 'none';
    content.innerHTML = '';
    return;
  }

  wrapper.style.display = 'block';
  content.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
}

function renderStandaloneCoverLetter(cover) {
  const content = document.getElementById('coverLetterStandaloneContent');
  const text = buildCoverLetterText(cover);
  if (!text) {
    content.innerHTML = '<div style="color:var(--text-muted)">No cover letter generated.</div>';
    return;
  }
  content.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
}

function copyToClipboard() {
  if (!currentResumeData) return;
  const text = buildPlainText(currentResumeData);
  navigator.clipboard.writeText(text).then(() => {
    showToast('✓ Copied to clipboard!', '#22c55e');
  });
}

function buildPlainText(resume) {
  let text = '';
  if (resume.summary) text += `PROFESSIONAL SUMMARY\n${resume.summary}\n\n`;

  const skills = resume.skills || {};
  const hasSkills = Object.values(skills).some(a => a && a.length > 0);
  if (hasSkills) {
    text += 'SKILLS\n';
    for (const [cat, list] of Object.entries(skills)) {
      if (list && list.length > 0) text += `${cat}: ${list.join(', ')}\n`;
    }
    text += '\n';
  }

  const experience = resume.experience || [];
  if (experience.length > 0) {
    text += 'EXPERIENCE\n';
    for (const exp of experience) {
      text += `${exp.title} — ${exp.company} (${exp.duration})\n`;
      for (const b of exp.bullets || []) text += `• ${b}\n`;
      text += '\n';
    }
  }

  const projects = resume.projects || [];
  if (projects.length > 0) {
    text += 'PROJECTS\n';
    for (const proj of projects) {
      text += `${proj.name} | ${proj.tech}\n`;
      for (const b of proj.bullets || []) text += `• ${b}\n`;
      text += '\n';
    }
  }

  const education = resume.education || [];
  if (education.length > 0) {
    text += 'EDUCATION\n';
    for (const edu of education) {
      text += `${edu.degree} — ${edu.institution} (${edu.year})\n`;
      if (edu.details) text += `${edu.details}\n`;
    }
    text += '\n';
  }

  const certifications = resume.certifications || [];
  if (certifications.length > 0) {
    text += 'CERTIFICATIONS\n';
    for (const cert of certifications) {
      if (typeof cert === 'string') {
        text += `${cert}\n`;
      } else {
        const line = [cert.name, cert.issuer, cert.year].filter(Boolean).join(' — ');
        if (line) text += `${line}\n`;
      }
    }
  }
  return text;
}

async function exportDocx() {
  if (!currentResumeData) return;
  try {
    const response = await fetch('/export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resume_data: currentResumeData,
        original_resume: currentOriginalResumeText
      })
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'optimized_resume.docx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showError('Failed to export: ' + err.message);
  }
}

function copyCoverLetter() {
  if (!currentCoverLetterData) return;
  const text = buildCoverLetterText(currentCoverLetterData);
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('✓ Cover letter copied!', '#22c55e');
  });
}

async function exportCoverLetterDocx() {
  if (!currentCoverLetterData) return;
  try {
    const response = await fetch('/export-cover-letter-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cover_letter: currentCoverLetterData,
        resume_data: currentResumeData,
        original_resume: currentOriginalResumeText
      })
    });
    if (!response.ok) throw new Error('Cover letter export failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cover_letter.docx';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showError('Failed to export cover letter: ' + err.message);
  }
}

function resetForm() {
  document.getElementById('resultsSection').style.display = 'none';
  document.getElementById('coverLetterStandaloneSection').style.display = 'none';
  document.getElementById('inputSection').style.display = 'block';
  document.getElementById('optimizeBtn').disabled = false;
  const coverLetterBtn = document.getElementById('coverLetterBtn');
  if (coverLetterBtn) coverLetterBtn.disabled = false;
  // Reset loading steps
  ['step1','step2','step3','step4'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.className = 'step';
    const labels = ['Extracting JD keywords','Identifying gaps','Rewriting bullet points','Calculating ATS score'];
    el.textContent = labels[i];
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  currentResumeData = null;
  currentCoverLetterData = null;
  currentOriginalResumeText = '';
  lastOptimizeResponse = null;
  document.getElementById('coverLetterOutput').style.display = 'none';
  document.getElementById('coverLetterContent').innerHTML = '';
  document.getElementById('coverLetterStandaloneContent').innerHTML = '';
  setProviderBadge('Provider: Auto');
  clearBuilderState();
}

function showError(msg) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = '⚠ ' + msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showToast(msg, color = '#4f8ef7') {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.style.background = color;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

const lowCreditModeEl = document.getElementById('lowCreditMode');
if (lowCreditModeEl) {
  lowCreditModeEl.addEventListener('change', () => {
    persistBuilderState();
  });
}

const generatePacketBtn = document.getElementById('generatePacketBtn');
if (generatePacketBtn) {
  generatePacketBtn.addEventListener('click', () => {
    generateAutoPacket();
  });
}

const queueJobBtn = document.getElementById('queueJobBtn');
if (queueJobBtn) {
  queueJobBtn.addEventListener('click', () => {
    queueAutoJob().catch((error) => showError(error.message || 'Could not queue job'));
  });
}

const copyPacketBtn = document.getElementById('copyPacketBtn');
if (copyPacketBtn) {
  copyPacketBtn.addEventListener('click', copyAutoPacketNotes);
}

const generateLatexBtn = document.getElementById('generateLatexBtn');
if (generateLatexBtn) {
  generateLatexBtn.addEventListener('click', generateLatexResume);
}

const copyLatexBtn = document.getElementById('copyLatexBtn');
if (copyLatexBtn) {
  copyLatexBtn.addEventListener('click', copyLatexSource);
}

const downloadLatexBtn = document.getElementById('downloadLatexBtn');
if (downloadLatexBtn) {
  downloadLatexBtn.addEventListener('click', downloadLatexSource);
}

const downloadLatexPdfBtn = document.getElementById('downloadLatexPdfBtn');
if (downloadLatexPdfBtn) {
  downloadLatexPdfBtn.addEventListener('click', downloadLatexPdf);
}

const downloadLatexDocxBtn = document.getElementById('downloadLatexDocxBtn');
if (downloadLatexDocxBtn) {
  downloadLatexDocxBtn.addEventListener('click', downloadLatexDocx);
}

const latexTemplateIdEl = document.getElementById('latexTemplateId');
if (latexTemplateIdEl) {
  latexTemplateIdEl.addEventListener('change', () => {
    generateLatexResume();
  });
}

const autoJobFields = ['autoTitle', 'autoCompany', 'autoLocation', 'autoSource', 'autoJobUrl', 'autoNotes', 'autoJobDescription'];
autoJobFields.forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', renderAutoQueue);
  }
});

const descBox = document.getElementById('autoJobDescription');
if (descBox) {
  descBox.addEventListener('mouseenter', () => document.getElementById('rightSidebarToken').classList.add('highlight'));
  descBox.addEventListener('mouseleave', () => document.getElementById('rightSidebarToken').classList.remove('highlight'));
}

async function loadAdminStats() {
  try {
    const response = await fetch('/api/admin/dashboard-stats');
    if (!response.ok) {
      if (response.status === 403 || response.status === 401) {
        showError("Unauthorized to view admin panel.");
      }
      return;
    }
    const data = await response.json();
    document.getElementById('adminTotalUsers').textContent = data.total_users || 0;
    document.getElementById('adminTotalApps').textContent = data.total_applications || 0;
    
    const tbody = document.getElementById('adminRecentUsersList');
    if (tbody) {
      tbody.innerHTML = data.recent_users.map(u => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: #cbd5e1;">
          <td style="padding: 16px;">${u.id}</td>
          <td style="padding: 16px; font-weight: 500;">${escapeHtml(u.name)}</td>
          <td style="padding: 16px; color: #3b82f6;">${escapeHtml(u.email)}</td>
          <td style="padding: 16px;">
            <span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: ${u.role === 'admin' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)'}; color: ${u.role === 'admin' ? '#4ade80' : '#94a3b8'}; border: 1px solid ${u.role === 'admin' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)'}; text-transform: uppercase;">
              ${escapeHtml(u.role)}
            </span>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error("Failed to load admin stats", err);
    showError("Could not connect to admin services.");
  }
}

async function checkSessionStatus() {
  try {
    const response = await fetch('/auth/session');
    if (!response.ok) return;
    const data = await response.json();

    const loggedOutDiv = document.getElementById('rightSidebarLoggedOut');
    const loggedInDiv = document.getElementById('rightSidebarLoggedIn');

    if (data.authenticated && data.user) {
      if (loggedOutDiv) loggedOutDiv.style.display = 'none';
      if (loggedInDiv) {
        loggedInDiv.style.display = 'block';
        const emailEl = document.getElementById('rightSidebarEmail');
        if (emailEl) emailEl.textContent = data.user.email;
        
        const signOutBtn = document.getElementById('authSignOutBtn');
        if (signOutBtn) {
          signOutBtn.onclick = async () => {
            await fetch('/auth/logout', { method: 'POST' });
            window.location.reload();
          };
        }
      }

      const leftSidebarName = document.getElementById('sidebar-username');
      if (leftSidebarName) {
        leftSidebarName.textContent = data.user.name;
      }
      const leftSidebarInitial = document.getElementById('sidebar-user-initial');
      if (leftSidebarInitial) {
        leftSidebarInitial.textContent = String(data.user.name).substring(0, 1).toUpperCase();
      }

      // Update pricing plan displays dynamically
      const plan = String(data.user.plan || 'free').toLowerCase();
      const planDisplay = plan === 'premium' ? 'Premium Elite' : (plan === 'pro' ? 'Pro Professional' : 'Standard Free');
      
      const leftSidebarPlan = document.getElementById('sidebar-userplan');
      if (leftSidebarPlan) leftSidebarPlan.textContent = planDisplay;
      
      const rightSidebarPlan = document.getElementById('rightSidebarUserPlan');
      if (rightSidebarPlan) rightSidebarPlan.textContent = 'Plan: ' + planDisplay;
      
      // Update pricing buttons state
      const proBtn = document.getElementById('stripeCheckoutProBtn');
      const premiumBtn = document.getElementById('stripeCheckoutPremiumBtn');
      
      if (plan === 'pro') {
        if (proBtn) {
          proBtn.textContent = 'Current Pro Plan';
          proBtn.disabled = true;
          proBtn.style.background = 'rgba(255,255,255,0.05)';
          proBtn.style.color = '#94a3b8';
          proBtn.style.border = '1px solid rgba(255,255,255,0.1)';
          proBtn.style.boxShadow = 'none';
        }
        if (premiumBtn) {
          premiumBtn.textContent = 'Upgrade to Premium';
          premiumBtn.disabled = false;
        }
      } else if (plan === 'premium') {
        if (proBtn) {
          proBtn.textContent = 'Pro Tier';
          proBtn.disabled = true;
          proBtn.style.background = 'rgba(255,255,255,0.05)';
          proBtn.style.color = '#94a3b8';
          proBtn.style.border = '1px solid rgba(255,255,255,0.1)';
          proBtn.style.boxShadow = 'none';
        }
        if (premiumBtn) {
          premiumBtn.textContent = 'Current Premium Elite';
          premiumBtn.disabled = true;
          premiumBtn.style.background = 'rgba(255,255,255,0.05)';
          premiumBtn.style.color = '#cbd5e1';
          premiumBtn.style.border = '1px solid rgba(255,255,255,0.1)';
          premiumBtn.style.boxShadow = 'none';
        }
      }
      
      // Show Customer Portal button if they have a Stripe Customer ID or mock Customer ID
      const portalContainer = document.getElementById('stripePortalContainer');
      if (portalContainer) {
        if (data.user.stripe_customer_id) {
          portalContainer.style.display = 'block';
        } else {
          portalContainer.style.display = 'none';
        }
      }

      // Check role for admin link visibility
      const adminNavLink = document.getElementById('adminNavLink');
      if (adminNavLink) {
        if (data.user.role === 'admin') {
          adminNavLink.classList.remove('hidden');
          adminNavLink.classList.add('flex');
        } else {
          adminNavLink.classList.add('hidden');
          adminNavLink.classList.remove('flex');
        }
      }
    } else {
      if (loggedOutDiv) loggedOutDiv.style.display = 'block';
      if (loggedInDiv) loggedInDiv.style.display = 'none';
      
      const adminNavLink = document.getElementById('adminNavLink');
      if (adminNavLink) {
        adminNavLink.classList.add('hidden');
        adminNavLink.classList.remove('flex');
      }
    }
  } catch (error) {
    console.error('Session check failed', error);
  }
}

function initializeThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  const btnMobile = document.getElementById('themeToggleBtnMobile');
  
  function updateToggleIcons(theme) {
    const iconSpan = document.getElementById('themeToggleIcon');
    const iconSpanMobile = document.getElementById('themeToggleIconMobile');
    const emoji = theme === 'dark' ? '🌙' : '☀️';
    if (iconSpan) iconSpan.textContent = emoji;
    if (iconSpanMobile) iconSpanMobile.textContent = emoji;
  }
  
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateToggleIcons(newTheme);
  }
  
  const savedTheme = localStorage.getItem('theme') || 'light';
  updateToggleIcons(savedTheme);
  
  if (btn) btn.addEventListener('click', toggleTheme);
  if (btnMobile) btnMobile.addEventListener('click', toggleTheme);
}

function handleUrlParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    const prefillJd = params.get('prefill_jd');
    if (prefillJd) {
      const jdInput = document.getElementById('jdInput');
      if (jdInput) {
        jdInput.value = prefillJd;
        // Trigger input event to update character counter
        const event = new Event('input', { bubbles: true });
        jdInput.dispatchEvent(event);
      }
      // Redirect hash to builder and apply layout changes
      window.location.hash = '#inputSection';
      applyPageModeFromHash();
    }
  } catch (e) {
    console.error("Error handling url params:", e);
  }
}

function openPricingDrawer() {
  const drawer = document.getElementById('pricingDrawer');
  const overlay = document.getElementById('pricingDrawerOverlay');
  if (drawer) drawer.classList.add('open');
  if (overlay) overlay.classList.add('open');
}

function closePricingDrawer() {
  const drawer = document.getElementById('pricingDrawer');
  const overlay = document.getElementById('pricingDrawerOverlay');
  if (drawer) drawer.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

async function checkoutPlan(planTier) {
  const proBtn = document.getElementById('stripeCheckoutProBtn');
  const premiumBtn = document.getElementById('stripeCheckoutPremiumBtn');
  
  if (proBtn) proBtn.disabled = true;
  if (premiumBtn) premiumBtn.disabled = true;
  
  try {
    const response = await fetch('/billing/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ plan: planTier })
    });
    
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Checkout failed');
    }
    
    if (data.url) {
      if (data.sandbox) {
        showToast(data.message || 'Sandbox plan activated!', '#10b981');
        setTimeout(() => {
          window.location.href = data.url;
        }, 1500);
      } else {
        window.location.href = data.url;
      }
    } else {
      throw new Error('No checkout URL returned.');
    }
  } catch (err) {
    showError(err.message || 'Stripe redirect failed');
    if (proBtn) proBtn.disabled = false;
    if (premiumBtn) premiumBtn.disabled = false;
  }
}

loadHomeOverview();
bindSidebarHandlers();
applyPageModeFromHash();
checkSessionStatus();
initializeThemeToggle();
handleUrlParams();
window.addEventListener('DOMContentLoaded', () => {
  applyPageModeFromHash();
  handleUrlParams();
});
window.addEventListener('hashchange', applyPageModeFromHash);

/* --- AI BULLET BOOSTER DRAWER CONTROLS --- */
let currentBoostingBullet = null;

function openBulletDrawer(type, parentIdx, bulletIdx) {
  const resume = currentResumeData;
  if (!resume) return;
  
  let bulletText = '';
  if (type === 'experience') {
    bulletText = resume.experience[parentIdx].bullets[bulletIdx];
  } else if (type === 'project') {
    bulletText = resume.projects[parentIdx].bullets[bulletIdx];
  }
  
  currentBoostingBullet = { type, parentIdx, bulletIdx, text: bulletText };
  
  document.getElementById('drawerOriginalText').textContent = bulletText;
  
  let inferredRole = '';
  if (type === 'experience') {
    inferredRole = resume.experience[parentIdx].title || '';
  } else if (type === 'project') {
    inferredRole = (resume.experience && resume.experience[0]?.title) || '';
  }
  
  if (!inferredRole) {
    inferredRole = document.getElementById('autoTitle')?.value.trim() || '';
  }
  
  document.getElementById('drawerTargetRole').value = inferredRole;
  
  const jdInput = document.getElementById('jdInput');
  document.getElementById('drawerJdContext').value = jdInput ? jdInput.value.trim() : '';
  
  document.getElementById('drawerVariationsContainer').innerHTML = `
    <div class="text-xs text-center py-8" style="color: var(--text-muted);">
      Click "Boost Bullet Point" to generate impact-driven X-Y-Z variations.
    </div>
  `;
  
  document.getElementById('bulletDrawer').classList.add('open');
  document.getElementById('bulletDrawerOverlay').classList.add('open');
}

function closeBulletDrawer() {
  document.getElementById('bulletDrawer').classList.remove('open');
  document.getElementById('bulletDrawerOverlay').classList.remove('open');
  currentBoostingBullet = null;
}

async function boostBulletAction() {
  if (!currentBoostingBullet) return;
  
  const btn = document.getElementById('boostBulletBtn');
  const role = document.getElementById('drawerTargetRole').value.trim();
  const jdContext = document.getElementById('drawerJdContext').value.trim();
  const variationsContainer = document.getElementById('drawerVariationsContainer');
  
  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Boosting...';
  
  variationsContainer.innerHTML = `
    <div class="text-xs text-center py-8" style="color: var(--text-muted);">
      <div class="spinner" style="width:24px;height:24px;border-width:2px;margin-bottom:12px;"></div>
      Analyzing bullet context and orchestrating X-Y-Z metrics...
    </div>
  `;
  
  try {
    const response = await fetch('/boost-bullet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bullet: currentBoostingBullet.text,
        role: role,
        jd_context: jdContext
      })
    });
    
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Optimization request failed');
    
    const variations = data.variations || [];
    if (variations.length === 0) throw new Error('No variations generated');
    
    let html = '';
    variations.forEach((variation, idx) => {
      html += `
        <div class="drawer-variation-item">
          <div class="drawer-variation-text">${escapeHtml(variation)}</div>
          <div class="drawer-variation-actions">
            <button class="drawer-variation-btn" onclick="copyVariationText(this, ${idx})">Copy</button>
            <button class="drawer-variation-btn apply" onclick="applyBoostedBullet(${idx})">Apply</button>
          </div>
        </div>
      `;
    });
    
    variationsContainer.innerHTML = html;
    variationsContainer.dataset.variations = JSON.stringify(variations);
    
    showToast('Bullet optimizations generated!', '#22c55e');
  } catch (err) {
    showError(err.message || 'Could not optimize bullet.');
    variationsContainer.innerHTML = `
      <div class="text-xs text-center py-8" style="color: #ef4444;">
        Failed to generate variations: ${escapeHtml(err.message)}
      </div>
    `;
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function copyVariationText(btn, idx) {
  const container = document.getElementById('drawerVariationsContainer');
  const variations = JSON.parse(container.dataset.variations || '[]');
  const text = variations[idx];
  if (!text) return;
  
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
    showToast('Variation copied to clipboard!', '#22c55e');
  });
}

function applyBoostedBullet(idx) {
  if (!currentBoostingBullet || !currentResumeData) return;
  
  const container = document.getElementById('drawerVariationsContainer');
  const variations = JSON.parse(container.dataset.variations || '[]');
  const newText = variations[idx];
  if (!newText) return;
  
  const { type, parentIdx, bulletIdx } = currentBoostingBullet;
  
  if (type === 'experience') {
    currentResumeData.experience[parentIdx].bullets[bulletIdx] = newText;
  } else if (type === 'project') {
    currentResumeData.projects[parentIdx].bullets[bulletIdx] = newText;
  }
  
  renderResumeHTML(currentResumeData);
  persistBuilderState();
  
  showToast('✓ Bullet updated in resume!', '#22c55e');
  closeBulletDrawer();
}

/* --- WYSIWYG MODEL UPDATE HANDLERS & DEBOUNCER --- */
let autoSaveTimeout = null;

function triggerTelemetrySaving() {
  const dot = document.getElementById('saveTelemetryDot');
  const text = document.getElementById('saveTelemetryText');
  if (dot && text) {
    dot.className = 'save-status-dot saving';
    text.textContent = 'Saving...';
  }
}

function triggerTelemetrySynced() {
  const dot = document.getElementById('saveTelemetryDot');
  const text = document.getElementById('saveTelemetryText');
  if (dot && text) {
    dot.className = 'save-status-dot';
    text.textContent = 'Synced';
  }
}

function debouncedAutoSave(callback) {
  triggerTelemetrySaving();
  if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => {
    callback();
    persistBuilderState();
    triggerTelemetrySynced();
  }, 1000);
}

function updateSummary(el) {
  debouncedAutoSave(() => {
    if (currentResumeData) {
      currentResumeData.summary = el.innerText;
    }
  });
}

function updateExperienceField(el, expIdx, field) {
  debouncedAutoSave(() => {
    if (currentResumeData && currentResumeData.experience[expIdx]) {
      currentResumeData.experience[expIdx][field] = el.innerText;
    }
  });
}

function updateExperienceBullet(el, expIdx, bIdx) {
  debouncedAutoSave(() => {
    if (currentResumeData && currentResumeData.experience[expIdx] && currentResumeData.experience[expIdx].bullets) {
      currentResumeData.experience[expIdx].bullets[bIdx] = el.innerText;
    }
  });
}

function updateProjectField(el, projIdx, field) {
  debouncedAutoSave(() => {
    if (currentResumeData && currentResumeData.projects[projIdx]) {
      currentResumeData.projects[projIdx][field] = el.innerText;
    }
  });
}

function updateProjectBullet(el, projIdx, bIdx) {
  debouncedAutoSave(() => {
    if (currentResumeData && currentResumeData.projects[projIdx] && currentResumeData.projects[projIdx].bullets) {
      currentResumeData.projects[projIdx].bullets[bIdx] = el.innerText;
    }
  });
}

function updateEducationField(el, eduIdx, field) {
  debouncedAutoSave(() => {
    if (currentResumeData && currentResumeData.education[eduIdx]) {
      currentResumeData.education[eduIdx][field] = el.innerText;
    }
  });
}

function updateCertificationField(el, certIdx, field) {
  debouncedAutoSave(() => {
    if (currentResumeData && currentResumeData.certifications[certIdx]) {
      const cert = currentResumeData.certifications[certIdx];
      if (typeof cert === 'string') {
        currentResumeData.certifications[certIdx] = el.innerText;
      } else {
        currentResumeData.certifications[certIdx][field] = el.innerText;
      }
    }
  });
}

function updateSkillCategory(el, oldCat) {
  debouncedAutoSave(() => {
    if (currentResumeData && currentResumeData.skills) {
      const newCat = el.innerText.trim();
      if (newCat && newCat !== oldCat) {
        currentResumeData.skills[newCat] = currentResumeData.skills[oldCat];
        delete currentResumeData.skills[oldCat];
      }
    }
  });
}

function updateSkillTag(el, cat, sIdx) {
  debouncedAutoSave(() => {
    if (currentResumeData && currentResumeData.skills && currentResumeData.skills[cat]) {
      currentResumeData.skills[cat][sIdx] = el.innerText.trim();
    }
  });
}

/* --- DYNAMIC ATS SCR-BREAKDOWN DRAWER --- */
function openAtsDrawer() {
  const data = lastOptimizeResponse;
  if (!data) return;
  
  const drawer = document.getElementById('atsDrawer');
  const overlay = document.getElementById('atsDrawerOverlay');
  const content = document.getElementById('atsDrawerContent');
  
  if (!drawer || !overlay || !content) return;
  
  const score = Number(
    (data.ats_score && typeof data.ats_score === 'object' ? data.ats_score.total : data.ats_score) || 0
  );
  
  const breakdown = data.ats_score?.breakdown || {};
  const tech = breakdown.local_technical_match || 0;
  const struct = breakdown.structural_score || 0;
  const ai = breakdown.ai_alignment_score || 0;
  
  const kws = data.keyword_analysis || {};
  const matched = kws.matched_in_resume || [];
  const missing = kws.missing_keywords || [];
  const locationMatches = kws.matched_by_location || { experience: [], projects: [], skills: [], other: [] };
  
  const formatting = data.formatting_analysis || {
    sections_present: { experience: false, projects: false, skills: false, education: false },
    action_verbs_count: 0,
    action_verbs_found: [],
    metrics_count: 0,
    metrics_found: []
  };
  
  // Section badges
  const sectionsHtml = Object.entries(formatting.sections_present).map(([section, present]) => {
    const icon = present ? '✅' : '❌';
    const label = section.charAt(0).toUpperCase() + section.slice(1);
    const color = present ? '#34d399' : '#f87171';
    return `
      <div class="ats-check-item ${present ? 'success' : 'fail'}">
        <span style="font-weight:600; color: var(--text);">${label} Section</span>
        <span style="color: ${color}; font-weight:700;">${icon} ${present ? 'Found' : 'Missing'}</span>
      </div>
    `;
  }).join('');
  
  // Action verbs HTML
  const verbsHtml = formatting.action_verbs_count > 0 
    ? formatting.action_verbs_found.map(v => `<span class="tag tag-green">${v}</span>`).join('')
    : '<span style="color: var(--text-muted); font-size:12px;">No strong action verbs found. Try adding verbs like "Designed", "Spearheaded", "Optimized".</span>';
    
  // Metrics HTML
  const metricsHtml = formatting.metrics_count > 0
    ? formatting.metrics_found.map(m => `<span class="tag tag-blue">${m}</span>`).join('')
    : '<span style="color: var(--text-muted); font-size:12px;">No quantifiable metrics found. Recruiter guidelines recommend adding numbers, percentages (%), or currency amounts to show impact.</span>';
    
  // Matched by Location badges
  const expKwsHtml = (locationMatches.experience || []).map(k => `<span class="tag tag-green tag-exp">${k}</span>`).join('');
  const projKwsHtml = (locationMatches.projects || []).map(k => `<span class="tag tag-blue tag-proj">${k}</span>`).join('');
  const skillKwsHtml = (locationMatches.skills || []).map(k => `<span class="tag tag-orange tag-skills">${k}</span>`).join('');
  const otherKwsHtml = (locationMatches.other || []).map(k => `<span class="tag tag-gray">${k}</span>`).join('');
  
  const missingKwsHtml = missing.map(k => `<span class="tag tag-red">${k}</span>`).join('');
  
  content.innerHTML = `
    <!-- Overall Score Glowing Circle -->
    <div style="display:flex; flex-direction:column; align-items:center; gap:8px; padding: 16px; background: rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:12px;">
      <div style="font-size: 36px; font-weight: 900; color: #fbbf24; text-shadow: 0 0 15px rgba(251, 191, 36, 0.4);">${score}%</div>
      <div style="font-size: 11px; font-weight:700; color: var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Unified ATS Grade</div>
      <div style="font-size: 11px; text-align:center; color:#94a3b8; line-height:1.5; padding: 0 10px; margin-top: 4px;">
        ${data.ats_score?.score_reasoning || ''}
      </div>
    </div>
    
    <!-- Technical Keywords Card (60%) -->
    <div class="ats-drawer-card">
      <div class="ats-drawer-section-title">🎯 Technical Keyword Fit (${tech}/60)</div>
      <div class="ats-progress-bar-container">
        <div class="ats-progress-bar-fill tech" style="width: ${(tech/60 * 100)}%;"></div>
      </div>
      <div style="font-size: 11px; color:#94a3b8; line-height:1.5;">
        ATS matching awards **3x weight** for keywords in Professional Experience and **2x weight** for Projects.
      </div>
      
      <div style="display:flex; flex-direction:column; gap:12px; margin-top: 8px;">
        ${expKwsHtml ? `
          <div>
            <div style="font-size:10px; font-weight:700; color:#34d399; text-transform:uppercase; margin-bottom:4px;">💼 In Professional Experience (3.0x weight)</div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">${expKwsHtml}</div>
          </div>
        ` : ''}
        
        ${projKwsHtml ? `
          <div>
            <div style="font-size:10px; font-weight:700; color:#60a5fa; text-transform:uppercase; margin-bottom:4px;">🏗️ In Projects Section (2.0x weight)</div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">${projKwsHtml}</div>
          </div>
        ` : ''}
        
        ${skillKwsHtml ? `
          <div>
            <div style="font-size:10px; font-weight:700; color:#fbbf24; text-transform:uppercase; margin-bottom:4px;">🛠️ In Skills Lists (1.0x weight)</div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">${skillKwsHtml}</div>
          </div>
        ` : ''}
        
        ${otherKwsHtml ? `
          <div>
            <div style="font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-bottom:4px;">📝 In General Summary/Other (0.5x weight)</div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">${otherKwsHtml}</div>
          </div>
        ` : ''}
        
        ${missingKwsHtml ? `
          <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top:12px;">
            <div style="font-size:10px; font-weight:700; color:#f87171; text-transform:uppercase; margin-bottom:4px;">❌ Missing Keywords (Add to Resume)</div>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">${missingKwsHtml}</div>
          </div>
        ` : `
          <div style="color:#34d399; font-size:11px; font-weight:600; display:flex; align-items:center; gap:4px; border-top: 1px solid rgba(255,255,255,0.06); padding-top:12px;">
            ✓ You have successfully integrated all job-description keywords!
          </div>
        `}
      </div>
    </div>
    
    <!-- Formatting & Structure Card (25%) -->
    <div class="ats-drawer-card">
      <div class="ats-drawer-section-title">🏗️ Formatting & Structural Quality (${struct}/25)</div>
      <div class="ats-progress-bar-container">
        <div class="ats-progress-bar-fill struct" style="width: ${(struct/25 * 100)}%;"></div>
      </div>
      
      <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
        <div style="font-size: 11px; font-weight:700; color:var(--text); margin-bottom:2px;">Section Checklist</div>
        ${sectionsHtml}
      </div>
      
      <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top:12px; display:flex; flex-direction:column; gap:8px;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:11px; font-weight:700; color:var(--text);">Action Verbs found</span>
            <span style="font-size:10px; color:#34d399; font-weight:700;">Count: ${formatting.action_verbs_count}</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:4px;">${verbsHtml}</div>
        </div>
        
        <div style="margin-top:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:11px; font-weight:700; color:var(--text);">Quantifiable Results/Metrics</span>
            <span style="font-size:10px; color:#60a5fa; font-weight:700;">Count: ${formatting.metrics_count}</span>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:4px;">${metricsHtml}</div>
        </div>
      </div>
    </div>
    
    <!-- AI Domain Alignment Card (15%) -->
    <div class="ats-drawer-card">
      <div class="ats-drawer-section-title">🤖 AI Semantic Alignment (${ai}/15)</div>
      <div class="ats-progress-bar-container">
        <div class="ats-progress-bar-fill ai" style="width: ${(ai/15 * 100)}%;"></div>
      </div>
      <div style="font-size: 11px; color:#94a3b8; line-height:1.5;">
        Recruiter-aligned semantic checking measures if your overall candidate profile perfectly matches the core domain and seniority level of the target job position (preventing keyword-stuffing hacks).
      </div>
      <div style="font-size:11px; font-weight:600; color:#c084fc; display:flex; align-items:center; gap:4px;">
        🎯 Alignment Score: ${ai} out of 15 (Perfect domain fit)
      </div>
    </div>
  `;
  
  drawer.classList.add('open');
  overlay.classList.add('open');
}

function closeAtsDrawer() {
  const drawer = document.getElementById('atsDrawer');
  const overlay = document.getElementById('atsDrawerOverlay');
  if (drawer && overlay) {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  }
}

/* --- AI MOCK INTERVIEW SIMULATOR INTERACTIONS --- */
let activeInterviewSessionId = null;

async function startInterviewSession() {
  const jdText = document.getElementById('interviewJd').value.trim();
  const type = document.getElementById('interviewType').value;
  const difficulty = document.getElementById('interviewDifficulty').value;

  if (!jdText) {
    showError("Please paste a target Job Description to align and context-fit the interview questions.");
    return;
  }

  const startBtn = document.querySelector('#interviewSetupCard button');
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.innerHTML = '<span style="animation: bounce 1s infinite; display: inline-block;">⏳</span> Initializing Recruiting Panel...';
  }

  try {
    const response = await fetch('/interview/api/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jd: jdText,
        type: type,
        difficulty: difficulty
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to start interview practice session.");
    }

    activeInterviewSessionId = data.session_id;

    // Transition panels
    document.getElementById('interviewSetupCard').style.display = 'none';
    document.getElementById('interviewChatCard').style.display = 'grid';
    document.getElementById('interviewScorecard').style.display = 'none';

    // Set header details
    document.getElementById('interviewTypeDifficulty').textContent = `${type} | ${difficulty}-Level`;
    document.getElementById('interviewRoundCounter').textContent = `Question ${data.round} of ${data.max_rounds}`;

    // Reset Chat history and add the first question
    const stream = document.getElementById('interviewChatStream');
    stream.innerHTML = '';
    
    appendRecruiterMessage(data.first_question);

  } catch (err) {
    showError(err.message || "An error occurred starting the interview.");
  } finally {
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.innerHTML = '<span class="btn-icon">⚡</span> Start Interview Session';
    }
  }
}

function appendRecruiterMessage(text) {
  const stream = document.getElementById('interviewChatStream');
  const row = document.createElement('div');
  row.className = 'chat-row';
  row.innerHTML = `
    <span class="chat-avatar recruiter">🤖 Recruiter</span>
    <div class="chat-bubble recruiter">${escapeHtml(text)}</div>
  `;
  stream.appendChild(row);
  stream.scrollTop = stream.scrollHeight;
}

function appendUserMessage(text) {
  const stream = document.getElementById('interviewChatStream');
  const row = document.createElement('div');
  row.className = 'chat-row';
  row.innerHTML = `
    <span class="chat-avatar user">👤 Candidate (You)</span>
    <div class="chat-bubble user">${escapeHtml(text)}</div>
  `;
  stream.appendChild(row);
  stream.scrollTop = stream.scrollHeight;
}

async function submitInterviewAnswer() {
  const inputEl = document.getElementById('interviewAnswerInput');
  const answer = inputEl.value.trim();

  if (!answer) {
    showError("Please type a response before submitting.");
    return;
  }

  if (!activeInterviewSessionId) {
    showError("No active interview session found. Please reload or restart.");
    return;
  }

  // Disable submission buttons
  const submitBtn = document.querySelector('#interviewChatCard button[onclick="submitInterviewAnswer()"]');
  if (submitBtn) submitBtn.disabled = true;

  // Append user message
  appendUserMessage(answer);
  inputEl.value = '';

  // Show typing indicator
  const indicator = document.getElementById('interviewTypingIndicator');
  if (indicator) indicator.style.display = 'flex';
  
  const stream = document.getElementById('interviewChatStream');
  stream.scrollTop = stream.scrollHeight;

  try {
    const response = await fetch('/interview/api/answer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_id: activeInterviewSessionId,
        answer: answer
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to submit answer.");
    }

    if (indicator) indicator.style.display = 'none';

    if (data.finished) {
      // Direct to compile scorecard automatically
      await forceEndInterview();
    } else {
      // Update round counters and load next question
      document.getElementById('interviewRoundCounter').textContent = `Question ${data.round} of ${data.max_rounds}`;
      appendRecruiterMessage(data.next_question);
    }

  } catch (err) {
    if (indicator) indicator.style.display = 'none';
    showError(err.message || "Failed to submit answer.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function forceEndInterview() {
  if (!activeInterviewSessionId) {
    showError("No active session to terminate.");
    return;
  }

  const indicator = document.getElementById('interviewTypingIndicator');
  if (indicator) {
    indicator.style.display = 'flex';
    indicator.querySelector('span').textContent = 'Compiling Recruiter Grade Card & Learning Guide...';
  }

  const submitBtn = document.querySelector('#interviewChatCard button[onclick="submitInterviewAnswer()"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await fetch('/interview/api/end', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_id: activeInterviewSessionId
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to compile official scorecard.");
    }

    if (indicator) indicator.style.display = 'none';

    // Transition to Scorecard panel
    document.getElementById('interviewSetupCard').style.display = 'none';
    document.getElementById('interviewChatCard').style.display = 'none';
    document.getElementById('interviewScorecard').style.display = 'grid';

    // Populate scorecard metadata
    document.getElementById('scorecardTotal').textContent = `${data.total_score}%`;
    document.getElementById('scorecardFeedback').textContent = data.overall_feedback;

    // Sub-scores
    document.getElementById('scorecardTech').textContent = `${data.technical_score} / 25`;
    document.getElementById('scorecardTechFill').style.width = `${(data.technical_score / 25 * 100)}%`;

    document.getElementById('scorecardComm').textContent = `${data.communication_score} / 25`;
    document.getElementById('scorecardCommFill').style.width = `${(data.communication_score / 25 * 100)}%`;

    document.getElementById('scorecardBeh').textContent = `${data.behavioral_score} / 15`;
    document.getElementById('scorecardBehFill').style.width = `${(data.behavioral_score / 15 * 100)}%`;

    // Populate rounds details
    const roundsList = document.getElementById('scorecardRoundsList');
    roundsList.innerHTML = '';

    data.history.forEach((round, index) => {
      const box = document.createElement('div');
      box.className = 'scorecard-round-box';
      
      const qScore = round.score !== null ? `${round.score}/10` : 'Scored';
      const ansText = round.answer ? round.answer : 'No answer provided.';
      const critiqueText = round.critique ? round.critique : 'No critique available.';
      const idealText = round.ideal_answer ? round.ideal_answer : 'Detail technical actions and show measurable metrics.';

      box.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; margin-bottom: 8px;">
          <strong style="font-size: 13px; color: #fbbf24;">Round ${index + 1} Question</strong>
          <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px;">Score: ${qScore}</span>
        </div>
        <p style="font-size: 13px; color: white; font-weight: 500; margin: 0 0 10px 0;">${escapeHtml(round.question)}</p>
        
        <div style="font-size: 12px; margin-bottom: 8px;">
          <span style="color: var(--text-muted); font-weight:700;">Your Response:</span>
          <p style="color: #e2e8f0; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 6px; padding: 8px; margin: 4px 0 0 0; font-family: var(--font);">${escapeHtml(ansText)}</p>
        </div>

        <div style="font-size: 12px; margin-bottom: 8px;">
          <span style="color: #60a5fa; font-weight:700;">Recruiter Constructive Critique:</span>
          <p style="color: #cbd5e1; margin: 4px 0 0 0; line-height:1.5;">${escapeHtml(critiqueText)}</p>
        </div>

        <!-- Ideal Answer Dropdown Accordion -->
        <details style="margin-top: 10px;">
          <summary style="font-size: 11px; font-weight:700; color: #c084fc; cursor: pointer; user-select: none;" class="hover:underline">💡 View Ideal Recruiter Answer Outline</summary>
          <div class="ideal-answer-dropdown">
            ${escapeHtml(idealText)}
          </div>
        </details>
      `;
      roundsList.appendChild(box);
    });

  } catch (err) {
    if (indicator) indicator.style.display = 'none';
    showError(err.message || "Failed to end session.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function resetInterviewPortal() {
  activeInterviewSessionId = null;
  document.getElementById('interviewSetupCard').style.display = 'grid';
  document.getElementById('interviewChatCard').style.display = 'none';
  document.getElementById('interviewScorecard').style.display = 'none';

  // Clear inputs/history
  document.getElementById('interviewAnswerInput').value = '';
  document.getElementById('interviewChatStream').innerHTML = '';
}


