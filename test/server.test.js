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
    assert.strictEqual(publicMaintRes.statusCode, 503);
    console.log('  ✅ Maintenance Mode active: Public visitors receive 503');

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

    // 10. Dedicated Pages & 404 checks
    const impressumRes = await makeRequest('/impressum');
    assert.strictEqual(impressumRes.statusCode, 200);
    const privacyRes = await makeRequest('/privacy-policy');
    assert.strictEqual(privacyRes.statusCode, 200);
    const notFoundRes = await makeRequest('/some-missing-page');
    assert.strictEqual(notFoundRes.statusCode, 404);
    console.log('  ✅ Dedicated Impressum, Privacy Policy, and 404 routes function as expected');

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
