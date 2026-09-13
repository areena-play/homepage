const express = require('express');
const compression = require('compression');
const path = require('path');

function createServer(options = {}) {
  const app = express();
  const publicDir = options.publicDir || path.join(__dirname, 'public');

  // Enable Gzip / Brotli compression
  app.use(compression());

  // Security and performance headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Serve static files with caching
  app.use(express.static(publicDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true
  }));

  // Dedicated routes for valid pages
  app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/impressum', (req, res) => {
    res.sendFile(path.join(publicDir, 'impressum.html'));
  });

  app.get(['/privacy-policy', '/privacy'], (req, res) => {
    res.sendFile(path.join(publicDir, 'privacy-policy.html'));
  });

  // 404 Page Not Found handler
  app.use((req, res) => {
    res.status(404).sendFile(path.join(publicDir, '404.html'));
  });

  return app;
}

function startServer(port = process.env.PORT || 3000) {
  const app = createServer();
  const server = app.listen(port, () => {
    console.log(`\n==================================================`);
    console.log(`  🚀 AREENA Homepage is running!`);
    console.log(`  🌐 Local:   http://localhost:${port}`);
    console.log(`  🌍 Network: http://127.0.0.1:${port}`);
    console.log(`==================================================\n`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { createServer, startServer };
