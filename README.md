# DonkeyTube Employee Evaluation System

An enterprise exam and competency assessment web application built for DonkeyTube. Features a bilingual (Amharic/English) evaluation platform with an automated grading engine, anti-cheat protections, timed exams, and an administrative dashboard.

---

## Features

- **Candidate Exam Experience:**
  - 80-question comprehensive management promotion exam across 4 sections:
    - Section 1: True / False (እውነት ወይም ሐሰት)
    - Section 2: Fill-in-the-Blank (ክፍት ቦታዎችን ሙሉ)
    - Section 3: Multiple Choice (ትክክለኛውን መልስ ምረጥ)
    - Section 4: Short Answer / Rubric-based (አጫጭር ጥያቄዎች)
  - Timed 150-minute countdown with persistent local state auto-save.
  - Section-by-section pagination and question palette navigator.
  - Anti-cheat monitoring (tab switch tracking and auto-flagging).

- **Automated Grading Engine:**
  - Robust multilingual normalization for Amharic & English.
  - Semantic keyword and concept matching for short-answer rubrics.
  - Instant score breakdown by section, pass/fail determination (70% threshold).

- **Administrative Dashboard (`/admin`):**
  - Secure authentication.
  - Real-time exam attempt logs, scores, and completion metrics.
  - Detailed submission inspection per candidate.
  - Export capabilities and exam versioning.

---

## Tech Stack

- **Backend:** Node.js, Express 5, `mysql2/promise` (Connection Pooling)
- **Frontend:** Vanilla HTML5, CSS3, Modern ES JavaScript
- **Database:** **MySQL 8.0** with InnoDB, foreign keys, UTF8MB4 charset, and auto-seeding

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Git](https://git-scm.com/)
- **MySQL 8.0** (via Docker, XAMPP, or local service)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/werone-henok/donkeytube-employee-evaluation.git
   cd donkeytube-employee-evaluation
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment (`.env`):
   Copy `.env.example` to `.env` (pre-configured for standard local MySQL):
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=donkeytube_evaluation
   ```

4. Start MySQL:
   - **Option A (Docker - 1 command):**
     ```bash
     docker compose up -d
     ```
   - **Option B (XAMPP / Local MySQL):**
     Start the MySQL service in your XAMPP Control Panel.

5. Start the server:
   ```bash
   npm start
   ```

6. Open your browser and navigate to:
   - Candidate Portal: `http://localhost:3000`
   - Admin Portal: `http://localhost:3000/admin.html` (Default password: `donkeytube2026`)

---

## Verification & Testing

To run the automated end-to-end and grading tests against MySQL:
```bash
node scripts/test_grading.js
node scripts/verify_e2e.js
```

---

## Project Structure

```
├── data/                    # Ground-truth evaluation seed data (JSON)
├── public/                  # Candidate & Admin front-end web interfaces
│   ├── index.html           # Candidate exam interface
│   ├── admin.html           # Admin portal
│   ├── app.js               # Exam application logic
│   ├── admin.js             # Admin management logic
│   └── styles.css           # Modern, responsive UI design
├── scripts/                 # Ingestion, parsing, and automated test suites
├── server/                  # Express server & MySQL backend
│   ├── db.js                # MySQL pool, schemas, and auto-seeding
│   ├── grading_engine.js    # Multilingual evaluation engine
│   ├── routes/              # Modular API endpoints (evaluation, admin)
│   └── index.js             # Server entry point
├── docker-compose.yml       # MySQL 8 service configuration
├── .env.example             # Environment template
└── source_docs/             # Original official questions and answer keys
```

---

## License
ISC
