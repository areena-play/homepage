# AREENA Homepage

A clean, modern, and multilingual static homepage package for **AREENA** served via Node.js / Express.

---

## ✨ Features

- 🌐 **Modular Multilingual Architecture**:
  - Separate locale files for **English (`en.json`)**, **German (`de.json`)**, **French (`fr.json`)**, and **Italian (`it.json`)** under `public/locales/`.
  - Dynamic in-browser language switching without page reloads.
  - Automatic language detection (URL `?lang=`, `localStorage`, browser preference).
- 🌓 **Light / Dark Mode**:
  - Seamless theme toggle with smooth transitions.
  - Theme preference persistence in `localStorage` with system `prefers-color-scheme` fallback.
  - Automatic logo switching between dark theme (`areena-logo.png`) and light theme (`areena-logo-dark.png`).
- 📊 **Live Uptime & Status Monitoring**:
  - Real-time telemetry badges integrated directly from [status.areena.ch](https://status.areena.ch).
  - Live status indicators for AREENA Platform, Dev API, Dev Environment, and Telemetry/Logs.
- 📄 **Dedicated Legal Pages**:
  - `/impressum` — Dedicated Swiss/EU compliant legal notice and imprint page.
  - `/privacy-policy` (and `/privacy`) — Dedicated FADP & GDPR compliant privacy policy page.
- ⚡ **Zero Database / Pure Static**: Fast, lightweight, and secure static file serving with gzip/brotli compression and security headers (`X-Frame-Options`, `CSP`, `XSS Protection`).
- 🚀 **NPM & CLI Ready**: Can be run directly via `npx areena-homepage` or embedded as a dependency in other projects.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
The site will be live at `http://localhost:3000`.

### 3. Development Mode (Auto-Reload)
```bash
npm run dev
```

### 4. Run Automated Tests
```bash
npm test
```

---

## 🛠️ CLI Usage

You can run the server directly using the CLI executable:

```bash
# Run on default port (3000)
npx areena-homepage

# Run on a custom port
npx areena-homepage --port 8080
# or
areena-serve -p 8080
```

---

## 📁 Project Structure

```
areena-homepage/
├── bin/
│   └── serve.js               # CLI executable for npx/global execution
├── public/
│   ├── assets/
│   │   ├── areena-logo.png    # Dark theme logo (white text)
│   │   ├── areena-logo-dark.png # Light theme logo (dark text)
│   │   ├── favicon.svg        # SVG vector favicon
│   │   └── icon.svg           # Application icon
│   ├── css/
│   │   └── styles.css         # Responsive styling, light/dark themes, animations
│   ├── js/
│   │   ├── app.js             # Frontend controller (theme, language, nav, form)
│   │   └── i18n.js            # i18n loader module
│   ├── locales/
│   │   ├── en.json            # English translations
│   │   ├── de.json            # German translations
│   │   ├── fr.json            # French translations
│   │   └── it.json            # Italian translations
│   ├── favicon.ico
│   ├── favicon.svg
│   ├── index.html             # Homepage template
│   ├── impressum.html         # Dedicated Impressum page (/impressum)
│   └── privacy-policy.html    # Dedicated Privacy Policy page (/privacy-policy)
├── test/
│   └── server.test.js         # Automated endpoint & locale tests
├── server.js                  # Express server with compression & routes
├── package.json               # Package definition & npm scripts
└── README.md                  # Project documentation
```

---

## 🌍 Adding or Editing Translations

All translations are isolated in individual JSON files under `public/locales/`:
- `public/locales/en.json`
- `public/locales/de.json`
- `public/locales/fr.json`
- `public/locales/it.json`

---

## 📄 License

MIT © [AREENA Team](https://areena.play)
