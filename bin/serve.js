#!/usr/bin/env node

const { startServer } = require('../server');

// Parse CLI flags (e.g., --port 8080 or -p 8080)
const args = process.argv.slice(2);
let port = process.env.PORT || 3000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    if (args[i + 1] && !isNaN(Number(args[i + 1]))) {
      port = Number(args[i + 1]);
      i++;
    }
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
AREENA Homepage Static Server

Usage:
  npx areena-homepage [options]
  areena-serve [options]

Options:
  -p, --port <number>  Port to run the server on (default: 3000)
  -h, --help           Show this help message
`);
    process.exit(0);
  }
}

startServer(port);

