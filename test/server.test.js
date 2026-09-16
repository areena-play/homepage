const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Use isolated test database
const testDbPath = path.join(__dirname, 'test.db');
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch (e) {}
}
process.env.DB_PATH = testDbPath;

const { createServer } = require('../server');
const { getDB } = require('../lib/db');
const TEST_PORT = 3459;
const app = createServer();
const server = app.listen(TEST_PORT);

function makeRequest(reqPath, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(`http://localhost:${TEST_PORT}${reqPath}`);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (options.body) {
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
          json: () => {
            try { return JSON.parse(data); } catch (e) { return null; }
          }
        });
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function extractCookie(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;
  return Array.isArray(setCookie) ? setCookie[0].split(';')[0] : setCookie.split(';')[0];
}

async function runTests() {
  console.log('🧪 Running comprehensive backend, DB, auth, honeypot & turnstile tests...');

  try {
    // 1. Check initial status before any users exist
    const status1 = await makeRequest('/api/status');
    assert.strictEqual(status1.statusCode, 200);
    assert.strictEqual(status1.json().needsSetup, true, 'Platform must indicate needsSetup = true initially');
    console.log('  ✅ Initial state correctly reports needsSetup = true');

    // 2. Perform First-Time Setup
    const setupRes = await makeRequest('/api/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'masteradmin',
        email: 'master@areena.play',
        password: 'securePassword123'
      })
    });
    assert.strictEqual(setupRes.statusCode, 201);
    const sessionCookie = extractCookie(setupRes.headers);
    assert.ok(sessionCookie && sessionCookie.includes('areena_session='), 'Setup must return session cookie');
    console.log('  ✅ First-Time Setup succeeds and returns session cookie');

    // 3. Ensure subsequent setup attempts are blocked
    const setupBlockRes = await makeRequest('/api/setup', {
      method: 'POST',
      body: JSON.stringify({
        username: 'intruder',
        email: 'intruder@areena.play',
        password: 'password123'
      })
    });
    assert.strictEqual(setupBlockRes.statusCode, 403, 'Subsequent setup calls must be blocked with 403');
    console.log('  ✅ Subsequent setup attempts are strictly blocked (403)');

    // 4. Authenticate via Login
    const loginRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'masteradmin',
        password: 'securePassword123'
      })
    });
    assert.strictEqual(loginRes.statusCode, 200);
    const loginCookie = extractCookie(loginRes.headers);
    assert.ok(loginCookie.includes('areena_session='), 'Login returns valid session cookie');
    console.log('  ✅ Admin Login succeeds and issues session');

    // 5. Test Honeypot Anti-Spam protection
    const honeypotRes = await makeRequest('/api/contact', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Spam Bot',
        email: 'bot@spam.com',
        subject: 'Buy crypto now',
        message: 'Spam payload',
        _hp_website: 'http://spam-link.ru' // Honeypot filled by bot
      })
    });
    assert.strictEqual(honeypotRes.statusCode, 200);
    assert.strictEqual(honeypotRes.json().success, true);
    console.log('  ✅ Honeypot traps bot submissions silently');

    // 6. Test Valid Contact Submission
    const contactRes = await makeRequest('/api/contact', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Human Gamer',
        email: 'gamer@areena.play',
        subject: 'Platform feedback',
        message: 'The website and platform look amazing!'
      })
    });
    assert.strictEqual(contactRes.statusCode, 200);
    assert.strictEqual(contactRes.json().success, true);
    console.log('  ✅ Valid contact form submission processes successfully');

    // 7. Test Turnstile Settings API
    const turnstileSaveRes = await makeRequest('/api/admin/turnstile-settings', {
      method: 'POST',
      headers: { Cookie: loginCookie },
      body: JSON.stringify({
        turnstileSiteKey: '0x4AAAAAAtestSiteKey123',
        turnstileSecretKey: '0x4AAAAAAtestSecretKey123'
      })
    });
    assert.strictEqual(turnstileSaveRes.statusCode, 200);
    assert.strictEqual(turnstileSaveRes.json().settings.turnstileSiteKey, '0x4AAAAAAtestSiteKey123');

    // Check status provides public site key
    const statusWithTurnstile = await makeRequest('/api/status');
    assert.strictEqual(statusWithTurnstile.json().turnstileSiteKey, '0x4AAAAAAtestSiteKey123');
    console.log('  ✅ Turnstile Site Key & Secret Key managed via Admin API');

    // 8. Test Mailgun / Email Settings API
    const saveEmailRes = await makeRequest('/api/admin/email-settings', {
      method: 'POST',
      headers: { Cookie: loginCookie },
      body: JSON.stringify({
        mailgunApiKey: 'key-sample',
        mailgunDomain: 'mg.areena.ch',
        mailgunRegion: 'EU',
        contactRecipientEmail: 'contact@areena.ch'
      })
    });
    assert.strictEqual(saveEmailRes.statusCode, 200);
    assert.strictEqual(saveEmailRes.json().settings.contactRecipientEmail, 'contact@areena.ch');
    console.log('  ✅ Email settings configured');

    // 9. Maintenance Mode Toggle
    const maintOnRes = await makeRequest('/api/admin/maintenance', {
      method: 'POST',
      headers: { Cookie: loginCookie },
      body: JSON.stringify({ enabled: true })
    });
    assert.strictEqual(maintOnRes.statusCode, 200);

    const publicMaintRes = await makeRequest('/');
    assert.strictEqual(publicMaintRes.statusCode, 200);
    assert.ok(publicMaintRes.data.includes('data-i18n="maintenance.heading"') || publicMaintRes.data.includes("We'll Be Back Soon"));
    console.log('  ✅ Maintenance Mode active: Public visitors receive 200 with maintenance page');

    const maintOffRes = await makeRequest('/api/admin/maintenance', {
      method: 'POST',
      headers: { Cookie: loginCookie },
      body: JSON.stringify({ enabled: false })
    });
    assert.strictEqual(maintOffRes.statusCode, 200);

    const publicRestoredRes = await makeRequest('/');
    assert.strictEqual(publicRestoredRes.statusCode, 200);
    assert.ok(publicRestoredRes.data.includes('/admin'));
    console.log('  ✅ Maintenance Mode deactivated: Public site is live (200) with /admin footer link');

    // 9b. Live Status Section Visibility Toggle
    const statusInitial = await makeRequest('/api/status');
    assert.strictEqual(statusInitial.json().showStatusSection, true, 'Status section must be visible by default');
    assert.ok(publicRestoredRes.data.includes('id="status"'), 'Home page must render status section when enabled');

    // Hide status section
    const hideStatusRes = await makeRequest('/api/admin/status-section', {
      method: 'POST',
      headers: { Cookie: loginCookie },
      body: JSON.stringify({ enabled: false })
    });
    assert.strictEqual(hideStatusRes.statusCode, 200);
    assert.strictEqual(hideStatusRes.json().showStatusSection, false);

    const statusAfterHide = await makeRequest('/api/status');
    assert.strictEqual(statusAfterHide.json().showStatusSection, false);

    const publicHiddenStatusRes = await makeRequest('/');
    assert.strictEqual(publicHiddenStatusRes.statusCode, 200);
    assert.ok(!publicHiddenStatusRes.data.includes('id="status"'), 'Home page must not include status section when disabled');

    // Restore status section
    const showStatusRes = await makeRequest('/api/admin/status-section', {
      method: 'POST',
      headers: { Cookie: loginCookie },
      body: JSON.stringify({ enabled: true })
    });
    assert.strictEqual(showStatusRes.statusCode, 200);
    assert.strictEqual(showStatusRes.json().showStatusSection, true);
    console.log('  ✅ Live Status Section visibility toggle verified (admin endpoint, /api/status, and homepage rendering)');

    // 10. Dedicated Pages, 404 checks & Reusable Component Injection
    const impressumRes = await makeRequest('/impressum');
    assert.strictEqual(impressumRes.statusCode, 200);
    assert.ok(impressumRes.data.includes('id="site-navbar"'), 'Navbar component must be injected into subpages');
    assert.ok(impressumRes.data.includes('id="site-footer"'), 'Footer component must be injected into subpages');
    assert.ok(impressumRes.data.includes('href="/#partners"'), 'Subpages must prefix hash links with /');

    const sttRes = await makeRequest('/swiss-table-tennis');
    assert.strictEqual(sttRes.statusCode, 200);
    assert.ok(sttRes.data.includes('id="site-navbar"'), 'Navbar component must be injected into swiss-table-tennis');
    assert.ok(sttRes.data.includes('id="site-footer"'), 'Footer component must be injected into swiss-table-tennis');
    assert.ok(sttRes.data.includes('data-i18n="stt.visionStatement"'), 'STT page must contain vision statement tag');
    assert.ok(sttRes.data.includes('data-i18n="stt.mvpTitle"'), 'STT page must contain MVP section');

    assert.ok(publicRestoredRes.data.includes('id="site-navbar"'), 'Navbar component must be injected into home page');
    assert.ok(publicRestoredRes.data.includes('id="site-footer"'), 'Footer component must be injected into home page');
    assert.ok(publicRestoredRes.data.includes('href="#partners"'), 'Home page links must not have / prefix');

    const privacyRes = await makeRequest('/privacy-policy');
    assert.strictEqual(privacyRes.statusCode, 200);
    assert.ok(privacyRes.data.includes('id="site-navbar"'));
    assert.ok(privacyRes.data.includes('id="site-footer"'));

    const notFoundRes = await makeRequest('/some-missing-page');
    assert.strictEqual(notFoundRes.statusCode, 404);
    assert.ok(notFoundRes.data.includes('id="site-navbar"'));
    assert.ok(notFoundRes.data.includes('id="site-footer"'));

    // Verify Head Initializer component injection
    assert.ok(publicRestoredRes.data.includes('areena_theme'), 'head-init component must be injected into home page');
    assert.ok(sttRes.data.includes('areena_theme'), 'head-init component must be injected into STT page');
    assert.ok(impressumRes.data.includes('areena_theme'), 'head-init component must be injected into subpages');
    assert.ok(privacyRes.data.includes('areena_theme'));
    assert.ok(notFoundRes.data.includes('areena_theme'));
    console.log('  ✅ Reusable components (Navbar, Footer, and Zero-Flash Head-Init) rendered seamlessly across all routes including /swiss-table-tennis');

    // 12. Verify Comprehensive Privacy Policy and Locale Consistency
    assert.ok(privacyRes.data.includes('data-i18n="privacy.section12Title"'), 'Privacy policy must contain Section 12');
    assert.ok(privacyRes.data.includes('data-i18n="privacy.right8"'), 'Privacy policy must contain data subject rights list');
    assert.ok(privacyRes.data.includes('data-i18n="privacy.cat7Title"'), 'Privacy policy must contain data categories');

    const locales = ['en', 'de', 'fr', 'it'];
    const baseLocDir = fs.existsSync(path.join(__dirname, '../httpdocs/locales')) ? path.join(__dirname, '../httpdocs/locales') : path.join(__dirname, '../public/locales');
    for (const lang of locales) {
      const locPath = path.join(baseLocDir, `${lang}.json`);
      const locData = JSON.parse(fs.readFileSync(locPath, 'utf8'));
      assert.ok(locData.privacy, `Locale ${lang} must have privacy section`);
      assert.ok(locData.privacy.section12Text, `Locale ${lang} must have privacy.section12Text`);
      assert.ok(locData.privacy.right8, `Locale ${lang} must have privacy.right8`);
      assert.ok(locData.privacy.cat7Text, `Locale ${lang} must have privacy.cat7Text`);
      assert.ok(locData.stt, `Locale ${lang} must have stt section`);
      assert.ok(locData.stt.visionStatement, `Locale ${lang} must have stt.visionStatement`);
      assert.ok(locData.stt.mvpTitle, `Locale ${lang} must have stt.mvpTitle`);
    }
    console.log('  ✅ Comprehensive Privacy Policy (FADP / GDPR) and Multilingual Locales (EN, DE, FR, IT) including Swiss Table Tennis fully verified');

    // 13. Verify Deploy Restart Webhook Endpoint
    process.env.NODE_ENV = 'test';
    const unauthorizedRestart = await makeRequest('/api/deploy-restart');
    assert.strictEqual(unauthorizedRestart.statusCode, 401);

    const authorizedRestart = await makeRequest('/api/deploy-restart?secret=areena-deploy-restart');
    assert.strictEqual(authorizedRestart.statusCode, 200);
    assert.strictEqual(authorizedRestart.json().success, true);
    // 14. Password Change (Authenticated)
    const badChangeRes = await makeRequest('/api/admin/change-password', {
      method: 'POST',
      headers: { Cookie: loginCookie },
      body: JSON.stringify({
        currentPassword: 'wrongPassword',
        newPassword: 'newSecurePassword456'
      })
    });
    assert.strictEqual(badChangeRes.statusCode, 400, 'Password change must reject incorrect current password');

    const goodChangeRes = await makeRequest('/api/admin/change-password', {
      method: 'POST',
      headers: { Cookie: loginCookie },
      body: JSON.stringify({
        currentPassword: 'securePassword123',
        newPassword: 'newSecurePassword456'
      })
    });
    assert.strictEqual(goodChangeRes.statusCode, 200);
    assert.strictEqual(goodChangeRes.json().success, true);

    // Old password should now fail login
    const oldLoginFail = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'masteradmin',
        password: 'securePassword123'
      })
    });
    assert.strictEqual(oldLoginFail.statusCode, 401, 'Old password must no longer work');

    // New password should succeed
    const newLoginSuccess = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'masteradmin',
        password: 'newSecurePassword456'
      })
    });
    assert.strictEqual(newLoginSuccess.statusCode, 200);
    console.log('  ✅ Password Change API verified (old password check, password update, re-login)');

    // 15. Password Reset Request (Forgot Password)
    const unknownForgotRes = await makeRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'nonexistent@areena.play' })
    });
    assert.strictEqual(unknownForgotRes.statusCode, 200, 'Forgot password returns 200 to prevent enumeration');

    const knownForgotRes = await makeRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'master@areena.play' })
    });
    assert.strictEqual(knownForgotRes.statusCode, 200);
    assert.strictEqual(knownForgotRes.json().success, true);

    // Retrieve the reset token from the test DB directly to test reset endpoint
    const db = getDB();
    const tokenObj = db.data.password_resets.find(r => r.user_id === 1);
    assert.ok(tokenObj && tokenObj.token, 'A password reset token should be recorded in DB');
    const validResetToken = tokenObj.token;

    // 16. Password Reset with Token
    const invalidTokenRes = await makeRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: 'invalid-fake-token-123',
        newPassword: 'brandNewPassword789'
      })
    });
    assert.strictEqual(invalidTokenRes.statusCode, 400, 'Reset password must reject invalid token');

    const validResetRes = await makeRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: validResetToken,
        newPassword: 'brandNewPassword789'
      })
    });
    assert.strictEqual(validResetRes.statusCode, 200);
    assert.strictEqual(validResetRes.json().success, true);
    const resetSessionCookie = extractCookie(validResetRes.headers);
    assert.ok(resetSessionCookie && resetSessionCookie.includes('areena_session='), 'Reset password should log user in with session cookie');

    // Verify login with newest password works
    const resetLoginRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'masteradmin',
        password: 'brandNewPassword789'
      })
    });
    assert.strictEqual(resetLoginRes.statusCode, 200);
    console.log('  ✅ Password Forgot & Reset flow verified (token generation, token validation, password update, auto-login)');

    console.log('\n✨ All test suites passed successfully!\n');
    server.close(() => {
      try {
        const db = getDB();
        db.close();
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      } catch (e) {}
      process.exit(0);
    });
  } catch (err) {
    console.error('❌ Test failed:', err);
    server.close(() => {
      try {
        const db = getDB();
        db.close();
        if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      } catch (e) {}
      process.exit(1);
    });
  }
}

setTimeout(runTests, 600);
