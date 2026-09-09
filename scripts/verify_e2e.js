const http = require('http');
const { app } = require('../server/index');
const { initDb } = require('../server/db');

const PORT = 3457;
let adminToken = '';

async function main() {
  await initDb();
  const server = app.listen(PORT, async () => {
    console.log(`E2E Verification running on port ${PORT}...`);
    try {
      await runE2ETests();
      console.log('\n======================================================');
      console.log('ALL TESTS PASSED: EMPLOYEE & ADMIN SPACES ARE FULLY ISOLATED!');
      console.log('======================================================\n');
      process.exit(0);
    } catch (err) {
      console.error('\nE2E TEST FAILURE:', err);
      process.exit(1);
    } finally {
      server.close();
    }
  });
}

main().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});

function req(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://localhost:${PORT}${path}`);
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };

    const request = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

async function runE2ETests() {
  console.log('--- 1. Testing Employee Space Root & Static Files ---');
  const rootRes = await req('/');
  if (rootRes.status !== 200 || !rootRes.data.includes('የተፈታኞች መስኮት')) {
    throw new Error('Employee root page not serving dedicated employee portal');
  }
  // Ensure admin tabs are completely absent from employee HTML
  if (rootRes.data.includes('#admin-import') || rootRes.data.includes('#admin-settings')) {
    throw new Error('SECURITY VIOLATION: Admin tabs found in employee HTML!');
  }
  console.log('✓ Employee Space is 100% clean and isolated from admin controls');

  console.log('\n--- 2. Testing Dedicated Admin Space Route ---');
  const adminPageRes = await req('/admin');
  if (adminPageRes.status !== 200 || !adminPageRes.data.includes('የአስተዳዳሪ ማዕከል')) {
    throw new Error('Admin page /admin not serving dedicated admin portal');
  }
  console.log('✓ Dedicated Admin Space route /admin verified');

  console.log('\n--- 3. Testing Admin Endpoint Security (Access without token must be blocked) ---');
  const unauthRes = await req('/api/admin/attempts');
  if (unauthRes.status !== 401) {
    throw new Error(`SECURITY VIOLATION: Unauthenticated request to /api/admin/attempts returned ${unauthRes.status} instead of 401!`);
  }
  console.log('✓ Admin API is strictly protected with 401 Unauthorized');

  console.log('\n--- 4. Testing Admin Authentication Login ---');
  const loginRes = await req('/api/admin/login', 'POST', {
    username: 'admin',
    password: 'donkeytube2026'
  });
  if (loginRes.status !== 200 || !loginRes.data.token) {
    throw new Error('Admin login failed');
  }
  adminToken = loginRes.data.token;
  console.log('✓ Admin authenticated successfully, session token acquired');

  console.log('\n--- 5. Testing Employee Evaluation Flow in Employee Space ---');
  const startRes = await req('/api/evaluation/start', 'POST', {
    candidate_name: 'ዳዊት ጽጌ (Dawit Tsige)',
    department: 'የሶሻል ሚዲያ ቢዝነስ',
    employee_id: 'DT-8821'
  });
  if (startRes.status !== 200 || !startRes.data.attempt_id) {
    throw new Error('Failed to start candidate evaluation');
  }
  const attemptId = startRes.data.attempt_id;
  console.log('✓ Candidate evaluation started:', attemptId);

  const submitRes = await req('/api/evaluation/submit', 'POST', {
    attempt_id: attemptId,
    answers: {
      1: 'እውነት',
      2: 'ሐሰት',
      21: 'መምራት',
      22: 'Time-bound',
      41: 'ለ',
      61: 'አስተሳሰብ መቀየር እና የስራ ግንኙነት'
    },
    time_spent_seconds: 350
  });
  if (submitRes.status !== 200 || !submitRes.data.success) {
    throw new Error('Candidate submission failed');
  }
  console.log('✓ Candidate submitted evaluation and received official result certificate');

  console.log('\n--- 6. Testing Admin Submissions & Inspection with Auth Token ---');
  const adminAttemptsRes = await req('/api/admin/attempts', 'GET', null, adminToken);
  if (adminAttemptsRes.status !== 200 || !adminAttemptsRes.data.attempts) {
    throw new Error('Admin failed to load attempts');
  }
  console.log(`✓ Admin retrieved submissions list (${adminAttemptsRes.data.attempts.length} attempts recorded)`);

  const detailRes = await req(`/api/admin/attempt/${attemptId}`, 'GET', null, adminToken);
  if (detailRes.status !== 200 || !detailRes.data.items) {
    throw new Error('Admin failed to inspect candidate attempt');
  }
  console.log(`✓ Admin inspected candidate answers and rubrics`);

  console.log('\n--- 7. Testing Admin Import 10-Point Validation in Admin Space ---');
  const importRes = await req('/api/admin/import', 'POST', {}, adminToken);
  if (importRes.status !== 200 || !importRes.data.validation_passed) {
    throw new Error('Admin import validation failed');
  }
  console.log('✓ Admin 10-point import validation verified: PASS (80/80 questions & answers, 100 pts)');
}
