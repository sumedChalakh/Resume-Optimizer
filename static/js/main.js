let currentResumeData = null;
let currentOriginalResumeText = '';
let currentCoverLetterData = null;
let lastOptimizeResponse = null;
const BUILDER_STATE_KEY = 'ats_optimizer_builder_state_v1';

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
    localStorage.setItem(BUILDER_STATE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    // Ignore storage errors.
  }
}

function clearBuilderState() {
  try {
    localStorage.removeItem(BUILDER_STATE_KEY);
  } catch (error) {
    // Ignore storage errors.
  }
}

function restoreBuilderState() {
  try {
    const raw = localStorage.getItem(BUILDER_STATE_KEY);
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
  const allowed = ['pdf', 'doc', 'docx', 'txt'];
  const ext = file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) {
    showError('Unsupported file type. Use PDF, DOC, DOCX, or TXT.');
    return;
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

    const textarea = document.getElementById('resumeInput');
    textarea.value = data.text || '';
    document.getElementById('resumeCount').textContent = textarea.value.length.toLocaleString() + ' characters';
    persistBuilderState();
    showToast('Resume text loaded from file.', '#22c55e');
  } catch (err) {
    showError(err.message || 'Could not read uploaded file.');
  }
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
    ? missing.map(k => `<span class="tag tag-red">${k}</span>`).join('')
    : '<span style="color:var(--green);font-size:13px">✓ No critical keywords missing</span>';

  // Matched keywords
  const matched =
    (data.analysis && data.analysis.matched_keywords) ||
    (data.keyword_analysis && data.keyword_analysis.matched_in_resume) ||
    [];
  document.getElementById('matchedKeywords').innerHTML = matched.length
    ? matched.slice(0, 12).map(k => `<span class="tag tag-green">${k}</span>`).join('')
    : '<span style="color:var(--text-muted);font-size:13px">—</span>';

  // Improvements
  const improvements = data.improvements || [];
  document.getElementById('improvementsList').innerHTML =
    improvements.map(i => `<li>${i}</li>`).join('');

  // Resume Content
  renderResumeHTML(resume);
  renderCoverLetter(currentCoverLetterData);

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
  let html = '';

  // Summary
  if (resume.summary) {
    html += `<div class="r-section">
      <div class="r-section-title">Professional Summary</div>
      <div class="r-summary">${resume.summary}</div>
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
          <span class="r-skill-cat">${cat}</span>
          <div class="r-skill-tags">${list.map(s => `<span class="r-skill-tag">${s}</span>`).join('')}</div>
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
          <span class="r-exp-title">${exp.title || ''}</span>
          <span class="r-exp-duration">${exp.duration || ''}</span>
        </div>
        <div class="r-exp-company">${exp.company || ''}</div>
        <ul class="r-bullets">${(exp.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
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
        <div class="r-proj-name">${proj.name || ''}</div>
        <div class="r-proj-tech">${proj.tech || ''}</div>
        <ul class="r-bullets">${(proj.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
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
        html += `<div class="r-edu-item"><div class="r-edu-degree">${cert}</div></div>`;
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

restoreBuilderState();
