<div align="center">

# ◆ Svart Security

### Your Privacy. Your Tools. Your Control.

[![Website](https://img.shields.io/badge/Website-svartsecurity.org-7c3aed?style=for-the-badge&logo=cloudflare&logoColor=white)](https://svartsecurity.org)
[![Cloudflare Pages](https://img.shields.io/badge/Hosted_on-Cloudflare_Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)

<br>

<img src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white" alt="HTML5">
<img src="https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white" alt="CSS3">
<img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript">
<img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
<img src="https://img.shields.io/badge/Cloudflare_Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers">

</div>

---

**Svart Security** is a privacy-first security platform offering a growing suite of encrypted tools — from a secure browser and AI assistant to encrypted notes, passwords, and messaging. This repository contains the full source for [svartsecurity.org](https://svartsecurity.org), the official website and web-based tool hub.

> *We protect people, not crimes. Security & privacy tools with full encryption and zero tolerance for criminal activity.*

<br>

## ◆ Tools

| Tool | Category | Encryption | Status |
|------|----------|------------|--------|
| **Svart Browser** | Web Browsing | AES-256 | 🟡 In Development |
| **Svart AI** | AI Assistant | AES-256-GCM | 🟢 Core |
| **SVART Passwords** | Password Vault | AES-256-GCM | 🔵 Planned |
| **SVART Notes** | Encrypted Notes | AES-256-GCM | 🔵 Planned |
| **SVART Docs** | Document Editor | AES-256-GCM | 🔵 Planned |
| **SVART Chat** | Encrypted Messaging | X25519 + AES-256 | 🔵 Planned |
| **Secure Email** | Email Privacy | E2E Encryption | 🔵 Planned |
| **File Encryption** | Data Protection | AES-256 | 🔵 Planned |
| **Privacy Checker** | Privacy Audit | — | 🔵 Planned |
| **VPN Service** | Network Privacy | No-Log | 🔵 Planned |

<br>

## ◆ Website Features

- **47 built-in themes** — dark, light, neon, retro, and more via a live theme engine
- **Community forum** — bug reports, feature requests, discussions, and Q&A
- **NetworkGuardian** — real-time content moderation enforcing 35+ law violation categories
- **Admin & mod panel** — role management, registration logs, moderation actions
- **Serverless backend** — 13 Cloudflare Worker API endpoints (auth, rate-limiting, KV storage)
- **Secret-key activation system** — account provisioning with unique secret keys
- **Responsive design** — mobile-first layout with hamburger navigation
- **Security headers** — CSP, HSTS, X-Frame-Options, and more via `_headers`

<br>

## ◆ Tech Stack

```
Frontend     HTML5 · CSS3 · Vanilla JS
Backend      Cloudflare Pages Functions (TypeScript)
Storage      Cloudflare KV
Hosting      Cloudflare Pages (auto-deploy on push)
Encryption   AES-256-GCM · X25519 key exchange
Build        Node.js (build-main.js → main/)
```

<br>

## ◆ Project Structure

```
├── index.html              # Landing page
├── tools.html              # Tools showcase with detail modals
├── pricing.html            # Plans & pricing
├── about.html              # About + NetworkGuardian info
├── community.html          # Community forum
├── contact.html            # Contact form
├── account.html            # User dashboard
├── css/style.css           # Global styles + 47 themes
├── js/script.js            # Theme engine, auth, navigation
│
├── functions/api/          # Cloudflare Worker endpoints
│   ├── auth.ts             #   Authentication & sessions
│   ├── registrations.ts    #   Account registration
│   ├── community.ts        #   Forum posts, replies, voting
│   ├── guardian.ts          #   NetworkGuardian enforcement
│   ├── guardian-reports.ts  #   Content moderation reports
│   ├── contact.ts           #   Contact form handler
│   ├── activations.ts       #   Secret key activation
│   ├── downloads.ts         #   Download tracking
│   └── ...                  #   + 4 more endpoints
│
├── SvartBrowser/           # Svart Browser tool page
├── SvartSecurity/          # Svart Security tool page
├── SvartAssistant/         # Svart AI Assistant tool page
├── SecureEmail/            # Secure Email tool page
├── FileEncryption/         # File Encryption tool page
├── PrivacyChecker/         # Privacy Checker tool page
├── security/               # Security dashboard & testing tools
│
├── build-main.js           # Build script → outputs to main/
├── wrangler.toml           # Cloudflare Pages config
├── _headers                # Security response headers
├── _redirects              # URL redirect rules
└── main/                   # Build output (deployed to Cloudflare)
```

<br>

## ◆ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 14
- A [Cloudflare](https://cloudflare.com) account (for deployment)

### Local Development

```bash
# Clone the repo
git clone https://github.com/JaegerGRS/SvartWebsite.git
cd SvartWebsite

# Install dependencies
npm install

# Start a local server
npm start
# → http://localhost:8000

# Build for production
npm run build
```

### Deploy

The site auto-deploys to [svartsecurity.org](https://svartsecurity.org) via Cloudflare Pages when changes are pushed to `main`.

```bash
git add -A && git commit -m "your changes"
git push origin main
```

<br>

## ◆ API Endpoints

All backend endpoints live in `functions/api/` and run as Cloudflare Pages Functions with KV storage.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth` | POST | User authentication & sessions |
| `/api/registrations` | POST | Account registration |
| `/api/verify` | POST | Email/account verification |
| `/api/password-reset` | POST | Password reset flow |
| `/api/activations` | POST | Secret key activation |
| `/api/community` | GET/POST | Forum posts, replies, voting |
| `/api/contact` | POST | Contact form submissions |
| `/api/guardian` | POST | NetworkGuardian enforcement |
| `/api/guardian-reports` | GET/POST | Moderation reports |
| `/api/mod-actions` | POST | Moderator actions |
| `/api/downloads` | GET/POST | Download tracking |
| `/api/usage` | GET | Usage statistics |
| `/api/health` | GET | Health check |

<br>

## ◆ Contributing

Contributions, ideas, and bug reports are welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m "Add my feature"`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

You can also submit suggestions through the [Community Forum](https://svartsecurity.org/community.html) or the [Contact Page](https://svartsecurity.org/contact.html).

<br>

## ◆ License

This project is licensed under the [MIT License](LICENSE).

<br>

---

<div align="center">

**◆ Svart Security** — *Privacy is not a privilege. It's a right.*

[Website](https://svartsecurity.org) · [Tools](https://svartsecurity.org/tools.html) · [Community](https://svartsecurity.org/community.html) · [Report an Issue](https://github.com/JaegerGRS/SvartWebsite/issues)

</div>