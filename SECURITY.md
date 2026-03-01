# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (main branch) | ✅ Yes |

## Reporting a Vulnerability

If you discover a security vulnerability in Svart Security, **please do not open a public issue**.

Instead, report it privately:

1. **Email:** Send details to **support@svartsecurity.org** with the subject line `[SECURITY] Vulnerability Report`
2. **GitHub:** Use [GitHub's private vulnerability reporting](https://github.com/JaegerGRS/SvartWebsite/security/advisories/new)

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

| Action | Timeframe |
|--------|-----------|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 1 week |
| Fix deployed | As soon as possible |

### Scope

The following are in scope for security reports:

- **Website** — svartsecurity.org (XSS, injection, auth bypass, etc.)
- **API endpoints** — All Cloudflare Worker functions in `functions/api/`
- **Client-side** — Theme engine, authentication flow, session handling
- **NetworkGuardian** — Content moderation bypass or abuse

### Out of Scope

- Social engineering attacks against team members
- Denial of service (DoS/DDoS) attacks
- Issues in third-party dependencies (report to their maintainers)

## Security Measures

This project implements:

- **AES-256-GCM encryption** for all sensitive data
- **Cloudflare's edge network** for DDoS protection and WAF
- **Security headers** (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- **Rate limiting** on all API endpoints
- **Input validation** and sanitization on all user inputs
- **Secret key activation** system for account provisioning

## Responsible Disclosure

We follow responsible disclosure practices. If you report a valid vulnerability, we will:

- Credit you in the fix (unless you prefer anonymity)
- Not pursue legal action for good-faith security research
- Work with you to understand and resolve the issue

Thank you for helping keep Svart Security safe.
