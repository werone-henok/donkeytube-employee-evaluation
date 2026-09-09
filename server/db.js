const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'evaluations.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS evaluation_versions (
      id TEXT PRIMARY KEY,
      version TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      department TEXT,
      time_limit_minutes INTEGER NOT NULL DEFAULT 150,
      total_questions INTEGER NOT NULL DEFAULT 80,
      total_points INTEGER NOT NULL DEFAULT 100,
      passing_percentage REAL NOT NULL DEFAULT 70.0,
      is_locked INTEGER NOT NULL DEFAULT 1,
      is_published INTEGER NOT NULL DEFAULT 1,
      source_question_file TEXT,
      source_question_sha256 TEXT,
      source_answer_file TEXT,
      source_answer_sha256 TEXT,
      imported_at TEXT,
      imported_by TEXT,
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      evaluation_id TEXT NOT NULL,
      question_number INTEGER NOT NULL,
      section_number INTEGER NOT NULL,
      section_title TEXT NOT NULL,
      question_type TEXT NOT NULL,
      question_text TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL,
      FOREIGN KEY (evaluation_id) REFERENCES evaluation_versions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS question_choices (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      choice_key TEXT NOT NULL,
      choice_text TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS answer_keys (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL UNIQUE,
      question_number INTEGER NOT NULL,
      official_answer TEXT NOT NULL,
      primary_answer TEXT,
      accepted_answers_json TEXT NOT NULL,
      english_equivalent TEXT,
      amharic_equivalent TEXT,
      correct_choice_key TEXT,
      case_sensitive INTEGER NOT NULL DEFAULT 0,
      whitespace_normalize INTEGER NOT NULL DEFAULT 1,
      punctuation_normalize INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rubrics (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL UNIQUE,
      question_number INTEGER NOT NULL,
      model_answer TEXT NOT NULL,
      required_concepts_json TEXT NOT NULL,
      accepted_keywords_json TEXT NOT NULL,
      min_concepts INTEGER NOT NULL DEFAULT 1,
      grading_mode TEXT NOT NULL DEFAULT 'AUTO',
      admin_notes TEXT,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS evaluation_attempts (
      id TEXT PRIMARY KEY,
      evaluation_id TEXT NOT NULL,
      candidate_name TEXT NOT NULL,
      department TEXT NOT NULL,
      employee_id TEXT,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      started_at TEXT NOT NULL,
      submitted_at TEXT,
      time_spent_seconds INTEGER DEFAULT 0,
      sec1_score REAL DEFAULT 0,
      sec2_score REAL DEFAULT 0,
      sec3_score REAL DEFAULT 0,
      sec4_score REAL DEFAULT 0,
      total_score REAL DEFAULT 0,
      percentage REAL DEFAULT 0,
      passed INTEGER DEFAULT 0,
      answers_payload_json TEXT,
      result_visibility TEXT DEFAULT 'IMMEDIATE',
      FOREIGN KEY (evaluation_id) REFERENCES evaluation_versions(id)
    );

    CREATE TABLE IF NOT EXISTS attempt_answers (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      question_number INTEGER NOT NULL,
      section_number INTEGER NOT NULL,
      submitted_answer TEXT,
      awarded_points REAL NOT NULL DEFAULT 0,
      max_points REAL NOT NULL DEFAULT 1,
      is_correct INTEGER NOT NULL DEFAULT 0,
      grading_details_json TEXT,
      manual_reviewed INTEGER NOT NULL DEFAULT 0,
      reviewer_notes TEXT,
      FOREIGN KEY (attempt_id) REFERENCES evaluation_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Default settings if missing
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  
  if (!getSetting.get('result_visibility')) {
    setSetting.run('result_visibility', 'IMMEDIATE');
  }
  if (!getSetting.get('pass_threshold_percentage')) {
    setSetting.run('pass_threshold_percentage', '70');
  }
}

// Seed Database from data/seed_evaluation_v1.json
function seedFromOfficialFile() {
  const seedPath = path.join(__dirname, '..', 'data', 'seed_evaluation_v1.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('Seed file does not exist yet:', seedPath);
    return;
  }

  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const versionRow = db.prepare('SELECT id FROM evaluation_versions WHERE version = ?').get(seed.version);

  if (versionRow) {
    // Already seeded
    return;
  }

  console.log(`Seeding official evaluation version ${seed.version}...`);
  const evalId = 'eval-' + seed.version;

  const insertVersion = db.prepare(`
    INSERT INTO evaluation_versions (
      id, version, title, description, department, time_limit_minutes,
      total_questions, total_points, passing_percentage, is_locked, is_published,
      source_question_file, source_question_sha256, source_answer_file, source_answer_sha256,
      imported_at, imported_by, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertQuestion = db.prepare(`
    INSERT INTO questions (
      id, evaluation_id, question_number, section_number, section_title,
      question_type, question_text, points, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertChoice = db.prepare(`
    INSERT INTO question_choices (
      id, question_id, choice_key, choice_text, display_order
    ) VALUES (?, ?, ?, ?, ?)
  `);

  const insertAnswerKey = db.prepare(`
    INSERT INTO answer_keys (
      id, question_id, question_number, official_answer, primary_answer,
      accepted_answers_json, english_equivalent, amharic_equivalent,
      correct_choice_key, case_sensitive, whitespace_normalize, punctuation_normalize
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRubric = db.prepare(`
    INSERT INTO rubrics (
      id, question_id, question_number, model_answer,
      required_concepts_json, accepted_keywords_json, min_concepts,
      grading_mode, admin_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    // Insert version
    insertVersion.run(
      evalId,
      seed.version,
      seed.title,
      seed.description,
      seed.department,
      seed.time_limit_minutes,
      seed.total_questions,
      seed.total_points,
      seed.passing_percentage,
      seed.is_locked ? 1 : 0,
      seed.is_published ? 1 : 0,
      seed.source_metadata.question_file_name,
      seed.source_metadata.question_file_sha256,
      seed.source_metadata.answer_file_name,
      seed.source_metadata.answer_file_sha256,
      seed.source_metadata.imported_at,
      seed.source_metadata.imported_by,
      seed.source_metadata.imported_at
    );

    // Map answers by question_number
    const answersMap = {};
    for (const a of seed.answers) {
      answersMap[a.question_number] = a;
    }

    // Insert Questions
    for (const q of seed.questions) {
      const qId = `${evalId}-q${q.question_number}`;
      insertQuestion.run(
        qId,
        evalId,
        q.question_number,
        q.section_number,
        q.section_title,
        q.question_type,
        q.question_text,
        q.points,
        q.question_number
      );

      // Choices (for Section 3)
      if (q.choices && q.choices.length > 0) {
        q.choices.forEach((c, cIdx) => {
          insertChoice.run(
            `${qId}-c${c.key}`,
            qId,
            c.key,
            c.text,
            cIdx + 1
          );
        });
      }

      // Answer key
      const ans = answersMap[q.question_number];
      if (ans) {
        insertAnswerKey.run(
          `${qId}-ans`,
          qId,
          q.question_number,
          ans.official_answer || '',
          ans.primary_answer || '',
          JSON.stringify(ans.accepted_answers || []),
          ans.english_equivalent || '',
          ans.amharic_equivalent || '',
          ans.correct_choice_key || null,
          ans.case_sensitive ? 1 : 0,
          ans.whitespace_normalize !== false ? 1 : 0,
          ans.punctuation_normalize !== false ? 1 : 0
        );

        // If Section 4 (Essay / Short answer), insert Rubric
        if (q.section_number === 4) {
          insertRubric.run(
            `${qId}-rubric`,
            qId,
            q.question_number,
            ans.model_answer || ans.official_answer || '',
            JSON.stringify(ans.required_concepts || []),
            JSON.stringify(ans.accepted_keywords || []),
            ans.min_concepts || 1,
            ans.grading_mode || 'AUTO',
            ans.admin_notes || ''
          );
        }
      }
    }
  });

  transaction();
  console.log(`Successfully seeded ${seed.total_questions} questions for version ${seed.version}`);
}

initSchema();
seedFromOfficialFile();

module.exports = {
  db,
  initSchema,
  seedFromOfficialFile
};
