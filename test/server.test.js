const http = require('http');
const assert = require('assert');
const { startServer } = require('../server');

const TEST_PORT = 3458;
const server = startServer(TEST_PORT);

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${TEST_PORT}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, data });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('🧪 Running comprehensive server verification tests...');

  try {
    // 1. Root index endpoint
    const rootRes = await makeRequest('/');
    assert.strictEqual(rootRes.statusCode, 200, 'Root status should be 200');
    assert.ok(rootRes.data.includes('AREENA'), 'Root should contain AREENA brand');
    assert.ok(rootRes.data.includes('areena-logo-dark.png'), 'Root should use areena-logo-dark.png for dark theme');
    assert.ok(rootRes.data.includes('areena-logo.png'), 'Root should use areena-logo.png for light theme');
    console.log('  ✅ GET / returns 200 with correct dark/light logos');

    // 2. Dedicated Impressum & Privacy Policy routes
    const impressumRes = await makeRequest('/impressum');
    assert.strictEqual(impressumRes.statusCode, 200, 'Impressum status should be 200');
    console.log('  ✅ GET /impressum returns 200');

    const privacyRes = await makeRequest('/privacy-policy');
    assert.strictEqual(privacyRes.statusCode, 200, 'Privacy policy status should be 200');
    console.log('  ✅ GET /privacy-policy returns 200');

    // 3. 404 Page Not Found endpoint
    const notFoundRes = await makeRequest('/non-existent-page-xyz');
    assert.strictEqual(notFoundRes.statusCode, 404, 'Unknown path should return 404');
    assert.ok(notFoundRes.data.includes('404'), '404 page should contain 404 text');
    assert.ok(notFoundRes.data.includes('notFound.heading'), '404 page should contain notFound i18n key');
    console.log('  ✅ GET /non-existent-page-xyz returns 404 status with custom 404.html');

    // 4. Locales
    for (const lang of ['en', 'de', 'fr', 'it']) {
      const locRes = await makeRequest(`/locales/${lang}.json`);
      assert.strictEqual(locRes.statusCode, 200, `Locale ${lang}.json should be 200`);
      const parsed = JSON.parse(locRes.data);
      assert.ok(parsed.notFound && parsed.notFound.heading, `Locale ${lang} must contain notFound section`);
      console.log(`  ✅ GET /locales/${lang}.json includes notFound translations`);
    }

    console.log('\n✨ All tests passed successfully!\n');
    server.close(() => {
      process.exit(0);
    });
  } catch (err) {
    console.error('❌ Test failed:', err);
    server.close(() => {
      process.exit(1);
    });
  }
}

setTimeout(runTests, 500);
