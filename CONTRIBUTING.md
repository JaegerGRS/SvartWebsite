# Contributing to Svart Security

Thank you for your interest in contributing to Svart Security. To maintain the integrity and security of this project, all contributions go through a strict review process.

## ⚠️ Important: All Changes Require Owner Approval

This repository is **locked down**. No code reaches `main` without explicit approval from the project owner ([@JaegerGRS](https://github.com/JaegerGRS)).

- **Direct pushes to `main` are blocked** — all changes must go through a Pull Request
- **All PRs require owner review and approval** before merging
- **Force pushes are disabled** on all protected branches
- **Branch deletions are restricted**

## How to Contribute

### 1. Fork the Repository

```bash
# Fork via GitHub, then clone your fork
git clone https://github.com/YOUR-USERNAME/SvartWebsite.git
cd SvartWebsite
```

### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 3. Make Your Changes

- Follow the existing code style
- Test your changes locally with `npm start`
- Run `npm run build` to verify the build succeeds

### 4. Commit with Clear Messages

```bash
git commit -m "Add: brief description of what you added"
```

Use prefixes: `Add:`, `Fix:`, `Update:`, `Remove:`, `Refactor:`

### 5. Push and Open a Pull Request

```bash
git push origin feature/your-feature-name
```

Then open a PR on GitHub targeting the `main` branch.

### 6. Wait for Review

The project owner will review your PR. You may be asked to make changes before it's approved.

## What We Accept

- Bug fixes with clear reproduction steps
- Security improvements
- Documentation improvements
- Accessibility improvements
- Performance optimisations

## What We Don't Accept

- Changes that bypass or weaken encryption
- Removal of security headers or protections
- Code that introduces tracking or telemetry
- Changes to the NetworkGuardian that weaken moderation
- PRs without a clear description of what and why

## Code Style

- **HTML/CSS/JS** — follow the existing patterns in the codebase
- **TypeScript (API functions)** — strict types, no `any` unless unavoidable
- **Indentation** — spaces (match surrounding code)
- **No external dependencies** without prior discussion

## Security Issues

Do **not** open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## Questions?

- [Community Forum](https://svartsecurity.org/community.html)
- [Contact Page](https://svartsecurity.org/contact.html)
- [Open an Issue](https://github.com/JaegerGRS/SvartWebsite/issues)
