/**
 * DonkeyTube Administrator Console Script
 * Manages Admin Authentication, Dashboard Metrics, Grading Review Queue, Import Wizard, and Settings.
 */

const ADMIN_STATE = {
  token: localStorage.getItem('dt_admin_token') || null,
  activeView: 'login',
  attempts: [],
  versions: [],
  settings: {},
  importReport: null
};

// DOM Elements
const adminEl = {
  navBar: document.getElementById('admin-nav-bar'),
  userControls: document.getElementById('admin-user-controls'),
  usernameDisplay: document.getElementById('admin-username-display'),
  navTabs: document.querySelectorAll('#admin-nav-bar .nav-tab-btn'),
  views: {
    login: document.getElementById('view-admin-login'),
    dashboard: document.getElementById('view-admin-dashboard'),
    attempts: document.getElementById('view-admin-attempts'),
    import: document.getElementById('view-admin-import'),
    versions: document.getElementById('view-admin-versions'),
    settings: document.getElementById('view-admin-settings')
  },
  loginForm: document.getElementById('admin-login-form'),
  loginUser: document.getElementById('login-username'),
  loginPass: document.getElementById('login-password'),
  loginError: document.getElementById('login-error-msg')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupAdminNavigation();
  setupLoginForm();
  checkAuthAndInit();
});

function setupAdminNavigation() {
  adminEl.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.target;
      window.location.hash = target;
    });
  });

  window.addEventListener('hashchange', handleAdminRouting);
}

function handleAdminRouting() {
  if (!ADMIN_STATE.token) {
    switchAdminView('login');
    return;
  }

  const hash = window.location.hash || '#admin-dashboard';
  if (hash === '#admin-dashboard') {
    switchAdminView('dashboard');
    loadDashboardMetrics();
  } else if (hash === '#admin-attempts') {
    switchAdminView('attempts');
    loadAdminAttempts();
  } else if (hash === '#admin-import') {
    switchAdminView('import');
  } else if (hash === '#admin-versions') {
    switchAdminView('versions');
    loadAdminVersions();
  } else if (hash === '#admin-settings') {
    switchAdminView('settings');
    loadAdminSettings();
  }
}

function switchAdminView(viewName) {
  ADMIN_STATE.activeView = viewName;

  adminEl.navTabs.forEach(tab => {
    if (tab.dataset.target === '#admin-' + viewName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  Object.keys(adminEl.views).forEach(key => {
    if (adminEl.views[key]) {
      if (key === viewName) {
        adminEl.views[key].classList.add('active-view');
      } else {
        adminEl.views[key].classList.remove('active-view');
      }
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Authentication
function checkAuthAndInit() {
  if (ADMIN_STATE.token) {
    adminEl.navBar.style.display = 'flex';
    adminEl.userControls.style.display = 'flex';
    handleAdminRouting();
  } else {
    adminEl.navBar.style.display = 'none';
    adminEl.userControls.style.display = 'none';
    switchAdminView('login');
  }
}

function setupLoginForm() {
  if (!adminEl.loginForm) return;

  adminEl.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = adminEl.loginUser.value.trim();
    const password = adminEl.loginPass.value.trim();

    adminEl.loginError.style.display = 'none';

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        ADMIN_STATE.token = data.token;
        localStorage.setItem('dt_admin_token', data.token);
        adminEl.navBar.style.display = 'flex';
        adminEl.userControls.style.display = 'flex';
        window.location.hash = '#admin-dashboard';
        handleAdminRouting();
      } else {
        adminEl.loginError.textContent = data.error || 'Invalid credentials';
        adminEl.loginError.style.display = 'block';
      }
    } catch (err) {
      adminEl.loginError.textContent = 'Server communication error';
      adminEl.loginError.style.display = 'block';
    }
  });
}

window.adminLogout = function() {
  ADMIN_STATE.token = null;
  localStorage.removeItem('dt_admin_token');
  window.location.hash = '';
  checkAuthAndInit();
};

function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (ADMIN_STATE.token) {
    options.headers['Authorization'] = `Bearer ${ADMIN_STATE.token}`;
  }
  return fetch(url, options);
}

// 1. Dashboard Metrics
async function loadDashboardMetrics() {
  try {
    const res = await authFetch('/api/admin/attempts');
    if (res.status === 401) return adminLogout();

    const data = await res.json();
    const attempts = data.attempts || [];

    const total = attempts.length;
    const passed = attempts.filter(a => a.passed === 1).length;
    const avgScore = total > 0 ? Math.round(attempts.reduce((acc, a) => acc + a.percentage, 0) / total) : 0;

    document.getElementById('metric-total-candidates').textContent = total;
    document.getElementById('metric-pass-count').textContent = `${passed} (${total > 0 ? Math.round((passed / total) * 100) : 0}%)`;
    document.getElementById('metric-average-score').textContent = `${avgScore}%`;

    // Active version
    const vRes = await authFetch('/api/admin/versions');
    const vData = await vRes.json();
    const activeVer = (vData.versions || []).find(v => v.is_published) || (vData.versions || [])[0];
    if (activeVer) {
      document.getElementById('metric-active-version').textContent = activeVer.version;
    }

    // Recent attempts table
    const recentBody = document.getElementById('dashboard-recent-attempts-body');
    if (recentBody) {
      const recent = attempts.slice(0, 5);
      if (recent.length === 0) {
        recentBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 1.5rem; color: var(--text-muted);">ምንም ተፈታኝ የለም</td></tr>`;
      } else {
        recentBody.innerHTML = recent.map(a => `
          <tr>
            <td><strong>${escapeHtml(a.candidate_name)}</strong></td>
            <td>${escapeHtml(a.department)}</td>
            <td>${a.total_score} / 100 (${a.percentage}%)</td>
            <td>
              <span class="report-badge ${a.passed ? 'pass' : 'fail'}">${a.passed ? 'PASS' : 'FAIL'}</span>
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

// 2. Candidate Attempts Table
async function loadAdminAttempts() {
  const container = document.getElementById('admin-attempts-list-body');
  if (!container) return;

  try {
    const res = await authFetch('/api/admin/attempts');
    if (res.status === 401) return adminLogout();

    const data = await res.json();
    ADMIN_STATE.attempts = data.attempts || [];
    renderAttemptsTable(ADMIN_STATE.attempts);

    // Search input
    const searchInput = document.getElementById('admin-search-input');
    if (searchInput) {
      searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase().trim();
        const filtered = ADMIN_STATE.attempts.filter(a => {
          return (a.candidate_name && a.candidate_name.toLowerCase().includes(q)) ||
                 (a.department && a.department.toLowerCase().includes(q)) ||
                 (a.employee_id && a.employee_id.toLowerCase().includes(q));
        });
        renderAttemptsTable(filtered);
      };
    }
  } catch (err) {
    console.error('Failed to load attempts:', err);
  }
}

function renderAttemptsTable(attempts) {
  const container = document.getElementById('admin-attempts-list-body');
  if (!container) return;

  if (attempts.length === 0) {
    container.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">ምንም አይነት የፈተና ውጤት አልተገኘም።</td></tr>`;
    return;
  }

  container.innerHTML = attempts.map(att => {
    const isPass = att.passed === 1;
    return `
      <tr>
        <td><strong>${escapeHtml(att.candidate_name)}</strong></td>
        <td>${escapeHtml(att.department)}</td>
        <td>${att.submitted_at ? new Date(att.submitted_at).toLocaleString() : 'በሂደት ላይ'}</td>
        <td><strong>${att.total_score}</strong> / 100</td>
        <td>${att.percentage}%</td>
        <td>
          <span class="report-badge ${isPass ? 'pass' : 'fail'}">${isPass ? 'PASS' : 'FAIL'}</span>
        </td>
        <td>
          <button class="nav-tab-btn" style="background: rgba(255,255,255,0.08); padding: 4px 10px;" onclick="viewAttemptDetail('${att.id}')">
            ዝርዝር ገምግም
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Inspect & Review Attempt Detail
window.viewAttemptDetail = async function(attemptId) {
  try {
    const res = await authFetch(`/api/admin/attempt/${attemptId}`);
    if (res.status === 401) return adminLogout();

    const data = await res.json();
    const modal = document.getElementById('admin-detail-modal');
    const body = document.getElementById('admin-detail-modal-body');

    if (!modal || !body) return;

    const att = data.attempt;
    const items = data.items || [];

    body.innerHTML = `
      <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-subtle);">
        <h3 style="font-size: 1.35rem; margin-bottom: 0.25rem;">${escapeHtml(att.candidate_name)} — ዝርዝር ምዘና</h3>
        <p style="color: var(--text-secondary); font-size: 0.85rem;">
          የስራ ክፍል፦ ${escapeHtml(att.department)} | ድምር ውጤት፦ <strong>${att.total_score} / 100 (${att.percentage}%)</strong>
        </p>
      </div>

      <div style="max-height: 60vh; overflow-y: auto; padding-right: 8px;">
        ${items.map(it => {
          return `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 0.75rem;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem; font-size: 0.85rem;">
                <span style="font-weight: 700; color: var(--primary);">ጥያቄ ${it.question_number} (${it.section_title})</span>
                <span>የተሰጠ ነጥብ፦ <strong>${it.awarded_points}</strong> / ${it.max_points}</span>
              </div>
              <div style="font-size: 0.95rem; margin-bottom: 0.5rem; font-family: var(--font-am);">${escapeHtml(it.question_text)}</div>
              <div style="background: rgba(0,0,0,0.3); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.85rem; margin-bottom: 0.4rem;">
                ተፈታኙ የሰጠው መልስ፦ <span style="color: ${it.is_correct ? '#34d399' : '#f87171'}; font-weight: 600;">${escapeHtml(it.submitted_answer || 'ባዶ')}</span>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">
                ትክክለኛ/ሞዴል መልስ፦ <em>${escapeHtml(it.official_answer || it.primary_answer || it.model_answer || '')}</em>
              </div>
              ${it.section_number === 4 ? `
                <div style="margin-top: 0.6rem; display: flex; align-items: center; gap: 0.5rem;">
                  <label style="font-size: 0.8rem; color: var(--text-muted);">ነጥብ ማሻሻያ፦</label>
                  <input type="number" id="override-input-${it.question_number}" value="${it.awarded_points}" min="0" max="1" step="0.5" style="width: 70px; padding: 3px 6px; background: #000; border: 1px solid #444; color: #fff; border-radius: 4px;">
                  <button class="nav-tab-btn" style="padding: 3px 8px; font-size: 0.75rem;" onclick="overrideScore('${att.id}', ${it.question_number})">አጽድቅ</button>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;

    modal.classList.add('active-modal');
  } catch (err) {
    console.error('Failed to view attempt:', err);
  }
};

window.overrideScore = async function(attemptId, qNum) {
  const input = document.getElementById(`override-input-${qNum}`);
  if (!input) return;

  const points = parseFloat(input.value);
  try {
    const res = await authFetch(`/api/admin/attempt/${attemptId}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_number: qNum,
        awarded_points: points,
        reviewer_notes: 'Administrator override'
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`ጥያቄ ${qNum} ነጥብ በተሳካ ሁኔታ ተስተካክሏል!`);
      loadAdminAttempts();
      viewAttemptDetail(attemptId);
    }
  } catch (e) {
    alert('ማስተካከል አልተቻለም');
  }
};

window.closeAdminDetailModal = function() {
  const modal = document.getElementById('admin-detail-modal');
  if (modal) modal.classList.remove('active-modal');
};

// 3. Admin Import Wizard
const dropzones = {
  pdf: document.getElementById('dropzone-pdf'),
  docx: document.getElementById('dropzone-docx'),
  pdfInput: document.getElementById('pdf-file-input'),
  docxInput: document.getElementById('docx-file-input'),
  btnRunExtract: document.getElementById('btn-run-extract'),
  reportContainer: document.getElementById('import-validation-report-box')
};

if (dropzones.pdf && dropzones.pdfInput) {
  dropzones.pdf.addEventListener('click', () => dropzones.pdfInput.click());
  dropzones.pdfInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const indicator = document.getElementById('pdf-file-indicator');
      indicator.textContent = `✓ ተመርጧል፦ ${file.name} (${Math.round(file.size / 1024)} KB)`;
      indicator.style.display = 'block';
    }
  });
}

if (dropzones.docx && dropzones.docxInput) {
  dropzones.docx.addEventListener('click', () => dropzones.docxInput.click());
  dropzones.docxInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const indicator = document.getElementById('docx-file-indicator');
      indicator.textContent = `✓ ተመርጧል፦ ${file.name} (${Math.round(file.size / 1024)} KB)`;
      indicator.style.display = 'block';
    }
  });
}

if (dropzones.btnRunExtract) {
  dropzones.btnRunExtract.addEventListener('click', async () => {
    const formData = new FormData();
    if (dropzones.pdfInput.files[0]) formData.append('pdf_file', dropzones.pdfInput.files[0]);
    if (dropzones.docxInput.files[0]) formData.append('docx_file', dropzones.docxInput.files[0]);

    dropzones.btnRunExtract.disabled = true;
    dropzones.btnRunExtract.textContent = 'በማውጣትና በማጣራት ላይ... (Analyzing & Extracting...)';

    try {
      const res = await authFetch('/api/admin/import', {
        method: 'POST',
        body: formData
      });

      if (res.status === 401) return adminLogout();

      const report = await res.json();
      ADMIN_STATE.importReport = report;
      renderImportValidationReport(report);
    } catch (err) {
      console.error('Import failed:', err);
      alert('ፋይሎችን ማውጣት አልተቻለም።');
    } finally {
      dropzones.btnRunExtract.disabled = false;
      dropzones.btnRunExtract.textContent = '⚡ ጥያቄዎችንና መልሶችን ፈትሽ (Run Extraction & Validation)';
    }
  });
}

function renderImportValidationReport(report) {
  const container = dropzones.reportContainer;
  if (!container) return;

  const isPass = report.validation_passed;

  const checksHtml = (report.checks || []).map(c => `
    <div class="check-item">
      <div class="check-icon" style="color: ${c.passed ? '#34d399' : '#f87171'};">
        ${c.passed ? '✓' : '✕'}
      </div>
      <div class="check-info">
        <div class="check-name">${escapeHtml(c.title)}</div>
        <div class="check-desc">${escapeHtml(c.detail)}</div>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="validation-report-card">
      <div class="report-header">
        <div>
          <h3 style="font-size: 1.25rem; font-family: var(--font-am);">የማረጋገጫ ሪፖርት (Validation Report)</h3>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(report.summary)}</div>
        </div>
        <span class="report-badge ${isPass ? 'pass' : 'fail'}">
          ${isPass ? 'PASS: 80/80 ጥያቄዎች ተረጋግጠዋል' : 'FAIL: ስህተቶች ተገኝተዋል'}
        </span>
      </div>

      <div class="checks-grid">
        ${checksHtml}
      </div>

      <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 0.8rem; color: var(--text-muted);">
          PDF Hash: <code>${report.metadata.question_file_sha256 ? report.metadata.question_file_sha256.substring(0, 12) + '...' : ''}</code> | 
          DOCX Hash: <code>${report.metadata.answer_file_sha256 ? report.metadata.answer_file_sha256.substring(0, 12) + '...' : ''}</code>
        </div>
        <button type="button" class="btn-primary" id="btn-publish-imported-version" style="width: auto; padding: 0.65rem 1.5rem;" ${isPass ? '' : 'disabled'}>
          🚀 እንደ አዲስ ስሪት አጽድቅ (Publish & Lock Version)
        </button>
      </div>
    </div>
  `;

  const btnPub = document.getElementById('btn-publish-imported-version');
  if (btnPub) {
    btnPub.addEventListener('click', async () => {
      const newVersionCode = prompt('እባክዎ የስሪቱን ኮድ ያስገቡ (Enter Version Code, e.g. v1.1.0-official):', 'v1.1.0-official');
      if (!newVersionCode) return;

      try {
        const res = await authFetch('/api/admin/publish-version', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: newVersionCode.trim(),
            title: 'የማኔጅመንትና አመራር ብቃት መመዘኛ ፈተና (80 ጥያቄዎች)',
            questions: report.questions_preview,
            answers: report.answers_preview,
            metadata: report.metadata,
            set_active: true
          })
        });

        const resData = await res.json();
        if (resData.success) {
          alert('አዲሱ የስሪት ፈተና በተሳካ ሁኔታ ታትሞ ተቆልፏል!');
          window.location.hash = '#admin-versions';
        } else {
          alert('ስህተት፦ ' + (resData.error || 'Failed to publish'));
        }
      } catch (e) {
        alert('ስህተት ተከስቷል');
      }
    });
  }
}

// 4. Admin Versions
async function loadAdminVersions() {
  const container = document.getElementById('admin-versions-list-body');
  if (!container) return;

  try {
    const res = await authFetch('/api/admin/versions');
    if (res.status === 401) return adminLogout();

    const data = await res.json();
    const versions = data.versions || [];

    container.innerHTML = versions.map(v => `
      <tr>
        <td><strong>${escapeHtml(v.version)}</strong></td>
        <td>${escapeHtml(v.title)}</td>
        <td>${v.total_questions} ጥያቄዎች (${v.total_points} ነጥብ)</td>
        <td>${v.attempts_count} ተፈታኞች</td>
        <td>
          <span class="report-badge ${v.is_published ? 'pass' : 'fail'}">
            ${v.is_published ? 'ACTIVE / PUBLISHED' : 'ARCHIVED'}
          </span>
        </td>
        <td>🔒 የተቆለፈ (Locked)</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load versions:', err);
  }
}

// 5. Admin Settings
async function loadAdminSettings() {
  const visSelect = document.getElementById('setting-visibility-select');
  const threshInput = document.getElementById('setting-threshold-input');

  try {
    const res = await authFetch('/api/admin/settings');
    if (res.status === 401) return adminLogout();

    const data = await res.json();
    if (data.settings) {
      if (visSelect) visSelect.value = data.settings.result_visibility || 'IMMEDIATE';
      if (threshInput) threshInput.value = data.settings.pass_threshold_percentage || '70';
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

window.saveAdminSettings = async function() {
  const visSelect = document.getElementById('setting-visibility-select');
  const threshInput = document.getElementById('setting-threshold-input');

  try {
    const res = await authFetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        result_visibility: visSelect.value,
        pass_threshold_percentage: threshInput.value
      })
    });
    const data = await res.json();
    if (data.success) {
      alert('ቅንብሩ በተሳካ ሁኔታ ተቀምጧል! (Settings saved successfully)');
    }
  } catch (e) {
    alert('ቅንብሩን ማስቀመጥ አልተቻለም');
  }
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
