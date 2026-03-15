const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const db = new Database(path.join(__dirname, 'serverdash.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    username TEXT NOT NULL,
    auth_type TEXT DEFAULT 'password',
    private_key_path TEXT,
    private_key TEXT,
    server_password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    repo_url TEXT,
    branch TEXT DEFAULT 'main',
    build_command TEXT,
    start_command TEXT,
    stop_command TEXT,
    restart_command TEXT,
    status TEXT DEFAULT 'unknown',
    last_deployed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS deploy_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    output TEXT,
    status TEXT DEFAULT 'running',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS command_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    commands TEXT NOT NULL,
    color TEXT DEFAULT 'green',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS environments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    server_id INTEGER NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    path TEXT NOT NULL,
    build_command TEXT,
    restart_command TEXT,
    auto_deploy INTEGER DEFAULT 0,
    deploy_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'idle',
    last_deployed_at DATETIME,
    last_commit TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
  );
`);

// Migrations
const projectCols = db.prepare("PRAGMA table_info(projects)").all().map(c => c.name);
if (!projectCols.includes('update_commands')) {
  db.exec('ALTER TABLE projects ADD COLUMN update_commands TEXT');
}
if (!projectCols.includes('webhook_secret')) {
  db.exec('ALTER TABLE projects ADD COLUMN webhook_secret TEXT');
}

const logCols = db.prepare("PRAGMA table_info(deploy_logs)").all().map(c => c.name);
if (!logCols.includes('commit_hash')) {
  db.exec('ALTER TABLE deploy_logs ADD COLUMN commit_hash TEXT');
}
if (!logCols.includes('environment_id')) {
  db.exec('ALTER TABLE deploy_logs ADD COLUMN environment_id INTEGER');
}

// Migrate existing plaintext credentials to encrypted
function migrateCredentials() {
  const { encrypt } = require('../services/crypto');
  const servers = db.prepare('SELECT id, private_key, server_password FROM servers').all();
  for (const s of servers) {
    // Skip if already encrypted (contains colons from our format)
    const needsEncrypt = (val) => val && !val.includes(':');
    if (needsEncrypt(s.server_password) || needsEncrypt(s.private_key)) {
      db.prepare('UPDATE servers SET server_password = ?, private_key = ? WHERE id = ?')
        .run(
          needsEncrypt(s.server_password) ? encrypt(s.server_password) : s.server_password,
          needsEncrypt(s.private_key) ? encrypt(s.private_key) : s.private_key,
          s.id
        );
    }
  }
}

if (process.env.ENCRYPTION_KEY) {
  migrateCredentials();
}

function seedAdmin(username, password) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!existing) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  }
}

module.exports = { db, seedAdmin };
