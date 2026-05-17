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
  const homeLink = document.getElementById('homeNavLink');
  const builderLink = document.getElementById('builderNavLink');
  const latexLink = document.getElementById('latexNavLink');
  const autoApplyLink = document.getElementById('autoApplyNavLink');
  const salaryLink = document.getElementById('salaryNavLink');
  if (!homeLink || !builderLink || !latexLink || !autoApplyLink) return;

  homeLink.classList.toggle('active', mode === 'home');
  builderLink.classList.toggle('active', mode === 'builder');
  latexLink.classList.toggle('active', mode === 'latex');
  autoApplyLink.classList.toggle('active', mode === 'auto');
  if (salaryLink) salaryLink.classList.toggle('active', mode === 'salary');
  
  homeLink.setAttribute('aria-current', mode === 'home' ? 'page' : 'false');
  builderLink.setAttribute('aria-current', mode === 'builder' ? 'page' : 'false');
  latexLink.setAttribute('aria-current', mode === 'latex' ? 'page' : 'false');
  autoApplyLink.setAttribute('aria-current', mode === 'auto' ? 'page' : 'false');
  if (salaryLink) salaryLink.setAttribute('aria-current', mode === 'salary' ? 'page' : 'false');
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
  return 'home';
}

function applyPageModeFromHash() {
  const mode = getPageModeFromHash();
  const homeSection = document.getElementById('homeSection');
  const latexSection = document.getElementById('latexResumeSection');
  const autoSection = document.getElementById('autoApplySection');
  const salarySection = document.getElementById('salarySection');
  const inputSection = document.getElementById('inputSection');
  const resultsSection = document.getElementById('resultsSection');
  const standaloneSection = document.getElementById('coverLetterStandaloneSection');

  setSidebarActive(mode);

  if (mode === 'home') {
    if (homeSection) homeSection.style.display = 'block';
    if (latexSection) latexSection.style.display = 'none';
    if (autoSection) autoSection.style.display = 'none';
    if (salarySection) salarySection.style.display = 'none';
    if (inputSection) inputSection.style.display = 'none';
    if (resultsSection) resultsSection.style.display = 'none';
    if (standaloneSection) standaloneSection.style.display = 'none';
    return;
  }

  if (homeSection) homeSection.style.display = 'none';
  if (latexSection) latexSection.style.display = mode === 'latex' ? 'block' : 'none';
  if (autoSection) autoSection.style.display = mode === 'auto' ? 'block' : 'none';
  if (salarySection) salarySection.style.display = mode === 'salary' ? 'block' : 'none';
  
  const hideInputAndResults = ['latex', 'auto', 'salary'].includes(mode);
  
  if (inputSection && hideInputAndResults) inputSection.style.display = 'none';
  if (resultsSection && hideInputAndResults) resultsSection.style.display = 'none';
  if (standaloneSection && hideInputAndResults) standaloneSection.style.display = 'none';

  if (mode === 'latex') {
    loadLatexEngineStatus();
    return;
  }

  restoreBuilderState();
  renderAutoQueue();

  const inputVisible = inputSection && inputSection.style.display !== 'none';
  const resultsVisible = resultsSection && resultsSection.style.display !== 'none';
  const standaloneVisible = standaloneSection && standaloneSection.style.display !== 'none';
  const autoVisible = autoSection && autoSection.style.display !== 'none';
  const salaryVisible = salarySection && salarySection.style.display !== 'none';

  if (!inputVisible && !resultsVisible && !standaloneVisible && !autoVisible && !salaryVisible && inputSection) {
    inputSection.style.display = 'block';
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
  const response = await fetch('/render-latex-source', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latex_data: getLatexFormData() }),
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
    const response = await fetch('/export-latex-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latex_data: getLatexFormData(),
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
      <div class="r-summary">${escapeHtml(resume.summary)}</div>
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
          <span class="r-skill-cat">${escapeHtml(cat)}</span>
          <div class="r-skill-tags">${list.map(s => `<span class="r-skill-tag">${escapeHtml(s)}</span>`).join('')}</div>
        </div>`;
      }
    }
    html += `</div></div>`;
  }

  // Experience
  const experience = resume.experience || [];
  if (experience.length > 0) {
    html += `<div class="r-section"><div class="r-section-title">Experience</div>`;
    for (const exp of experience) {
      html += `<div class="r-exp-item">
        <div class="r-exp-header">
          <span class="r-exp-title">${escapeHtml(exp.title || '')}</span>
          <span class="r-exp-duration">${escapeHtml(exp.duration || '')}</span>
        </div>
        <div class="r-exp-company">${escapeHtml(exp.company || '')}</div>
        <ul class="r-bullets">${(exp.bullets || []).map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
      </div>`;
    }
    html += `</div>`;
  }

  // Projects
  const projects = resume.projects || [];
  if (projects.length > 0) {
    html += `<div class="r-section"><div class="r-section-title">Projects</div>`;
    for (const proj of projects) {
      html += `<div class="r-proj-item">
        <div class="r-proj-name">${escapeHtml(proj.name || '')}</div>
        <div class="r-proj-tech">${escapeHtml(proj.tech || '')}</div>
        <ul class="r-bullets">${(proj.bullets || []).map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
      </div>`;
    }
    html += `</div>`;
  }

  // Education
  const education = resume.education || [];
  if (education.length > 0) {
    html += `<div class="r-section"><div class="r-section-title">Education</div>`;
    for (const edu of education) {
      html += `<div class="r-edu-item">
        <div class="r-edu-degree">${edu.degree || ''} — ${edu.year || ''}</div>
        <div class="r-edu-inst">${edu.institution || ''}</div>
        ${edu.details ? `<div style="font-size:13px;color:var(--text-muted);margin-top:2px">${edu.details}</div>` : ''}
      </div>`;
    }
    html += `</div>`;
  }

  // Certifications
  const certifications = resume.certifications || [];
  if (certifications.length > 0) {
    html += `<div class="r-section"><div class="r-section-title">Certifications</div>`;
    for (const cert of certifications) {
      if (typeof cert === 'string') {
        html += `<div class="r-edu-item"><div class="r-edu-degree">${escapeHtml(cert)}</div></div>`;
        continue;
      }
      html += `<div class="r-edu-item">
        <div class="r-edu-degree">${cert.name || ''}${cert.year ? ` — ${cert.year}` : ''}</div>
        <div class="r-edu-inst">${cert.issuer || ''}</div>
      </div>`;
    }
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

loadHomeOverview();
bindSidebarHandlers();
applyPageModeFromHash();
window.addEventListener('DOMContentLoaded', applyPageModeFromHash);
window.addEventListener('hashchange', applyPageModeFromHash);
