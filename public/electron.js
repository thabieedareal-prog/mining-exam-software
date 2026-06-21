const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

let mainWindow;
let db;

// Initialize database
function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'mining-exam.db');
  
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(err);
      else {
        createTables();
        resolve(db);
      }
    });
  });
}

// Create database tables
function createTables() {
  db.serialize(() => {
    // Candidates table
    db.run(`
      CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Examiners table
    db.run(`
      CREATE TABLE IF NOT EXISTS examiners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Questions table
    db.run(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        question_text TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_answer TEXT NOT NULL,
        question_type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Exam Results table
    db.run(`
      CREATE TABLE IF NOT EXISTS exam_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id INTEGER NOT NULL,
        candidate_name TEXT NOT NULL,
        exam_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_questions INTEGER NOT NULL,
        correct_answers INTEGER NOT NULL,
        score REAL NOT NULL,
        percentage REAL NOT NULL,
        status TEXT NOT NULL,
        time_taken INTEGER NOT NULL,
        results_json TEXT,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id)
      )
    `);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

app.on('ready', async () => {
  await initDatabase();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('register-candidate', async (event, { name, email, password }) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO candidates (name, email, password) VALUES (?, ?, ?)',
      [name, email, password],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, name, email });
      }
    );
  });
});

ipcMain.handle('login-candidate', async (event, { email, password }) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM candidates WHERE email = ? AND password = ?',
      [email, password],
      (err, row) => {
        if (err) reject(err);
        else if (row) resolve({ id: row.id, name: row.name, email: row.email });
        else reject(new Error('Invalid credentials'));
      }
    );
  });
});

ipcMain.handle('get-questions', async (event, { subject, type }) => {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM questions WHERE subject = ?';
    let params = [subject];
    
    if (type) {
      query += ' AND question_type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY RANDOM()';
    
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

ipcMain.handle('save-exam-result', async (event, result) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO exam_results 
       (candidate_id, candidate_name, total_questions, correct_answers, score, percentage, status, time_taken, results_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.candidateId,
        result.candidateName,
        result.totalQuestions,
        result.correctAnswers,
        result.score,
        result.percentage,
        result.percentage >= 50 ? 'PASS' : 'FAIL',
        result.timeTaken,
        JSON.stringify(result.answers)
      ],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
});

ipcMain.handle('get-exam-results', async (event) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM exam_results ORDER BY exam_date DESC',
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
});

ipcMain.handle('get-all-subjects', async (event) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT DISTINCT subject FROM questions ORDER BY subject',
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => r.subject));
      }
    );
  });
});

ipcMain.handle('insert-questions', async (event, questions) => {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      `INSERT INTO questions 
       (subject, question_text, option_a, option_b, option_c, option_d, correct_answer, question_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let inserted = 0;
    questions.forEach(q => {
      stmt.run(
        [q.subject, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.question_type],
        (err) => {
          if (!err) inserted++;
        }
      );
    });

    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve({ inserted });
    });
  });
});
