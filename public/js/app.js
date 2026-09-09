/**
 * DonkeyTube Employee Evaluation Portal
 * Dedicated strictly to Candidate Experience: Registration, Exam Navigation, Live Timer, and Results.
 */

const STATE = {
  activeView: 'candidate',
  activeSection: 1,
  activeEvaluation: null,
  candidate: {
    name: '',
    department: 'የሶሻል ሚዲያ ቢዝነስ',
    employeeId: ''
  },
  attemptId: null,
  questions: [],
  answers: {},
  flags: new Set(),
  timerSeconds: 150 * 60,
  timerInterval: null,
  autoSaveInterval: null,
  submissionResult: null
};

// DOM Elements
const el = {
  views: {
    candidate: document.getElementById('view-candidate'),
    exam: document.getElementById('view-exam'),
    results: document.getElementById('view-results')
  },
  welcomeForm: document.getElementById('registration-form'),
  candidateNameInput: document.getElementById('candidate-name-input'),
  candidateDeptInput: document.getElementById('candidate-dept-input'),
  candidateIdInput: document.getElementById('candidate-id-input'),
  employeeProfilePill: document.getElementById('employee-profile-pill'),
  employeeProfileName: document.getElementById('employee-profile-name'),
  employeeProfileDept: document.getElementById('employee-profile-dept'),
  timerDisplay: document.getElementById('exam-timer-display'),
  progressFill: document.getElementById('exam-progress-fill'),
  progressLabel: document.getElementById('exam-progress-label'),
  secTabBtns: document.querySelectorAll('.sec-tab-btn'),
  questionsContainer: document.getElementById('questions-list-container'),
  paletteGrid: document.getElementById('palette-tiles-grid'),
  btnSubmitExam: document.getElementById('btn-submit-exam'),
  submitModal: document.getElementById('submit-confirm-modal'),
  btnConfirmSubmit: document.getElementById('btn-confirm-submit-modal'),
  btnCancelSubmit: document.getElementById('btn-cancel-submit-modal'),
  unansweredWarningBox: document.getElementById('unanswered-warning-box'),
  unansweredCountSpan: document.getElementById('unanswered-count-span'),
  resultsContainer: document.getElementById('results-content-box')
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadActiveEvaluation();
  renderView('candidate');
});

function renderView(viewName) {
  STATE.activeView = viewName;
  Object.keys(el.views).forEach(k => {
    if (el.views[k]) {
      if (k === viewName) {
        el.views[k].classList.add('active-view');
      } else {
        el.views[k].classList.remove('active-view');
      }
    }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupEventListeners() {
  // Section switcher
  el.secTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const secNum = parseInt(btn.dataset.section);
      switchSection(secNum);
    });
  });

  // Welcome Registration Form
  if (el.welcomeForm) {
    el.welcomeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = el.candidateNameInput.value.trim();
      const dept = el.candidateDeptInput.value.trim();
      const empId = el.candidateIdInput.value.trim();

      if (!name) {
        alert('እባክዎ የተፈታኝ ስም ያስገቡ (Please enter candidate name)');
        return;
      }

      STATE.candidate = { name, department: dept, employeeId: empId };
      await startEvaluationSession();
    });
  }

  // Submit confirmation modal
  if (el.btnSubmitExam) {
    el.btnSubmitExam.addEventListener('click', openSubmitModal);
  }
  if (el.btnCancelSubmit) {
    el.btnCancelSubmit.addEventListener('click', closeSubmitModal);
  }
  if (el.btnConfirmSubmit) {
    el.btnConfirmSubmit.addEventListener('click', submitFinalEvaluation);
  }
}

async function loadActiveEvaluation() {
  try {
    const res = await fetch('/api/evaluation/active');
    const data = await res.json();
    if (data && data.evaluation) {
      STATE.activeEvaluation = data.evaluation;
      STATE.questions = data.questions || [];
      console.log(`Loaded ${STATE.questions.length} questions for version ${data.evaluation.version}`);
    }
  } catch (err) {
    console.error('Failed to load active evaluation:', err);
  }
}

async function startEvaluationSession() {
  try {
    const res = await fetch('/api/evaluation/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_name: STATE.candidate.name,
        department: STATE.candidate.department,
        employee_id: STATE.candidate.employeeId,
        evaluation_id: STATE.activeEvaluation ? STATE.activeEvaluation.id : null
      })
    });

    const data = await res.json();
    if (data.attempt_id) {
      STATE.attemptId = data.attempt_id;
      STATE.timerSeconds = (data.time_limit_minutes || 150) * 60;

      // Update header profile pill
      if (el.employeeProfilePill) {
        el.employeeProfileName.textContent = STATE.candidate.name;
        el.employeeProfileDept.textContent = STATE.candidate.department;
        el.employeeProfilePill.style.display = 'inline-flex';
      }

      // Render Exam UI
      renderQuestionPalette();
      renderQuestions(STATE.activeSection);
      startTimer();
      startAutoSaver();

      renderView('exam');
    }
  } catch (err) {
    console.error('Failed to start evaluation:', err);
    alert('ፈተናውን መጀመር አልተቻለም። እባክዎ እንደገና ይሞክሩ።');
  }
}

// Timer Logic
function startTimer() {
  if (STATE.timerInterval) clearInterval(STATE.timerInterval);

  updateTimerDisplay();

  STATE.timerInterval = setInterval(() => {
    STATE.timerSeconds--;

    if (STATE.timerSeconds <= 0) {
      clearInterval(STATE.timerInterval);
      updateTimerDisplay();
      alert('የፈተናው ሰዓት ተጠናቋል! ፈተናዎ ወዲያውኑ ይቆለፋል። (Time is up! Submitting evaluation)');
      submitFinalEvaluation();
      return;
    }

    updateTimerDisplay();
  }, 1000);
}

function updateTimerDisplay() {
  if (!el.timerDisplay) return;

  const totalSecs = Math.max(0, STATE.timerSeconds);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  const pad = (n) => String(n).padStart(2, '0');
  el.timerDisplay.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  if (totalSecs < 300) {
    el.timerDisplay.className = 'timer-value timer-danger';
  } else if (totalSecs < 900) {
    el.timerDisplay.className = 'timer-value timer-warning';
  } else {
    el.timerDisplay.className = 'timer-value';
  }
}

// Auto-saver
function startAutoSaver() {
  if (STATE.autoSaveInterval) clearInterval(STATE.autoSaveInterval);

  STATE.autoSaveInterval = setInterval(async () => {
    if (!STATE.attemptId || STATE.submissionResult) return;

    try {
      const timeSpent = (150 * 60) - STATE.timerSeconds;
      await fetch('/api/evaluation/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attempt_id: STATE.attemptId,
          answers: STATE.answers,
          time_spent_seconds: timeSpent
        })
      });
    } catch (err) {
      console.warn('Auto-save background sync deferred:', err);
    }
  }, 20000);
}

// Section Switching
function switchSection(secNumber) {
  STATE.activeSection = secNumber;

  el.secTabBtns.forEach(btn => {
    if (parseInt(btn.dataset.section) === secNumber) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  renderQuestions(secNumber);
}

// Render Questions for Current Section
function renderQuestions(secNumber) {
  if (!el.questionsContainer) return;
  el.questionsContainer.innerHTML = '';

  const secQuestions = STATE.questions.filter(q => q.section_number === secNumber);

  secQuestions.forEach(q => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.id = `q-card-${q.question_number}`;

    const isFlagged = STATE.flags.has(q.question_number);
    const existingAns = STATE.answers[q.question_number];

    let inputHtml = '';

    if (q.question_type === 'TRUE_FALSE') {
      const isTrue = existingAns === 'እውነት' || existingAns === 'True';
      const isFalse = existingAns === 'ሐሰት' || existingAns === 'False';

      inputHtml = `
        <div class="tf-options-group">
          <button type="button" class="tf-option-btn ${isTrue ? 'selected-true' : ''}" data-q="${q.question_number}" data-val="እውነት">
            ✓ እውነት (True)
          </button>
          <button type="button" class="tf-option-btn ${isFalse ? 'selected-false' : ''}" data-q="${q.question_number}" data-val="ሐሰት">
            ✕ ሐሰት (False)
          </button>
        </div>
      `;
    } else if (q.question_type === 'FILL_IN_BLANK') {
      inputHtml = `
        <div class="blank-input-wrap">
          <input type="text"
                 class="blank-text-input"
                 placeholder="ተስማሚውን ቃል ወይም ሐረግ እዚህ ይጻፉ (Type your answer here)..."
                 data-q="${q.question_number}"
                 value="${escapeHtml(existingAns || '')}">
        </div>
      `;
    } else if (q.question_type === 'MULTIPLE_CHOICE') {
      const choicesHtml = (q.choices || []).map(c => {
        const isSelected = existingAns === c.key || existingAns === `${c.key}) ${c.text}`;
        return `
          <div class="mc-option-card ${isSelected ? 'selected' : ''}" data-q="${q.question_number}" data-key="${c.key}">
            <div class="mc-key-circle">${c.key}</div>
            <div class="mc-text-content">${escapeHtml(c.text)}</div>
          </div>
        `;
      }).join('');

      inputHtml = `<div class="mc-options-list">${choicesHtml}</div>`;
    } else if (q.question_type === 'SHORT_ANSWER') {
      inputHtml = `
        <div class="essay-input-wrap">
          <textarea class="essay-textarea"
                    rows="4"
                    placeholder="አጭርና ግልጽ ማብራሪያ እዚህ ይጻፉ (Write your explanation here)..."
                    data-q="${q.question_number}">${escapeHtml(existingAns || '')}</textarea>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="q-header">
        <div class="q-tags">
          <span class="q-badge-num">ጥያቄ ${q.question_number}</span>
          <span class="q-badge-points">${q.points} ${q.points === 1 ? 'ነጥብ' : 'ነጥቦች'}</span>
        </div>
        <button type="button" class="btn-flag-q ${isFlagged ? 'flagged' : ''}" data-q="${q.question_number}">
          🚩 ${isFlagged ? 'ዕልባት ተደርጓል' : 'ለማስታወስ ጠቁም'}
        </button>
      </div>
      <div class="q-text ethiopic">${escapeHtml(q.question_text)}</div>
      ${inputHtml}
    `;

    el.questionsContainer.appendChild(card);
  });

  attachQuestionInputHandlers();
}

function attachQuestionInputHandlers() {
  document.querySelectorAll('.tf-option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qNum = parseInt(btn.dataset.q);
      const val = btn.dataset.val;
      STATE.answers[qNum] = val;

      const parent = btn.closest('.tf-options-group');
      parent.querySelectorAll('.tf-option-btn').forEach(b => b.classList.remove('selected-true', 'selected-false'));
      if (val === 'እውነት') btn.classList.add('selected-true');
      else btn.classList.add('selected-false');

      updatePaletteTile(qNum);
      updateProgressHud();
    });
  });

  document.querySelectorAll('.blank-text-input').forEach(input => {
    input.addEventListener('input', () => {
      const qNum = parseInt(input.dataset.q);
      const val = input.value.trim();
      if (val) STATE.answers[qNum] = val;
      else delete STATE.answers[qNum];

      updatePaletteTile(qNum);
      updateProgressHud();
    });
  });

  document.querySelectorAll('.mc-option-card').forEach(card => {
    card.addEventListener('click', () => {
      const qNum = parseInt(card.dataset.q);
      const key = card.dataset.key;
      STATE.answers[qNum] = key;

      const parent = card.closest('.mc-options-list');
      parent.querySelectorAll('.mc-option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      updatePaletteTile(qNum);
      updateProgressHud();
    });
  });

  document.querySelectorAll('.essay-textarea').forEach(area => {
    area.addEventListener('input', () => {
      const qNum = parseInt(area.dataset.q);
      const val = area.value.trim();
      if (val) STATE.answers[qNum] = val;
      else delete STATE.answers[qNum];

      updatePaletteTile(qNum);
      updateProgressHud();
    });
  });

  document.querySelectorAll('.btn-flag-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const qNum = parseInt(btn.dataset.q);
      if (STATE.flags.has(qNum)) {
        STATE.flags.delete(qNum);
        btn.classList.remove('flagged');
        btn.innerHTML = '🚩 ለማስታወስ ጠቁም';
      } else {
        STATE.flags.add(qNum);
        btn.classList.add('flagged');
        btn.innerHTML = '🚩 ዕልባት ተደርጓል';
      }
      updatePaletteTile(qNum);
    });
  });
}

function renderQuestionPalette() {
  if (!el.paletteGrid) return;
  el.paletteGrid.innerHTML = '';

  for (let i = 1; i <= 80; i++) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile-btn';
    tile.id = `palette-tile-${i}`;
    tile.textContent = i;
    tile.dataset.q = i;

    tile.addEventListener('click', () => jumpToQuestion(i));
    el.paletteGrid.appendChild(tile);
  }

  updateProgressHud();
}

function updatePaletteTile(qNum) {
  const tile = document.getElementById(`palette-tile-${qNum}`);
  if (!tile) return;

  tile.className = 'tile-btn';
  const hasAns = STATE.answers[qNum] && String(STATE.answers[qNum]).trim().length > 0;
  const isFlag = STATE.flags.has(qNum);

  if (isFlag) tile.classList.add('flagged');
  else if (hasAns) tile.classList.add('answered');
}

function jumpToQuestion(qNum) {
  let targetSec = 1;
  if (qNum >= 21 && qNum <= 40) targetSec = 2;
  else if (qNum >= 41 && qNum <= 60) targetSec = 3;
  else if (qNum >= 61 && qNum <= 80) targetSec = 4;

  if (STATE.activeSection !== targetSec) {
    switchSection(targetSec);
  }

  setTimeout(() => {
    const card = document.getElementById(`q-card-${qNum}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('active-question');
      setTimeout(() => card.classList.remove('active-question'), 1500);
    }
  }, 80);
}

function updateProgressHud() {
  const answeredCount = Object.keys(STATE.answers).filter(k => {
    return STATE.answers[k] && String(STATE.answers[k]).trim().length > 0;
  }).length;

  const pct = Math.round((answeredCount / 80) * 100);

  if (el.progressFill) el.progressFill.style.width = `${pct}%`;
  if (el.progressLabel) el.progressLabel.textContent = `${answeredCount} / 80 ጥያቄዎች ተመልሰዋል (${pct}%)`;
}

function openSubmitModal() {
  const answeredCount = Object.keys(STATE.answers).filter(k => {
    return STATE.answers[k] && String(STATE.answers[k]).trim().length > 0;
  }).length;

  const unanswered = 80 - answeredCount;

  if (el.unansweredCountSpan) el.unansweredCountSpan.textContent = unanswered;
  if (unanswered > 0) el.unansweredWarningBox.style.display = 'block';
  else el.unansweredWarningBox.style.display = 'none';

  if (el.submitModal) el.submitModal.classList.add('active-modal');
}

function closeSubmitModal() {
  if (el.submitModal) el.submitModal.classList.remove('active-modal');
}

async function submitFinalEvaluation() {
  closeSubmitModal();

  if (STATE.timerInterval) clearInterval(STATE.timerInterval);
  if (STATE.autoSaveInterval) clearInterval(STATE.autoSaveInterval);

  try {
    const timeSpent = (150 * 60) - STATE.timerSeconds;

    const res = await fetch('/api/evaluation/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attempt_id: STATE.attemptId,
        answers: STATE.answers,
        time_spent_seconds: timeSpent
      })
    });

    const data = await res.json();
    if (data.success) {
      STATE.submissionResult = data;
      renderResultsView(data);
      renderView('results');
    } else {
      alert('ስህተት ተከስቷል፦ ' + (data.error || 'Submission failed'));
    }
  } catch (err) {
    console.error('Submission error:', err);
    alert('ፈተናውን ማስገባት አልተቻለም።');
  }
}

function renderResultsView(resultData) {
  if (!el.resultsContainer) return;

  if (resultData.result_visibility === 'MANUAL_RELEASE') {
    el.resultsContainer.innerHTML = `
      <div class="glass-panel text-center" style="padding: 3rem; text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
        <h2 style="font-size: 1.8rem; margin-bottom: 0.75rem;">ፈተናዎ በተሳካ ሁኔታ ተቆልፏል</h2>
        <p style="color: var(--text-secondary); max-width: 500px; margin: 0 auto 1.5rem auto;">
          ${resultData.message || 'የውጤት ዝርዝሩ በአስተዳዳሪው እንደተለቀቀ ይገለጻል።'}
        </p>
        <div style="font-size: 0.9rem; color: var(--text-muted);">
          የተፈታኝ ስም፦ <strong>${escapeHtml(resultData.candidate_name)}</strong> | የስራ ክፍል፦ <strong>${escapeHtml(resultData.department)}</strong>
        </div>
      </div>
    `;
    return;
  }

  const s = resultData.summary;
  const isPass = s.passed;

  const formatMinSec = (secs) => {
    const m = Math.floor(secs / 60);
    const sec = secs % 60;
    return `${m} ደቂቃ ከ ${sec} ሴኮንድ`;
  };

  el.resultsContainer.innerHTML = `
    <div class="glass-panel results-card-container">
      <div class="cert-header">
        <span class="cert-badge ${isPass ? 'pass' : 'fail'}">
          ${isPass ? '✓ ብቁ ሆነዋል (PASSED)' : '✕ አላለፉም (DID NOT PASS)'}
        </span>
        <h1 style="font-size: 2rem; margin-bottom: 0.5rem; font-family: var(--font-am);">
          የአመራር ብቃት ምዘና ውጤት
        </h1>
        <p style="color: var(--text-secondary);">
          ዶንኪ ቲዩብ (DonkeyTube) — የማኔጅመንትና አመራር ብቃት መመዘኛ ፈተና
        </p>

        <div class="cert-score-circle" style="border-color: ${isPass ? '#10b981' : '#ef4444'};">
          <div class="cert-score-num">${s.total_score}</div>
          <div class="cert-score-label">ከ 100 ነጥብ (${s.percentage}%)</div>
        </div>

        <div style="font-size: 0.95rem; color: var(--text-secondary); margin-top: 1rem;">
          ተፈታኝ፦ <strong style="color: #fff;">${escapeHtml(resultData.candidate_name)}</strong> &nbsp;|&nbsp;
          የስራ ክፍል፦ <strong style="color: #fff;">${escapeHtml(resultData.department)}</strong> &nbsp;|&nbsp;
          የፈጀው ጊዜ፦ <strong style="color: #fff;">${formatMinSec(resultData.time_spent_seconds)}</strong>
        </div>
      </div>

      <div class="cert-breakdown-grid">
        <div class="cert-sec-box">
          <div class="cert-sec-title">ክፍል 1፡ እውነት ወይም ሐሰት</div>
          <div class="cert-sec-score">${s.sec1_score} <span style="font-size: 1rem; color: var(--text-muted);">/ 20</span></div>
        </div>
        <div class="cert-sec-box">
          <div class="cert-sec-title">ክፍል 2፡ ባዶ ቦታ ሙላ</div>
          <div class="cert-sec-score">${s.sec2_score} <span style="font-size: 1rem; color: var(--text-muted);">/ 20</span></div>
        </div>
        <div class="cert-sec-box">
          <div class="cert-sec-title">ክፍል 3፡ ባለብዙ አማራጭ</div>
          <div class="cert-sec-score">${s.sec3_score} <span style="font-size: 1rem; color: var(--text-muted);">/ 40</span></div>
        </div>
        <div class="cert-sec-box">
          <div class="cert-sec-title">ክፍል 4፡ አብራራ / አጭር መልስ</div>
          <div class="cert-sec-score">${s.sec4_score} <span style="font-size: 1rem; color: var(--text-muted);">/ 20</span></div>
        </div>
      </div>

      <div style="text-align: center; margin-top: 1rem;">
        <button type="button" class="btn-primary" style="max-width: 260px; margin: 0 auto;" onclick="window.print()">
          🖨️ ውጤቱን አትም (Print Certificate)
        </button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
