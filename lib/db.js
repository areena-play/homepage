const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

let dbInstance = null;

function getDB(customPath) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath = customPath || process.env.DB_PATH || path.join(__dirname, '..', 'data', 'areena.db');
  
  // Ensure directory exists if using file storage
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Initialize tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Initialize default settings if not exists
  const mMode = db.prepare('SELECT value FROM settings WHERE key = ?').get('maintenance_mode');
  if (!mMode) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('maintenance_mode', '0');
  }

  if (!customPath) {
    dbInstance = db;
  }

  return db;
}

// Password Hashing with Scrypt & Salt
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

// User & Setup Queries
function hasUsers(db = getDB()) {
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  return count > 0;
}

function createAdminUser(username, email, password, db = getDB()) {
  if (!username || !email || !password) {
    throw new Error('Username, email, and password are required.');
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = email.trim().toLowerCase();

  if (cleanUsername.length < 3) {
    throw new Error('Username must be at least 3 characters.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const { hash, salt } = hashPassword(password);
  
  const stmt = db.prepare(`
    INSERT INTO users (username, email, password_hash, salt)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(cleanUsername, cleanEmail, hash, salt);
  return { id: result.lastInsertRowid, username: cleanUsername, email: cleanEmail };
}

function authenticateUser(usernameOrEmail, password, db = getDB()) {
  if (!usernameOrEmail || !password) return null;
  const identifier = usernameOrEmail.trim().toLowerCase();

  const user = db.prepare(`
    SELECT * FROM users 
    WHERE username = ? OR email = ?
  `).get(identifier, identifier);

  if (!user) return null;

  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) return null;

  return { id: user.id, username: user.username, email: user.email };
}

function getAllAdmins(db = getDB()) {
  return db.prepare(`
    SELECT id, username, email, created_at 
    FROM users 
    ORDER BY id ASC
  `).all();
}

function deleteAdminUser(id, currentUserId, db = getDB()) {
  if (Number(id) === Number(currentUserId)) {
    throw new Error('You cannot delete your own account.');
  }

  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (totalUsers <= 1) {
    throw new Error('Cannot delete the last remaining admin account.');
  }

  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw new Error('User not found.');
  }
  return true;
}

// Session Management
function createSession(userId, db = getDB()) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, userId, expiresAt);

  return { token, expiresAt };
}

function validateSession(token, db = getDB()) {
  if (!token) return null;

  const session = db.prepare(`
    SELECT s.token, s.expires_at, u.id, u.username, u.email
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(token);

  if (!session) return null;

  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  return { id: session.id, username: session.username, email: session.email };
}

function destroySession(token, db = getDB()) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// Maintenance Mode Settings
function getMaintenanceMode(db = getDB()) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('maintenance_mode');
  return row ? row.value === '1' : false;
}

function setMaintenanceMode(enabled, db = getDB()) {
  const val = enabled ? '1' : '0';
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES ('maintenance_mode', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(val);
  return enabled;
}

// Email & Mailgun Settings
function getEmailSettings(db = getDB()) {
  const apiKeyRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('mailgun_api_key');
  const domainRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('mailgun_domain');
  const regionRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('mailgun_region');
  const recipientRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('contact_recipient_email');
  const senderRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('mailgun_sender_email');

  return {
    mailgunApiKey: apiKeyRow ? apiKeyRow.value : '',
    mailgunDomain: domainRow ? domainRow.value : '',
    mailgunRegion: regionRow ? regionRow.value : 'US',
    contactRecipientEmail: recipientRow ? recipientRow.value : 'contact@areena.ch',
    mailgunSenderEmail: senderRow ? senderRow.value : ''
  };
}

function saveEmailSettings(settings, db = getDB()) {
  const insertOrUpdate = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  if (settings.mailgunApiKey !== undefined) {
    insertOrUpdate.run('mailgun_api_key', settings.mailgunApiKey.trim());
  }
  if (settings.mailgunDomain !== undefined) {
    insertOrUpdate.run('mailgun_domain', settings.mailgunDomain.trim());
  }
  if (settings.mailgunRegion !== undefined) {
    insertOrUpdate.run('mailgun_region', settings.mailgunRegion.trim());
  }
  if (settings.contactRecipientEmail !== undefined) {
    const recipient = settings.contactRecipientEmail.trim() || 'contact@areena.ch';
    insertOrUpdate.run('contact_recipient_email', recipient);
  }
  if (settings.mailgunSenderEmail !== undefined) {
    insertOrUpdate.run('mailgun_sender_email', settings.mailgunSenderEmail.trim());
  }

  return getEmailSettings(db);
}

// Turnstile & Anti-Spam Settings
function getTurnstileSettings(db = getDB()) {
  const siteKeyRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('turnstile_site_key');
  const secretKeyRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('turnstile_secret_key');

  return {
    turnstileSiteKey: siteKeyRow ? siteKeyRow.value : '',
    turnstileSecretKey: secretKeyRow ? secretKeyRow.value : ''
  };
}

function saveTurnstileSettings(settings, db = getDB()) {
  const insertOrUpdate = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  if (settings.turnstileSiteKey !== undefined) {
    insertOrUpdate.run('turnstile_site_key', settings.turnstileSiteKey.trim());
  }
  if (settings.turnstileSecretKey !== undefined) {
    insertOrUpdate.run('turnstile_secret_key', settings.turnstileSecretKey.trim());
  }

  return getTurnstileSettings(db);
}

module.exports = {
  getDB,
  hasUsers,
  createAdminUser,
  authenticateUser,
  getAllAdmins,
  deleteAdminUser,
  createSession,
  validateSession,
  destroySession,
  getMaintenanceMode,
  setMaintenanceMode,
  getEmailSettings,
  saveEmailSettings,
  getTurnstileSettings,
  saveTurnstileSettings
};

