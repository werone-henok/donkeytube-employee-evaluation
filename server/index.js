const express = require('express');
const cors = require('cors');
const path = require('path');
const { initSchema, seedFromOfficialFile } = require('./db');
const evaluationRoutes = require('./routes/evaluation');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize DB and ensure official evaluation is seeded
initSchema();
seedFromOfficialFile();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/evaluation', evaluationRoutes);
app.use('/api/admin', adminRoutes);

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

// Dedicated Admin Portal route
app.get('/admin', (req, res) => {
  res.sendFile('admin.html', { root: PUBLIC_DIR });
});

// Single Page Application Fallback (Employee Portal)
app.use((req, res) => {
  res.sendFile('index.html', { root: PUBLIC_DIR });
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`DonkeyTube Employee Evaluation System is running!`);
    console.log(`Server URL: http://localhost:${PORT}`);
    console.log(`Candidate Portal: http://localhost:${PORT}/#candidate`);
    console.log(`Admin Portal:     http://localhost:${PORT}/#admin`);
    console.log(`Import Wizard:    http://localhost:${PORT}/#admin-import`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
