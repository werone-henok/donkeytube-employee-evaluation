const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'donkeytube_evaluation',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

let pool = null;

/**
 * Initializes MySQL database:
 * 1. Creates database if it doesn't exist
 * 2. Connects connection pool
 * 3. Creates schema tables
 * 4. Inserts default settings
 */
async function initDb() {
  // Step 1: Connect to MySQL server without database to ensure database exists
  try {
    const rootConn = await mysql.createConnection({
      host: DB_CONFIG.host,
      port: DB_CONFIG.port,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password
    });

    await rootConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await rootConn.end();
  } catch (err) {
    console.error('Warning: Could not check/create database via root connection:', err.message);
  }

  // Step 2: Initialize connection pool
  pool = mysql.createPool(DB_CONFIG);

  // Test connection
  try {
    const testConn = await pool.getConnection();
    testConn.release();
    console.log(`[MySQL] Connected to database "${DB_CONFIG.database}" on ${DB_CONFIG.host}:${DB_CONFIG.port}`);
  } catch (err) {
    console.error(`[MySQL] Connection error to ${DB_CONFIG.host}:${DB_CONFIG.port}:`, err.message);
    throw err;
  }

  // Step 3: Initialize schemas
  await initSchema();

  // Step 4: Seed if empty
  await seedFromOfficialFile();
}

async function initSchema() {
  const conn = await pool.getConnection();
  try {
    // 1. evaluation_versions
    await conn.query(`
      CREATE TABLE IF NOT EXISTS evaluation_versions (
        id VARCHAR(64) PRIMARY KEY,
        version VARCHAR(64) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        department VARCHAR(255),
        time_limit_minutes INT NOT NULL DEFAULT 150,
        total_questions INT NOT NULL DEFAULT 80,
        total_points INT NOT NULL DEFAULT 100,
        passing_percentage DECIMAL(5,2) NOT NULL DEFAULT 70.00,
        is_locked TINYINT(1) NOT NULL DEFAULT 1,
        is_published TINYINT(1) NOT NULL DEFAULT 1,
        source_question_file VARCHAR(255),
        source_question_sha256 VARCHAR(128),
        source_answer_file VARCHAR(255),
        source_answer_sha256 VARCHAR(128),
        imported_at VARCHAR(64),
        imported_by VARCHAR(128),
        published_at VARCHAR(64)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2. questions
    await conn.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id VARCHAR(64) PRIMARY KEY,
        evaluation_id VARCHAR(64) NOT NULL,
        question_number INT NOT NULL,
        section_number INT NOT NULL,
        section_title VARCHAR(255) NOT NULL,
        question_type VARCHAR(64) NOT NULL,
        question_text TEXT NOT NULL,
        points DECIMAL(5,2) NOT NULL DEFAULT 1.00,
        display_order INT NOT NULL,
        KEY idx_eval_qnum (evaluation_id, question_number),
        CONSTRAINT fk_q_eval FOREIGN KEY (evaluation_id) REFERENCES evaluation_versions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 3. question_choices
    await conn.query(`
      CREATE TABLE IF NOT EXISTS question_choices (
        id VARCHAR(64) PRIMARY KEY,
        question_id VARCHAR(64) NOT NULL,
        choice_key VARCHAR(16) NOT NULL,
        choice_text TEXT NOT NULL,
        display_order INT NOT NULL,
        KEY idx_choice_q (question_id),
        CONSTRAINT fk_qc_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 4. answer_keys
    await conn.query(`
      CREATE TABLE IF NOT EXISTS answer_keys (
        id VARCHAR(64) PRIMARY KEY,
        question_id VARCHAR(64) NOT NULL UNIQUE,
        question_number INT NOT NULL,
        official_answer TEXT NOT NULL,
        primary_answer TEXT,
        accepted_answers_json LONGTEXT NOT NULL,
        english_equivalent TEXT,
        amharic_equivalent TEXT,
        correct_choice_key VARCHAR(16),
        case_sensitive TINYINT(1) NOT NULL DEFAULT 0,
        whitespace_normalize TINYINT(1) NOT NULL DEFAULT 1,
        punctuation_normalize TINYINT(1) NOT NULL DEFAULT 1,
        KEY idx_ak_qnum (question_number),
        CONSTRAINT fk_ak_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 5. rubrics
    await conn.query(`
      CREATE TABLE IF NOT EXISTS rubrics (
        id VARCHAR(64) PRIMARY KEY,
        question_id VARCHAR(64) NOT NULL UNIQUE,
        question_number INT NOT NULL,
        model_answer TEXT NOT NULL,
        required_concepts_json LONGTEXT NOT NULL,
        accepted_keywords_json LONGTEXT NOT NULL,
        min_concepts INT NOT NULL DEFAULT 1,
        grading_mode VARCHAR(32) NOT NULL DEFAULT 'AUTO',
        admin_notes TEXT,
        KEY idx_rb_qnum (question_number),
        CONSTRAINT fk_rb_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 6. evaluation_attempts
    await conn.query(`
      CREATE TABLE IF NOT EXISTS evaluation_attempts (
        id VARCHAR(64) PRIMARY KEY,
        evaluation_id VARCHAR(64) NOT NULL,
        candidate_name VARCHAR(255) NOT NULL,
        department VARCHAR(255) NOT NULL,
        employee_id VARCHAR(128),
        status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS',
        started_at VARCHAR(64) NOT NULL,
        submitted_at VARCHAR(64),
        time_spent_seconds INT DEFAULT 0,
        sec1_score DECIMAL(5,2) DEFAULT 0.00,
        sec2_score DECIMAL(5,2) DEFAULT 0.00,
        sec3_score DECIMAL(5,2) DEFAULT 0.00,
        sec4_score DECIMAL(5,2) DEFAULT 0.00,
        total_score DECIMAL(5,2) DEFAULT 0.00,
        percentage DECIMAL(5,2) DEFAULT 0.00,
        passed TINYINT(1) DEFAULT 0,
        answers_payload_json LONGTEXT,
        result_visibility VARCHAR(32) DEFAULT 'IMMEDIATE',
        KEY idx_att_status (status),
        KEY idx_att_started (started_at),
        CONSTRAINT fk_att_eval FOREIGN KEY (evaluation_id) REFERENCES evaluation_versions(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 7. attempt_answers
    await conn.query(`
      CREATE TABLE IF NOT EXISTS attempt_answers (
        id VARCHAR(64) PRIMARY KEY,
        attempt_id VARCHAR(64) NOT NULL,
        question_id VARCHAR(64) NOT NULL,
        question_number INT NOT NULL,
        section_number INT NOT NULL,
        submitted_answer TEXT,
        awarded_points DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        max_points DECIMAL(5,2) NOT NULL DEFAULT 1.00,
        is_correct TINYINT(1) NOT NULL DEFAULT 0,
        grading_details_json LONGTEXT,
        manual_reviewed TINYINT(1) NOT NULL DEFAULT 0,
        reviewer_notes TEXT,
        KEY idx_aa_att (attempt_id),
        KEY idx_aa_qnum (attempt_id, question_number),
        CONSTRAINT fk_aa_att FOREIGN KEY (attempt_id) REFERENCES evaluation_attempts(id) ON DELETE CASCADE,
        CONSTRAINT fk_aa_q FOREIGN KEY (question_id) REFERENCES questions(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 8. settings
    await conn.query(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(64) PRIMARY KEY,
        \`value\` TEXT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Default settings if missing
    await conn.query(`
      INSERT INTO settings (\`key\`, \`value\`)
      VALUES ('result_visibility', 'IMMEDIATE')
      ON DUPLICATE KEY UPDATE \`key\`=\`key\`
    `);
    await conn.query(`
      INSERT INTO settings (\`key\`, \`value\`)
      VALUES ('pass_threshold_percentage', '70')
      ON DUPLICATE KEY UPDATE \`key\`=\`key\`
    `);

  } finally {
    conn.release();
  }
}

/**
 * Seed Database from data/seed_evaluation_v1.json
 */
async function seedFromOfficialFile() {
  const seedPath = path.join(__dirname, '..', 'data', 'seed_evaluation_v1.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('[MySQL] Seed file does not exist:', seedPath);
    return;
  }

  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const [existing] = await pool.query(
    'SELECT id FROM evaluation_versions WHERE version = ?',
    [seed.version]
  );

  if (existing && existing.length > 0) {
    // Already seeded
    return;
  }

  console.log(`[MySQL] Seeding official evaluation version ${seed.version}...`);
  const evalId = 'eval-' + seed.version;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Insert Version
    await conn.query(
      `INSERT INTO evaluation_versions (
        id, version, title, description, department, time_limit_minutes,
        total_questions, total_points, passing_percentage, is_locked, is_published,
        source_question_file, source_question_sha256, source_answer_file, source_answer_sha256,
        imported_at, imported_by, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
      ]
    );

    // Build answers map
    const answersMap = {};
    for (const a of seed.answers) {
      answersMap[a.question_number] = a;
    }

    // 2. Insert Questions, Choices, Answer Keys, Rubrics
    for (const q of seed.questions) {
      const qId = `${evalId}-q${q.question_number}`;

      await conn.query(
        `INSERT INTO questions (
          id, evaluation_id, question_number, section_number, section_title,
          question_type, question_text, points, display_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          qId,
          evalId,
          q.question_number,
          q.section_number,
          q.section_title,
          q.question_type,
          q.question_text,
          q.points,
          q.question_number
        ]
      );

      // Choices (Section 3)
      if (q.choices && q.choices.length > 0) {
        for (let cIdx = 0; cIdx < q.choices.length; cIdx++) {
          const c = q.choices[cIdx];
          await conn.query(
            `INSERT INTO question_choices (
              id, question_id, choice_key, choice_text, display_order
            ) VALUES (?, ?, ?, ?, ?)`,
            [
              `${qId}-c${c.key}`,
              qId,
              c.key,
              c.text,
              cIdx + 1
            ]
          );
        }
      }

      // Answer key
      const ans = answersMap[q.question_number];
      if (ans) {
        await conn.query(
          `INSERT INTO answer_keys (
            id, question_id, question_number, official_answer, primary_answer,
            accepted_answers_json, english_equivalent, amharic_equivalent,
            correct_choice_key, case_sensitive, whitespace_normalize, punctuation_normalize
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
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
          ]
        );

        // Rubric for Section 4
        if (q.section_number === 4) {
          await conn.query(
            `INSERT INTO rubrics (
              id, question_id, question_number, model_answer,
              required_concepts_json, accepted_keywords_json, min_concepts,
              grading_mode, admin_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              `${qId}-rubric`,
              qId,
              q.question_number,
              ans.model_answer || ans.official_answer || '',
              JSON.stringify(ans.required_concepts || []),
              JSON.stringify(ans.accepted_keywords || []),
              ans.min_concepts || 1,
              ans.grading_mode || 'AUTO',
              ans.admin_notes || ''
            ]
          );
        }
      }
    }

    await conn.commit();
    console.log(`[MySQL] Successfully seeded ${seed.total_questions} questions for version ${seed.version}`);
  } catch (err) {
    await conn.rollback();
    console.error('[MySQL] Error seeding database:', err);
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Helper query functions
 */
const db = {
  getPool: () => pool,

  async query(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows;
  },

  async get(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows && rows.length > 0 ? rows[0] : null;
  },

  async execute(sql, params = []) {
    const [result] = await pool.execute(sql, params);
    return result;
  },

  async transaction(callback) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await callback(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
};

module.exports = {
  db,
  initDb,
  initSchema,
  seedFromOfficialFile
};
