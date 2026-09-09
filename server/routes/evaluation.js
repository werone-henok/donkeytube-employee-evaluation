const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../db');
const { gradeCompleteEvaluation } = require('../grading_engine');

/**
 * GET /api/evaluation/active
 * Returns the currently published evaluation with 80 questions.
 * SECURITY: Absolutely NO correct answers, accepted variants, or rubrics are returned.
 */
router.get('/active', async (req, res) => {
  try {
    const version = await db.get(
      'SELECT * FROM evaluation_versions WHERE is_published = 1 ORDER BY imported_at DESC LIMIT 1'
    );
    if (!version) {
      return res.status(404).json({ error: 'No published evaluation found' });
    }

    const questions = await db.query(`
      SELECT id, evaluation_id, question_number, section_number, section_title,
             question_type, question_text, points, display_order
      FROM questions
      WHERE evaluation_id = ?
      ORDER BY question_number ASC
    `, [version.id]);

    // Fetch all choices for this evaluation in one efficient query
    const choices = await db.query(`
      SELECT qc.question_id, qc.choice_key as \`key\`, qc.choice_text as \`text\`
      FROM question_choices qc
      JOIN questions q ON qc.question_id = q.id
      WHERE q.evaluation_id = ?
      ORDER BY qc.display_order ASC
    `, [version.id]);

    const choicesByQuestion = {};
    for (const c of choices) {
      if (!choicesByQuestion[c.question_id]) choicesByQuestion[c.question_id] = [];
      choicesByQuestion[c.question_id].push({ key: c.key, text: c.text });
    }

    const sanitizedQuestions = questions.map(q => {
      const qObj = {
        id: q.id,
        question_number: q.question_number,
        section_number: q.section_number,
        section_title: q.section_title,
        question_type: q.question_type,
        question_text: q.question_text,
        points: Number(q.points)
      };

      if (q.question_type === 'MULTIPLE_CHOICE') {
        qObj.choices = choicesByQuestion[q.id] || [];
      }
      return qObj;
    });

    const settingsRow = await db.get("SELECT `value` FROM settings WHERE `key` = 'result_visibility'");
    const resultVisibility = settingsRow ? settingsRow.value : 'IMMEDIATE';

    res.json({
      evaluation: {
        id: version.id,
        version: version.version,
        title: version.title,
        description: version.description,
        department: version.department,
        time_limit_minutes: version.time_limit_minutes,
        total_questions: version.total_questions,
        total_points: version.total_points,
        passing_percentage: Number(version.passing_percentage),
        result_visibility: resultVisibility
      },
      questions: sanitizedQuestions
    });
  } catch (err) {
    console.error('Error fetching active evaluation:', err);
    res.status(500).json({ error: 'Internal server error fetching evaluation' });
  }
});

/**
 * POST /api/evaluation/start
 * Starts a new candidate evaluation attempt session.
 */
router.post('/start', async (req, res) => {
  try {
    const { candidate_name, department, employee_id, evaluation_id } = req.body;

    if (!candidate_name || !candidate_name.trim()) {
      return res.status(400).json({ error: 'Candidate name is required' });
    }

    const evalRow = evaluation_id
      ? await db.get('SELECT * FROM evaluation_versions WHERE id = ?', [evaluation_id])
      : await db.get('SELECT * FROM evaluation_versions WHERE is_published = 1 ORDER BY imported_at DESC LIMIT 1');

    if (!evalRow) {
      return res.status(404).json({ error: 'Evaluation version not found' });
    }

    const attemptId = 'att-' + crypto.randomUUID();
    const startedAt = new Date().toISOString();

    await db.execute(`
      INSERT INTO evaluation_attempts (
        id, evaluation_id, candidate_name, department, employee_id,
        status, started_at, answers_payload_json
      ) VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, '{}')
    `, [
      attemptId,
      evalRow.id,
      candidate_name.trim(),
      (department || 'Social Media Business').trim(),
      (employee_id || '').trim(),
      startedAt
    ]);

    res.json({
      attempt_id: attemptId,
      evaluation_id: evalRow.id,
      candidate_name: candidate_name.trim(),
      department: department || 'Social Media Business',
      started_at: startedAt,
      time_limit_minutes: evalRow.time_limit_minutes
    });
  } catch (err) {
    console.error('Error starting attempt:', err);
    res.status(500).json({ error: 'Failed to start evaluation attempt' });
  }
});

/**
 * POST /api/evaluation/save-draft
 * Auto-saves candidate responses in real-time.
 */
router.post('/save-draft', async (req, res) => {
  try {
    const { attempt_id, answers, time_spent_seconds } = req.body;

    if (!attempt_id) {
      return res.status(400).json({ error: 'Attempt ID is required' });
    }

    const attempt = await db.get('SELECT * FROM evaluation_attempts WHERE id = ?', [attempt_id]);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attempt.status === 'LOCKED' || attempt.status === 'SUBMITTED') {
      return res.status(403).json({ error: 'Attempt is locked and cannot be modified' });
    }

    await db.execute(`
      UPDATE evaluation_attempts
      SET answers_payload_json = ?, time_spent_seconds = ?
      WHERE id = ?
    `, [
      JSON.stringify(answers || {}),
      time_spent_seconds || attempt.time_spent_seconds,
      attempt_id
    ]);

    res.json({ success: true, saved_at: new Date().toISOString() });
  } catch (err) {
    console.error('Error saving draft:', err);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

/**
 * POST /api/evaluation/submit
 * Locks attempt, prevents further edits, grades securely server-side.
 */
router.post('/submit', async (req, res) => {
  try {
    const { attempt_id, answers, time_spent_seconds } = req.body;

    if (!attempt_id) {
      return res.status(400).json({ error: 'Attempt ID is required' });
    }

    const attempt = await db.get('SELECT * FROM evaluation_attempts WHERE id = ?', [attempt_id]);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attempt.status === 'LOCKED' || attempt.status === 'SUBMITTED') {
      return res.status(400).json({ error: 'This evaluation has already been submitted and locked.' });
    }

    const submittedAt = new Date().toISOString();
    const submittedAnswers = answers || JSON.parse(attempt.answers_payload_json || '{}');

    // 1. Fetch questions, answer keys, rubrics
    const evalId = attempt.evaluation_id;
    const questions = await db.query('SELECT * FROM questions WHERE evaluation_id = ? ORDER BY question_number ASC', [evalId]);
    const answerKeys = await db.query('SELECT * FROM answer_keys WHERE question_id IN (SELECT id FROM questions WHERE evaluation_id = ?)', [evalId]);
    const rubrics = await db.query('SELECT * FROM rubrics WHERE question_id IN (SELECT id FROM questions WHERE evaluation_id = ?)', [evalId]);

    const ansKeysMap = {};
    for (const ak of answerKeys) ansKeysMap[ak.question_number] = ak;

    const rubricsMap = {};
    for (const rb of rubrics) rubricsMap[rb.question_number] = rb;

    const evalRow = await db.get('SELECT * FROM evaluation_versions WHERE id = ?', [evalId]);
    const passThreshold = evalRow ? Number(evalRow.passing_percentage) : 70.0;

    // 2. Run secure server-side grading
    const gradeResult = gradeCompleteEvaluation(submittedAnswers, questions, ansKeysMap, rubricsMap, passThreshold);

    // 3. System visibility setting
    const settingsRow = await db.get("SELECT `value` FROM settings WHERE `key` = 'result_visibility'");
    const resultVisibility = settingsRow ? settingsRow.value : 'IMMEDIATE';

    // 4. Record into DB in a MySQL transaction
    await db.transaction(async (conn) => {
      await conn.query(`
        UPDATE evaluation_attempts
        SET status = 'LOCKED',
            submitted_at = ?,
            time_spent_seconds = ?,
            sec1_score = ?,
            sec2_score = ?,
            sec3_score = ?,
            sec4_score = ?,
            total_score = ?,
            percentage = ?,
            passed = ?,
            answers_payload_json = ?,
            result_visibility = ?
        WHERE id = ?
      `, [
        submittedAt,
        time_spent_seconds || attempt.time_spent_seconds,
        gradeResult.sec1_score,
        gradeResult.sec2_score,
        gradeResult.sec3_score,
        gradeResult.sec4_score,
        gradeResult.total_score,
        gradeResult.percentage,
        gradeResult.passed ? 1 : 0,
        JSON.stringify(submittedAnswers),
        resultVisibility,
        attempt_id
      ]);

      for (const item of (gradeResult.item_results || [])) {
        const itemAnsId = 'ans-' + crypto.randomUUID();
        await conn.query(`
          INSERT INTO attempt_answers (
            id, attempt_id, question_id, question_number, section_number,
            submitted_answer, awarded_points, max_points, is_correct,
            grading_details_json, manual_reviewed, reviewer_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '')
        `, [
          itemAnsId,
          attempt_id,
          item.question_id,
          item.question_number,
          item.section_number,
          item.submitted_answer,
          item.awarded_points,
          item.max_points,
          item.is_correct ? 1 : 0,
          JSON.stringify(item.grading_details)
        ]);
      }
    });

    if (resultVisibility === 'IMMEDIATE') {
      res.json({
        success: true,
        attempt_id: attempt_id,
        status: 'LOCKED',
        result_visibility: 'IMMEDIATE',
        candidate_name: attempt.candidate_name,
        department: attempt.department,
        submitted_at: submittedAt,
        summary: {
          sec1_score: gradeResult.sec1_score,
          sec1_max: 20,
          sec2_score: gradeResult.sec2_score,
          sec2_max: 20,
          sec3_score: gradeResult.sec3_score,
          sec3_max: 40,
          sec4_score: gradeResult.sec4_score,
          sec4_max: 20,
          total_score: gradeResult.total_score,
          total_max: 100,
          percentage: gradeResult.percentage,
          passed: gradeResult.passed
        }
      });
    } else {
      res.json({
        success: true,
        attempt_id: attempt_id,
        status: 'LOCKED',
        result_visibility: 'MANUAL_RELEASE',
        candidate_name: attempt.candidate_name,
        department: attempt.department,
        submitted_at: submittedAt,
        message: 'ፈተናዎ በተሳካ ሁኔታ ተጠናቆ ተቆልፏል። የውጤት ዝርዝሩ በአስተዳዳሪው እንደተለቀቀ ይገለጻል።'
      });
    }
  } catch (err) {
    console.error('Error submitting evaluation:', err);
    res.status(500).json({ error: 'Failed to submit evaluation' });
  }
});

/**
 * GET /api/evaluation/attempt/:id/result
 */
router.get('/attempt/:id/result', async (req, res) => {
  try {
    const attempt = await db.get('SELECT * FROM evaluation_attempts WHERE id = ?', [req.params.id]);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attempt.status !== 'LOCKED' && attempt.status !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Evaluation is still in progress' });
    }

    const settingsRow = await db.get("SELECT `value` FROM settings WHERE `key` = 'result_visibility'");
    const resultVisibility = settingsRow ? settingsRow.value : 'IMMEDIATE';

    if (resultVisibility !== 'IMMEDIATE' && !req.query.admin) {
      return res.json({
        attempt_id: attempt.id,
        candidate_name: attempt.candidate_name,
        department: attempt.department,
        status: attempt.status,
        result_visibility: 'MANUAL_RELEASE',
        message: 'ውጤቱ ገና በአስተዳዳሪ አልተለቀቀም።'
      });
    }

    res.json({
      attempt_id: attempt.id,
      candidate_name: attempt.candidate_name,
      department: attempt.department,
      status: attempt.status,
      started_at: attempt.started_at,
      submitted_at: attempt.submitted_at,
      time_spent_seconds: attempt.time_spent_seconds,
      result_visibility: resultVisibility,
      summary: {
        sec1_score: Number(attempt.sec1_score),
        sec1_max: 20,
        sec2_score: Number(attempt.sec2_score),
        sec2_max: 20,
        sec3_score: Number(attempt.sec3_score),
        sec3_max: 40,
        sec4_score: Number(attempt.sec4_score),
        sec4_max: 20,
        total_score: Number(attempt.total_score),
        total_max: 100,
        percentage: Number(attempt.percentage),
        passed: attempt.passed === 1
      }
    });
  } catch (err) {
    console.error('Error fetching result:', err);
    res.status(500).json({ error: 'Failed to fetch result' });
  }
});

module.exports = router;
