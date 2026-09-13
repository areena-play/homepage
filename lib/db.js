const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

let dbInstance = null;

class PureStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.isMemory = filePath === ':memory:';
    this.data = {
      users: [],
      settings: {
        maintenance_mode: '0',
        mailgun_api_key: '',
        mailgun_domain: '',
        mailgun_region: 'US',
        contact_recipient_email: 'contact@areena.ch',
        mailgun_sender_email: '',
        turnstile_site_key: '',
        turnstile_secret_key: ''
      },
      sessions: [],
      nextUserId: 1
    };

    this.load();
  }

  load() {
    if (this.isMemory) return;

    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.data.users = Array.isArray(parsed.users) ? parsed.users : [];
          this.data.settings = Object.assign(this.data.settings, parsed.settings || {});
          this.data.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
          this.data.nextUserId = typeof parsed.nextUserId === 'number' ? parsed.nextUserId : (this.data.users.length ? Math.max(...this.data.users.map(u => u.id || 0)) + 1 : 1);
        }
      } else {
        this.save();
      }
    } catch (err) {
      console.warn(`[db] Could not parse database file at ${this.filePath}, initializing fresh store.`, err.message);
      this.save();
    }
  }

  save() {
    if (this.isMemory) return;

    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error(`[db] Error saving database file at ${this.filePath}:`, err);
    }
  }

  close() {
    this.save();
  }
}

function getDB(customPath) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const defaultPath = path.join(__dirname, '..', 'data', 'areena-store.json');
  const dbPath = customPath || process.env.DB_PATH || defaultPath;
  const store = new PureStore(dbPath);

  if (!customPath) {
    dbInstance = store;
  }

  return store;
}

// Password Hashing with Scrypt & Salt (Pure Node.js crypto)
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  try {
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch (e) {
    return false;
  }
}

// User & Setup Queries
function hasUsers(db = getDB()) {
  return Array.isArray(db.data.users) && db.data.users.length > 0;
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

  const existing = db.data.users.find(
    u => u.username === cleanUsername || u.email === cleanEmail
  );
  if (existing) {
    throw new Error('Username or email already exists.');
  }

  const { hash, salt } = hashPassword(password);
  const newUser = {
    id: db.data.nextUserId++,
    username: cleanUsername,
    email: cleanEmail,
    password_hash: hash,
    salt: salt,
    created_at: new Date().toISOString()
  };

  db.data.users.push(newUser);
  db.save();

  return { id: newUser.id, username: cleanUsername, email: cleanEmail };
}

function authenticateUser(usernameOrEmail, password, db = getDB()) {
  if (!usernameOrEmail || !password) return null;
  const identifier = usernameOrEmail.trim().toLowerCase();

  const user = db.data.users.find(
    u => u.username === identifier || u.email === identifier
  );
  if (!user) return null;

  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) return null;

  return { id: user.id, username: user.username, email: user.email };
}

function getAllAdmins(db = getDB()) {
  return db.data.users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    created_at: u.created_at
  }));
}

function deleteAdminUser(id, currentUserId, db = getDB()) {
  if (Number(id) === Number(currentUserId)) {
    throw new Error('You cannot delete your own account.');
  }

  if (db.data.users.length <= 1) {
    throw new Error('Cannot delete the last remaining admin account.');
  }

  const initialCount = db.data.users.length;
  db.data.users = db.data.users.filter(u => Number(u.id) !== Number(id));

  if (db.data.users.length === initialCount) {
    throw new Error('User not found.');
  }

  // Also remove sessions for deleted user
  db.data.sessions = db.data.sessions.filter(s => Number(s.user_id) !== Number(id));
  db.save();
  return true;
}

// Session Management
function createSession(userId, db = getDB()) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  db.data.sessions.push({
    token,
    user_id: userId,
    created_at: new Date().toISOString(),
    expires_at: expiresAt
  });
  db.save();

  return { token, expiresAt };
}

function validateSession(token, db = getDB()) {
  if (!token) return null;

  const session = db.data.sessions.find(s => s.token === token);
  if (!session) return null;

  if (new Date(session.expires_at) < new Date()) {
    db.data.sessions = db.data.sessions.filter(s => s.token !== token);
    db.save();
    return null;
  }

  const user = db.data.users.find(u => Number(u.id) === Number(session.user_id));
  if (!user) return null;

  return { id: user.id, username: user.username, email: user.email };
}

function destroySession(token, db = getDB()) {
  if (!token) return;
  db.data.sessions = db.data.sessions.filter(s => s.token !== token);
  db.save();
}

// Maintenance Mode Settings
function getMaintenanceMode(db = getDB()) {
  return db.data.settings.maintenance_mode === '1';
}

function setMaintenanceMode(enabled, db = getDB()) {
  db.data.settings.maintenance_mode = enabled ? '1' : '0';
  db.save();
  return enabled;
}

// Email & Mailgun Settings
function getEmailSettings(db = getDB()) {
  const s = db.data.settings;
  return {
    mailgunApiKey: s.mailgun_api_key || '',
    mailgunDomain: s.mailgun_domain || '',
    mailgunRegion: s.mailgun_region || 'US',
    contactRecipientEmail: s.contact_recipient_email || 'contact@areena.ch',
    mailgunSenderEmail: s.mailgun_sender_email || ''
  };
}

function saveEmailSettings(settings, db = getDB()) {
  if (settings.mailgunApiKey !== undefined) {
    db.data.settings.mailgun_api_key = settings.mailgunApiKey.trim();
  }
  if (settings.mailgunDomain !== undefined) {
    db.data.settings.mailgun_domain = settings.mailgunDomain.trim();
  }
  if (settings.mailgunRegion !== undefined) {
    db.data.settings.mailgun_region = settings.mailgunRegion.trim();
  }
  if (settings.contactRecipientEmail !== undefined) {
    db.data.settings.contact_recipient_email = settings.contactRecipientEmail.trim() || 'contact@areena.ch';
  }
  if (settings.mailgunSenderEmail !== undefined) {
    db.data.settings.mailgun_sender_email = settings.mailgunSenderEmail.trim();
  }

  db.save();
  return getEmailSettings(db);
}

// Turnstile & Anti-Spam Settings
function getTurnstileSettings(db = getDB()) {
  const s = db.data.settings;
  return {
    turnstileSiteKey: s.turnstile_site_key || '',
    turnstileSecretKey: s.turnstile_secret_key || ''
  };
}

function saveTurnstileSettings(settings, db = getDB()) {
  if (settings.turnstileSiteKey !== undefined) {
    db.data.settings.turnstile_site_key = settings.turnstileSiteKey.trim();
  }
  if (settings.turnstileSecretKey !== undefined) {
    db.data.settings.turnstile_secret_key = settings.turnstileSecretKey.trim();
  }

  db.save();
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
