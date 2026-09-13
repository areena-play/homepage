const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const {
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
} = require('./lib/db');
const { sendContactMessage, sendMailgunEmail } = require('./lib/mail');
const { verifyTurnstileToken } = require('./lib/turnstile');
const { renderPage } = require('./lib/components');

function createServer(options = {}) {
  const app = express();
  const publicDir = options.publicDir || (require('fs').existsSync(path.join(__dirname, 'httpdocs')) ? path.join(__dirname, 'httpdocs') : path.join(__dirname, 'public'));
  const viewsDir = options.viewsDir || (require('fs').existsSync(path.join(__dirname, 'views')) ? path.join(__dirname, 'views') : publicDir);

  // Gzip / Brotli compression
  app.use(compression());

  // JSON Body and Cookie parsing
  app.use(express.json());
  app.use(cookieParser());

  // Security and performance headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Authentication Context Middleware
  app.use((req, res, next) => {
    const sessionToken = req.cookies.areena_session;
    if (sessionToken) {
      req.user = validateSession(sessionToken);
    } else {
      req.user = null;
    }
    next();
  });

  // Static Assets (Files like CSS, JS, Images, Locales) - skip .html files so they are always rendered with components
  app.use((req, res, next) => {
    if (req.path.endsWith('.html')) {
      return next();
    }
    next();
  });

  app.use(express.static(publicDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    index: false
  }));

  // --- API Routes ---

  // Platform Status & Auth State (Provides public Turnstile Site Key)
  app.get('/api/status', (req, res) => {
    const setupNeeded = !hasUsers();
    const isMaintenance = getMaintenanceMode();
    const { turnstileSiteKey } = getTurnstileSettings();

    res.json({
      needsSetup: setupNeeded,
      maintenanceMode: isMaintenance,
      turnstileSiteKey: turnstileSiteKey || null,
      isAuthenticated: !!req.user,
      user: req.user ? { id: req.user.id, username: req.user.username, email: req.user.email } : null
    });
  });

  // Public Contact Form Submission Endpoint (with Honeypot & Turnstile Protection)
  app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message, _hp_website, turnstileToken } = req.body;

    // 1. Honeypot check: If the hidden honeypot field has a value, silently drop spam bot
    if (_hp_website && _hp_website.trim() !== '') {
      console.log(`[Honeypot Triggered] Blocked bot submission from IP ${req.ip} pretending to be "${name}"`);
      // Return fake 200 OK so the bot thinks it succeeded and stops retrying
      return res.json({ success: true });
    }

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required.' });
    }

    // 2. Cloudflare Turnstile Verification
    const captchaToken = turnstileToken || req.body['cf-turnstile-response'];
    const turnstileResult = await verifyTurnstileToken(captchaToken, req.ip);
    if (!turnstileResult.success) {
      return res.status(400).json({ error: turnstileResult.error || 'CAPTCHA validation failed. Please try again.' });
    }

    // 3. Dispatch Contact Message via Mailgun
    try {
      const result = await sendContactMessage({ name, email, subject, message });
      res.json({ success: true, result });
    } catch (err) {
      console.error('[Contact Form Error]:', err.message);
      res.status(500).json({ error: err.message || 'Failed to send message.' });
    }
  });

  // Secure Auto-Deployment Process Restart Endpoint (Triggers clean Passenger respawn)
  app.all('/api/deploy-restart', (req, res) => {
    const providedSecret = req.headers['x-deploy-secret'] || req.query.secret || req.body?.secret;
    const configuredSecret = process.env.DEPLOY_SECRET;

    if (!providedSecret || providedSecret !== configuredSecret || !configuredSecret) {
      return res.status(401).json({ error: 'Unauthorized: Invalid deploy secret.' });
    }

    res.json({ success: true, message: 'Server process is recycling for updated code...' });

    // Allow response to flush, then cleanly exit so Passenger/PM2 supervisor immediately respawns fresh process
    if (process.env.NODE_ENV !== 'test') {
      setTimeout(() => {
        console.log('🔄 Deployment restart triggered via /api/deploy-restart. Exiting process for supervisor respawn...');
        process.exit(0);
      }, 400);
    }
  });

  // First-Time Setup (Only allowed if no users exist)
  app.post('/api/setup', (req, res) => {
    if (hasUsers()) {
      return res.status(403).json({ error: 'Platform is already initialized.' });
    }

    const { username, email, password } = req.body;
    try {
      const user = createAdminUser(username, email, password);
      const session = createSession(user.id);
      
      res.cookie('areena_session', session.token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.status(201).json({ success: true, user });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Login
  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body;
    const user = authenticateUser(identifier, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const session = createSession(user.id);
    res.cookie('areena_session', session.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true, user });
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    if (req.cookies.areena_session) {
      destroySession(req.cookies.areena_session);
      res.clearCookie('areena_session');
    }
    res.json({ success: true });
  });

  // Admin Auth Gate Middleware for Protected APIs
  function requireAdmin(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Admin session required.' });
    }
    next();
  }

  // Admin: Get all admins
  app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = getAllAdmins();
    res.json(users);
  });

  // Admin: Create new admin user
  app.post('/api/admin/users', requireAdmin, (req, res) => {
    const { username, email, password } = req.body;
    try {
      const user = createAdminUser(username, email, password);
      res.status(201).json({ success: true, user });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Admin: Delete admin user
  app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    try {
      deleteAdminUser(id, req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Admin: Toggle Maintenance Mode
  app.post('/api/admin/maintenance', requireAdmin, (req, res) => {
    const { enabled } = req.body;
    const updated = setMaintenanceMode(!!enabled);
    res.json({ success: true, maintenanceMode: updated });
  });

  // Admin: Get Email Settings
  app.get('/api/admin/email-settings', requireAdmin, (req, res) => {
    const settings = getEmailSettings();
    res.json(settings);
  });

  // Admin: Save Email Settings
  app.post('/api/admin/email-settings', requireAdmin, (req, res) => {
    const { mailgunApiKey, mailgunDomain, mailgunRegion, contactRecipientEmail, mailgunSenderEmail } = req.body;
    try {
      const saved = saveEmailSettings({
        mailgunApiKey,
        mailgunDomain,
        mailgunRegion,
        contactRecipientEmail,
        mailgunSenderEmail
      });
      res.json({ success: true, settings: saved });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Admin: Send Test Email
  app.post('/api/admin/test-email', requireAdmin, async (req, res) => {
    const settings = getEmailSettings();
    const recipient = req.body.to || settings.contactRecipientEmail || 'contact@areena.ch';

    try {
      const result = await sendMailgunEmail({
        to: recipient,
        subject: '⚡ AREENA Mailgun Test Email',
        text: 'This is a test email sent from your AREENA Admin Control Panel. Your Mailgun configuration is working properly!',
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0284c7;">⚡ AREENA Mailgun Configuration Verified</h2>
            <p>Congratulations! Your Mailgun API keys and domain are configured correctly.</p>
            <p style="color: #64748b; font-size: 13px;">Sent from AREENA Control Panel to ${recipient} at ${new Date().toISOString()}</p>
          </div>
        `
      });
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Get Turnstile Anti-Spam Settings
  app.get('/api/admin/turnstile-settings', requireAdmin, (req, res) => {
    const settings = getTurnstileSettings();
    res.json(settings);
  });

  // Admin: Save Turnstile Anti-Spam Settings
  app.post('/api/admin/turnstile-settings', requireAdmin, (req, res) => {
    const { turnstileSiteKey, turnstileSecretKey } = req.body;
    try {
      const saved = saveTurnstileSettings({ turnstileSiteKey, turnstileSecretKey });
      res.json({ success: true, settings: saved });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Page Routes ---

  // Admin Dashboard (Always accessible)
  app.get(['/admin', '/admin.html'], (req, res) => {
    res.type('html').send(renderPage(path.join(viewsDir, 'admin.html'), { isSubpage: true }));
  });

  // Explicit Maintenance Page
  app.get(['/maintenance', '/maintenance.html'], (req, res) => {
    res.type('html').send(renderPage(path.join(viewsDir, 'maintenance.html'), { isSubpage: true }));
  });

  // Maintenance Mode Guard for Public Routes
  app.use((req, res, next) => {
    const isMaintenance = getMaintenanceMode();
    if (isMaintenance && !req.user) {
      // Return maintenance page for public visitors during maintenance with HTTP 200
      return res.status(503).type('html').send(renderPage(path.join(viewsDir, 'maintenance.html'), { isSubpage: true }));
    }
    next();
  });

  // Dedicated Pages
  app.get(['/', '/index.html'], (req, res) => {
    res.type('html').send(renderPage(path.join(viewsDir, 'index.html'), { isSubpage: false }));
  });

  app.get(['/impressum', '/impressum.html'], (req, res) => {
    res.type('html').send(renderPage(path.join(viewsDir, 'impressum.html'), { isSubpage: true }));
  });

  app.get(['/privacy-policy', '/privacy', '/privacy-policy.html'], (req, res) => {
    res.type('html').send(renderPage(path.join(viewsDir, 'privacy-policy.html'), { isSubpage: true }));
  });

  // 404 Fallback
  app.use((req, res) => {
    res.status(404).type('html').send(renderPage(path.join(viewsDir, '404.html'), { isSubpage: true }));
  });

  return app;
}

function startServer(port) {
  const app = createServer();

  // Official Phusion Passenger (Plesk standard) support
  if (typeof PhusionPassenger !== 'undefined') {
    PhusionPassenger.configure({ autoInstall: false });
    const server = app.listen('passenger', () => {
      console.log('🚀 AREENA Homepage running under Phusion Passenger (Plesk Reverse Proxy)');
    });
    return server;
  }

  const listenPort = port || process.env.PORT || 3000;
  const server = app.listen(listenPort, () => {
    console.log(`\n==================================================`);
    console.log(`  🚀 AREENA Homepage is running!`);
    console.log(`  🌐 Local:   http://localhost:${listenPort}`);
    console.log(`  🌍 Network: http://127.0.0.1:${listenPort}`);
    console.log(`  ⚡ Admin:   http://localhost:${listenPort}/admin`);
    console.log(`==================================================\n`);
  });

  return server;
}

// Automatically start server when executed directly OR when loaded by Phusion Passenger in Plesk
if (typeof PhusionPassenger !== 'undefined' || require.main === module) {
  startServer();
}

module.exports = { createServer, startServer };
