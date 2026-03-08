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
- **Security headers** (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Expect-CT)
- **Rate limiting** on all API endpoints
- **Input validation** and sanitization on all user inputs
- **Secret key activation** system for account provisioning

## Certificate Authority Verification

This domain uses SSL/TLS certificates exclusively issued by **Google Trust Services (GTS)**.

### Certificate Chain

| Level | Subject | Issuer |
|-------|---------|--------|
| 0 (Leaf) | `CN=svartsecurity.org` | `CN=WE1, O=Google Trust Services, C=US` |
| 1 (Intermediate) | `CN=WE1, O=Google Trust Services, C=US` | `CN=GTS Root R4, O=Google Trust Services LLC, C=US` |
| 2 (Cross-signed) | `CN=GTS Root R4` | `CN=GlobalSign Root CA` |
| 3 (Root) | `CN=GlobalSign Root CA` | Self-signed (trusted root) |

### CAA DNS Records

The following CAA records restrict certificate issuance to Google Trust Services only:

```
svartsecurity.org.  CAA  0 issue "pki.goog"
svartsecurity.org.  CAA  0 issuewild "pki.goog"
svartsecurity.org.  CAA  0 iodef "mailto:support@svartsecurity.org"
```

### Certificate Transparency

All certificates are published to public CT logs and can be monitored at:
- [crt.sh](https://crt.sh/?q=svartsecurity.org)
- [Google Transparency Report](https://transparencyreport.google.com/https/certificates)

### Verification

To verify the certificate chain independently:
```bash
openssl s_client -connect svartsecurity.org:443 -showcerts
```

## Responsible Disclosure

We follow responsible disclosure practices. If you report a valid vulnerability, we will:

- Credit you in the fix (unless you prefer anonymity)
- Not pursue legal action for good-faith security research
- Work with you to understand and resolve the issue

Thank you for helping keep Svart Security safe.
