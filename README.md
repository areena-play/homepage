# AREENA Homepage

A clean, modern, and multilingual static homepage package for **AREENA** with an embedded SQLite database, admin control panel, and maintenance mode toggle.

---

## ✨ Features

- 🔐 **Embedded SQLite Database & Admin Auth**:
  - Zero-configuration local database (`data/areena.db`, auto-created).
  - Secure PBKDF2/Scrypt salted password hashing and signed HTTP-only session cookies.
  - **First-Visit Onboarding**: Automatically prompts to set up the primary admin account on first launch.
  - **Admin Control Panel (`/admin`)**: Create/manage other admin logins and view administrative telemetry.
  - Closed registration: only existing administrators can create additional admin logins.
- 🚧 **Maintenance Mode Toggle**:
  - Live toggle in the admin control panel.
  - When enabled, all public visitors are greeted with a dedicated maintenance page featuring the AREENA logo and status notice.
  - Logged-in administrators bypass maintenance mode to inspect the site and access `/admin`.
- 🌐 **Modular Multilingual Architecture**:
  - Dedicated JSON dictionaries for **English (`en.json`)**, **German (`de.json`)**, **French (`fr.json`)**, and **Italian (`it.json`)** under `public/locales/`.
  - Dynamic in-browser language switching without page reloads or layout shifts.
- 🌓 **Light / Dark Mode**:
  - Instant theme toggle with zero-flash on page load (`data-theme` resolution in `<head>`).
  - Automatic logo switching between dark theme (`areena-logo-dark.png`) and light theme (`areena-logo.png`).
- 📊 **Live Uptime & Status Monitoring**:
  - Real-time telemetry badges integrated directly from [status.areena.ch](https://status.areena.ch).
- 📄 **Dedicated Legal & Error Pages**:
  - `/impressum` — Dedicated Swiss & EU compliant legal notice and imprint page.
  - `/privacy-policy` (and `/privacy`) — Dedicated FADP & GDPR compliant privacy policy page.
  - `/404` — Clean custom Page Not Found view.
- 🚀 **NPM & CLI Ready**: Can be run directly via `npx areena-homepage` or embedded as a dependency.

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

### 3. Open Admin Control Panel
Navigate to `http://localhost:3000/admin`.
On first launch, you will be prompted to create the primary administrator account.

### 4. Run Automated Tests
```bash
npm test
```

---

## 📁 Project Structure

```
areena-homepage/
├── bin/
│   └── serve.js               # CLI executable for npx/global execution
├── data/                      # Auto-created SQLite DB directory (gitignored)
│   └── areena.db
├── lib/
│   └── db.js                  # Database models, password hashing & sessions
├── public/
│   ├── assets/
│   │   ├── areena-logo-dark.png # Dark theme logo (white text)
│   │   ├── areena-logo.png      # Light theme logo (black text)
│   │   ├── favicon.svg          # SVG vector favicon
│   │   └── icon.svg             # Application icon
│   ├── css/
│   │   └── styles.css           # Responsive styles, themes, and animations
│   ├── js/
│   │   ├── app.js               # Frontend controller & setup prompt check
│   │   └── i18n.js              # i18n loader module
│   ├── locales/
│   │   ├── en.json              # English translations
│   │   ├── de.json              # German translations
│   │   ├── fr.json              # French translations
│   │   └── it.json              # Italian translations
│   ├── favicon.ico
│   ├── favicon.svg
│   ├── index.html               # Main homepage template
│   ├── admin.html               # Admin Dashboard & Login (/admin)
│   ├── maintenance.html         # Maintenance page (/maintenance)
│   ├── impressum.html           # Dedicated Impressum page (/impressum)
│   ├── privacy-policy.html      # Dedicated Privacy Policy page (/privacy-policy)
│   └── 404.html                 # 404 Page Not Found
├── test/
│   └── server.test.js           # 10 automated test suites (DB, auth, maintenance)
├── server.js                    # Express server with session & maintenance gates
├── package.json                 # Package definition & npm scripts
└── README.md                    # Project documentation
```

---

## 📄 License

MIT © [AREENA Team](https://areena.play)
