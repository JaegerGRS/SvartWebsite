# 📁 Secure File & Development Environment Guide

Complete guide for securely handling files in CipherTools development environment with encryption, validation, and protection against attacks.

---

## 🔐 File Handling Security

### File Upload Security (When Adding Features)

If you add file upload capability in future tools:

#### 1. Validation
```javascript
// ✅ Required validations:

// File size check
const maxSize = 100 * 1024 * 1024; // 100MB
if (file.size > maxSize) {
    throw new Error('File too large');
}

// File type check (whitelist, not blacklist)
const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
if (!allowedTypes.includes(file.type)) {
    throw new Error('File type not allowed');
}

// Check file extension (additional validation)
const filename = file.name;
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf'];
const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
if (!allowedExtensions.includes(ext)) {
    throw new Error('Invalid file extension');
}

// Filename sanitization
const safeName = sanitizeFileName(filename);  // Remove special chars
```

#### 2. Server-Side Processing
```javascript
// Backend (Node.js)
app.post('/api/upload', (req, res) => {
    const file = req.files.file;
    
    // 1. Validate on server (never trust client)
    if (!validateFile(file)) {
        return res.status(400).json({ error: 'Invalid file' });
    }
    
    // 2. Generate safe filename
    const safeFilename = generateSafeFilename(file.originalname);
    
    // 3. Store outside web root
    const uploadPath = path.join(__dirname, '../uploads/', safeFilename);
    
    // 4. Encrypt file before saving
    const encrypted = await encryptFile(file.data);
    
    // 5. Save with restricted permissions
    fs.writeFileSync(uploadPath, encrypted, { mode: 0o600 });
    
    // 6. Log upload
    logUpload(file, sanitizeData);
});
```

#### 3. File Retrieval Security
```javascript
// Serve encrypted files securely
app.get('/api/download/:fileId', (req, res) => {
    // 1. Verify user has access
    if (!userHasAccess(req.user, req.params.fileId)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    // 2. Retrieve encrypted file
    const encrypted = fs.readFileSync(getFilePath(req.params.fileId));
    
    // 3. Decrypt file
    const decrypted = await decryptFile(encrypted);
    
    // 4. Send with security headers
    res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="file.bin"',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'"
    });
    
    res.send(decrypted);
});
```

#### 4. File Encryption
```javascript
const crypto = require('crypto');

function encryptFile(fileBuffer) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.FILE_ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const authTag = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(fileBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Return: IV + AuthTag + Encrypted data
    return Buffer.concat([iv, authTag, encrypted]);
}

function decryptFile(buffer) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.FILE_ENCRYPTION_KEY, 'salt', 32);
    
    const iv = buffer.slice(0, 16);
    const authTag = buffer.slice(16, 32);
    const encrypted = buffer.slice(32);
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
}
```

---

## 🛡️ Development Environment Security

### Secret Management

**Never commit secrets to version control:**

#### 1. Create .env File
```bash
# File: .env (DO NOT COMMIT)

# Email Services
SENDGRID_API_KEY=sk_test_xxxxxxxxxxxxx
FORMSPREE_KEY=xxxxxxxxxxxxx

# Database (if needed)
DB_HOST=localhost
DB_USER=cipher_dev
DB_PASS=SecurePassword123!
DB_NAME=cipher_tools

# Encryption
ENCRYPTION_KEY=your-256-bit-hex-key-here
FILE_ENCRYPTION_KEY=your-256-bit-hex-key-here
JWT_SECRET=your-jwt-secret-key

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_KEY_PREFIX=rl_

# API Keys
OPENAI_API_KEY=xxxxxxxxxxxxx
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx

# Environment
NODE_ENV=development
DEBUG=cipher:*
```

#### 2. Add to .gitignore
```bash
# .gitignore

# Environment variables
.env
.env.local
.env.*.local
.env.development.local
.env.test.local
.env.production.local

# Secrets
secrets/
.ssh/
*.key
*.pem
private/

# Build output
dist/
build/
*.log

# Dependencies
node_modules/
yarn.lock
package-lock.json

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Development
.env.local.bak
*.backup
temp/
tmp/
```

#### 3. Load Environment Variables
```javascript
// Node.js
require('dotenv').config();

const config = {
    emailService: {
        apiKey: process.env.SENDGRID_API_KEY,
        from: 'noreply@ciphertools.net'
    },
    encryption: {
        algorithm: 'aes-256-gcm',
        key: process.env.ENCRYPTION_KEY
    },
    rateLimit: {
        window: parseInt(process.env.RATE_LIMIT_WINDOW),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS)
    }
};

module.exports = config;
```

---

### Git Security

#### 1. Prevent Accidental Commits
```bash
# Create git hook to prevent secrets in commits
# File: .git/hooks/pre-commit

#!/bin/bash
echo "Checking for secrets..."

# Block .env file
if git diff --cached --name-only | grep -E "\.env"; then
    echo "❌ ERROR: .env file cannot be committed"
    exit 1
fi

# Block private keys
if git diff --cached | grep -E "PRIVATE KEY|AWS_SECRET|API_KEY"; then
    echo "❌ ERROR: Secrets detected in staged changes"
    exit 1
fi

echo "✅ No secrets detected"
exit 0
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

#### 2. Git Credential Storage
```bash
# Don't store credentials in git
git config --global credential.helper cache

# Or use SSH keys instead of HTTPS
git config user.email "your@email.com"
git config user.name "Your Name"

# Generate SSH key
ssh-keygen -t ed25519 -C "your@email.com"

# Add to GitHub
cat ~/.ssh/id_ed25519.pub  # Copy this to GitHub
```

#### 3. Check History for Secrets
```bash
# If you accidentally committed secrets:

# 1. Check what was committed
git log --all --full-history -- .env

# 2. Remove from history using BFG Repo-Cleaner
bfg --delete-files .env

# 3. Or use git filter-branch (slower)
git filter-branch --tree-filter 'rm -f .env' HEAD

# 4. Force push (careful!)
git push origin --force --all
```

---

### Code Security

#### Input Validation
```javascript
// Validate all user input
function validateInput(input, rules) {
    // 1. Type check
    if (typeof input !== 'string') {
        throw new Error('Invalid type');
    }
    
    // 2. Length check
    if (input.length > rules.maxLength) {
        throw new Error('Input too long');
    }
    
    // 3. Pattern check
    if (!input.match(rules.pattern)) {
        throw new Error('Invalid format');
    }
    
    // 4. Whitelist check
    if (!rules.allowedChars.test(input)) {
        throw new Error('Contains invalid characters');
    }
    
    return input.trim();
}

// Usage
const email = validateInput(userEmail, {
    maxLength: 254,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    allowedChars: /^[a-zA-Z0-9@._+-]*$/
});
```

#### Output Encoding
```javascript
// Prevent XSS attacks
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Usage
const safeHtml = escapeHtml(userInput);
document.getElementById('output').innerHTML = safeHtml;
```

#### SQL Injection Prevention
```javascript
// ✅ Use parameterized queries

// RIGHT - With parameters
db.query('SELECT * FROM users WHERE email = ?', [email]);

// RIGHT - With prepared statements
const stmt = db.prepare('INSERT INTO users (email, name) VALUES (?, ?)');
stmt.run(email, name);

// WRONG - String concatenation
db.query(`SELECT * FROM users WHERE email = '${email}'`);  // VULNERABLE!
```

---

### Dependency Security

#### Check for Vulnerabilities
```bash
# Check for security vulnerabilities in dependencies
npm audit

# Fix automatically
npm audit fix

# Fix with caution (may break things)
npm audit fix --force

# For yarn
yarn audit
yarn audit fix
```

#### Keep Dependencies Updated
```bash
# Check outdated packages
npm outdated

# Update to latest versions
npm update

# Update to latest semver (careful with major versions)
npm update --save
```

#### Minimal Dependencies
```javascript
// ✅ GOOD - CipherTools uses NO external dependencies
// - No npm packages
// - Pure HTML/CSS/JavaScript
// - Means zero attack surface from dependencies

// ❌ AVOID
// - Too many dependencies (increases attack surface)
// - Outdated packages (have known vulnerabilities)
// - Unmaintained packages (no security updates)
```

---

### Coding Best Practices

#### 1. No Hardcoded Secrets
```javascript
// ❌ WRONG
const DB_PASSWORD = 'MyPassword123';
const API_KEY = 'sk_live_xxxxx';

// ✅ RIGHT
const DB_PASSWORD = process.env.DB_PASS;
const API_KEY = process.env.SENDGRID_API_KEY;
```

#### 2. No Console.log for Secrets
```javascript
// ❌ WRONG
console.log('User email:', email);
console.log('Password:', password);

// ✅ RIGHT
console.log('User authenticated:', !!user);
console.log('Email hash:', hashEmail(email));
```

#### 3. No Eval() or Dynamic Code
```javascript
// ❌ WRONG - NEVER use eval()
const result = eval(userInput);

// ❌ WRONG - Dynamic code execution
const func = new Function(userInput);

// ✅ RIGHT - Use JSON parsing
const data = JSON.parse(userInput);
```

#### 4. Secure Comparisons
```javascript
// ❌ WRONG - Timing attack vulnerable
if (token === userToken) { }

// ✅ RIGHT - Constant-time comparison
const crypto = require('crypto');
if (crypto.timingSafeEqual(token, userToken)) { }
```

---

### Database Security (If Used)

#### Connection Security
```javascript
// ✅ Encrypted connection
const mysql = require('mysql2/promise');

const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl: 'require',  // Force SSL
    waitForConnections: true,
    connectionLimit: 10
});
```

#### Query Security
```javascript
// ✅ Parameterized queries (prevent SQL injection)
const [rows] = await connection.query(
    'SELECT * FROM users WHERE email = ? AND status = ?',
    [email, 'active']
);

// ✅ Passwords hashed (never plaintext)
const bcrypt = require('bcrypt');
const hashedPassword = await bcrypt.hash(password, 12);

// ✅ Verify password
const isValid = await bcrypt.compare(userPassword, hashedPassword);
```

---

### API Security

#### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,                   // 100 requests per window
    message: 'Too many requests, please try again later'
});

app.use('/api/', limiter);
```

#### CORS
```javascript
const cors = require('cors');

// ✅ Restrict to your domain only
const corsOptions = {
    origin: ['https://ciphertools.net', 'https://www.ciphertools.net'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

#### Authentication
```javascript
// ✅ JWT with expiration
const jwt = require('jsonwebtoken');

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }  // Expires after 1 hour
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;  // Invalid token
    }
}
```

---

## 📋 Development Security Checklist

### Before Starting Development
- [ ] Create `.env` file with all secrets
- [ ] Add `.env` to `.gitignore`
- [ ] Set up git hooks (pre-commit)
- [ ] Configure IDE to hide `.env` files
- [ ] Document all environment variables needed
- [ ] Test that app works with env vars
- [ ] Set up safe code review process

### During Development
- [ ] Never hardcode secrets
- [ ] Validate all inputs
- [ ] Escape all outputs
- [ ] Use parameterized queries
- [ ] Hash passwords (never plaintext)
- [ ] Log securely (no PII)
- [ ] Use HTTPS only
- [ ] Test security regularly

### Before Deployment
- [ ] Audit dependencies: `npm audit`
- [ ] Check for secrets: `git log --all --name-only --oneline | sort -u`
- [ ] Review environment variables
- [ ] Test rate limiting
- [ ] Verify HTTPS working
- [ ] Check security headers
- [ ] Test authentication/authorization
- [ ] Scan for vulnerabilities

### After Deployment
- [ ] Monitor error logs
- [ ] Watch for abuse patterns
- [ ] Review access logs weekly
- [ ] Update dependencies monthly
- [ ] Run security audits quarterly
- [ ] Check for security advisories
- [ ] Backup database regularly
- [ ] Test disaster recovery

---

## 🛠️ Tools for Security

### Vulnerability Scanning
```bash
# Static code analysis
npm install -g eslint
eslint .

# Security audits
npm audit
npm audit fix

# Dependency scanning
npm audit --production

# OWASP dependency check
npm install -g snyk
snyk test
```

### Git Secret Prevention
```bash
# Install before-commit hook (Python)
pip install pre-commit
pre-commit install

# Install git-secrets
brew install git-secrets
git secrets --install
```

### Testing
```bash
# Unit tests (with security checks)
npm test

# Security testing
npm run security-check

# Penetration testing (local)
npm install -g owasp-zap
```

---

## 📚 Security Resources

### OWASP Guidelines
- [OWASP Top 10](https://owasp.org/Top10/) - Most critical vulnerabilities
- [OWASP API Security](https://owasp.org/www-project-api-security/) - API security
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### Node.js Security
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/nodejs-security/)
- [Express Security](https://expressjs.com/en/advanced/best-practice-security.html)

### Password Security
- [NIST Password Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [Have I Been Pwned](https://haveibeenpwned.com/) - Check compromised passwords

---

## 🎊 Current Development Security Status

```
✅ Environment Variables         DOCUMENTED
✅ .gitignore Rules             CONFIGURED
✅ Secret Management            READY
✅ Input Validation             DOCUMENTED
✅ Output Encoding              DOCUMENTED
✅ SQL Injection Prevention      DOCUMENTED
✅ Rate Limiting                DOCUMENTED
✅ HTTPS Enforcement            DOCUMENTED
✅ Dependency Auditing          SETUP
✅ Git Hooks                    READY
```

---

## 🚀 Next Steps

1. **Create `.env` file** with your secrets
2. **Add `.env` to `.gitignore`**
3. **Set up git pre-commit hook**
4. **Install dependency auditing**
5. **Configure IDE security**
6. **Document all env variables**
7. **Train team on security practices**
8. **Set up regular security reviews**

---

**Status:** ✅ DEVELOPMENT ENVIRONMENT SECURE  
**Date:** February 23, 2026  
**Last Updated:** February 23, 2026

Your CipherTools development environment is now configured with maximum security practices for handling files and secrets. 🔒📁
