# CipherTools Configuration Guide

Configuration and customization instructions for ciphertools.net platform.

## Site Information

### Basic Configuration
Edit these values in `index.html` to match your setup:

**1. Site Title & Meta Tags (Head Section)**
```html
<title>CipherTools - Security & Privacy Software Suite</title>
<meta name="description" content="A suite of powerful security and privacy tools...">
<meta name="keywords" content="security tools, privacy tools, encrypted browser...">
```

**2. Brand Name**
- Change from "CipherTools" to your preferred name in:
  - `index.html` - navbar and all sections
  - `css/style.css` - comments and branding
  - `README.md` - documentation
  - `TOOLS_GUIDE.md` - guides

**3. Domain Configuration**
Current domain target: `ciphertools.net`

Update references in:
- `robots.txt` - Sitemap URL
- `sitemap.xml` - All URLs
- `DEPLOYMENT.md` - Instructions
- `README.md` - Links

## Color Scheme Customization

Edit CSS variables in `css/style.css` (lines 15-22):

```css
:root {
    --primary: #00ff88;         /* Main accent color (currently lime green) */
    --primary-dark: #00cc6a;    /* Darker shade of primary */
    --bg-dark: #0a0e27;         /* Main background (dark blue) */
    --bg-darker: #050709;       /* Darker background variant */
    --text-light: #e8f0fe;      /* Main text color */
    --text-muted: #9ca3af;      /* Secondary text color */
    --border-color: #1f2937;    /* Border color */
    --accent: #00d4ff;          /* Secondary accent (cyan) */
    --danger: #ff4444;          /* Error color */
    --success: #00ff88;         /* Success color */
}
```

### Suggested Color Schemes

**Dark Security (Current)**
- Primary: #00ff88 (Lime)
- Accent: #00d4ff (Cyan)
- Background: #0a0e27 (Dark Blue)

**Professional Tech**
- Primary: #10b981 (Emerald)
- Accent: #3b82f6 (Blue)
- Background: #0f172a (Navy)

**Corporate Privacy**
- Primary: #6366f1 (Indigo)
- Accent: #8b5cf6 (Purple)
- Background: #1e1b4b (Deep Purple)

**Minimalist Security**
- Primary: #ffffff (White)
- Accent: #9333ea (Purple)
- Background: #1f2937 (Gray)

## Content Configuration

### Homepage Content

**1. Hero Section** (index.html, lines 30-60)
```html
<h1 class="hero-title">...</h1>          <!-- Main title -->
<p class="hero-subtitle">...</p>         <!-- Subtitle -->
<p class="hero-description">...</p>      <!-- Description -->
```

**2. Navigation Links** (index.html, lines 22-27)
Update menu items and their anchor links:
```html
<li><a href="#tools">Tools</a></li>      <!-- Link to #tools section -->
<li><a href="#cipher">CIPHER Browser</a></li>
<li><a href="#about">About</a></li>
<li><a href="#contact">Contact</a></li>
```

**3. Tools Grid** (index.html, lines 80-200)
- Edit existing tool cards
- Add new tool cards for future tools
- Update tool descriptions and badges

**4. Contact Information** (index.html, lines 410-430)
```html
<p><a href="mailto:hello@cipher.dev">hello@cipher.dev</a></p>
<p><a href="https://github.com/cipher-browser" target="_blank">github.com/cipher-browser</a></p>
<p><a href="https://twitter.com/cipherbrowser" target="_blank">@cipherbrowser</a></p>
```

**5. Footer** (index.html, lines 480-520)
- Update company name
- Update social links
- Update copyright year

## Email Configuration

### Contact Form

**Option 1: Formspree (Recommended)**
1. Go to formspree.io
2. Sign up and create new form
3. Replace form action in `index.html` (around line 405):
```html
<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
```

**Option 2: Netlify Forms (If hosting on Netlify)**
```html
<form name="contact" method="POST" netlify>
    <input type="text" name="name" required>
    <input type="email" name="email" required>
    <textarea name="message" required></textarea>
    <button type="submit">Send</button>
</form>
```

**Option 3: Backend Email Server**
Create server endpoint and update form action:
```html
<form action="https://ciphertools.net/api/contact" method="POST">
```

### Email Settings

Update email address in contact section:
1. Replace `hello@cipher.dev` with your email
2. Update social media links
3. Update company contact info

## Analytics Configuration

### Google Analytics 4

1. Create account at google.com/analytics
2. Set up property for ciphertools.net
3. Copy measurement ID
4. Add to `<head>` of index.html:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Alternative Analytics

**Plausible (Privacy-Focused)**
```html
<script defer data-domain="ciphertools.net" src="https://plausible.io/js/script.js"></script>
```

**Fathom (Lightweight)**
```html
<script src="https://cdn.usefathom.com/script.js" data-site="XXXXXX" defer></script>
```

## Domain Configuration

### DNS Setup for ciphertools.net

**If hosting on GitHub Pages:**
```
Type: CNAME
Name: @
Value: yourusername.github.io
TTL: 3600
```

**If hosting on Netlify:**
Use Netlify's nameservers (provided in dashboard)

**If hosting on traditional server:**
```
Type: A
Name: @
Value: Your server IP
TTL: 3600
```

### HTTPS/SSL Certificate

- GitHub Pages: Automatic
- Netlify: Automatic
- Traditional hosting: Use Let's Encrypt (free)

## SEO Configuration

### Basic SEO Settings

**1. Meta Tags** (Already configured in index.html)
```html
<meta name="description" content="...">
<meta name="keywords" content="...">
<meta name="theme-color" content="#0a0e27">
```

**2. Open Graph Tags** (Add to <head>)
```html
<meta property="og:title" content="CipherTools - Security & Privacy Tools">
<meta property="og:description" content="...">
<meta property="og:image" content="https://ciphertools.net/assets/og-image.jpg">
<meta property="og:type" content="website">
```

**3. Twitter Card Tags** (Add to <head>)
```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@cipherbrowser">
<meta name="twitter:title" content="CipherTools">
<meta name="twitter:description" content="...">
```

**4. Robots Configuration** (robots.txt - Pre-configured)
Update sitemap URL to match your domain:
```
Sitemap: https://ciphertools.net/sitemap.xml
```

**5. Sitemap** (sitemap.xml - Ready to customize)
Update all URLs from placeholder to actual domain:
```xml
<loc>https://ciphertools.net/</loc>
```

### Keywords to Target

**Primary Keywords:**
- security tools
- privacy tools
- encrypted browser
- privacy suite
- cipher tools

**Long-tail Keywords:**
- best privacy browser
- encrypted password manager
- secure file encryption
- privacy checklist tool
- tor browser alternative

## Logo & Branding

### Adding Your Logo

1. Create `assets/` directory if not exists
2. Add logo files:
   - `assets/logo.svg` - Main logo
   - `assets/logo-dark.png` - Dark variant
   - `assets/favicon.ico` - Browser tab icon

3. Update favicon in index.html:
```html
<link rel="icon" type="image/png" href="assets/logo.svg">
```

4. Use in navbar (create new element for logo):
```html
<div class="nav-brand">
    <img src="assets/logo.svg" alt="CipherTools">
    <span class="cipher-text">CipherTools</span>
</div>
```

### Brand Guidelines

**Logo Usage:**
- Square format for favicon
- Horizontal format for navbar
- Include padding around logo
- Minimum size: 32x32px

**Color Applications:**
- Primary color: Headlines, CTAs, accents
- Accent color: Secondary calls-to-action
- Neutral: Body text, backgrounds

## Performance Optimization

### Image Optimization

Before adding images:
1. Compress with TinyPNG or ImageOptim
2. Convert to WebP format for better compression
3. Keep under 200KB for web images

### Caching Headers

Already configured in `.htaccess` for traditional hosting:
```apache
ExpiresByType image/jpeg "access plus 1 year"
ExpiresByType text/css "access plus 1 year"
ExpiresByType application/javascript "access plus 1 year"
```

### GZIP Compression

Already enabled in `.htaccess`.

## Security Configuration

### Content Security Policy

Update in `.htaccess` (around line 50):
```apache
Header always set Content-Security-Policy "default-src 'self'; ..."
```

### HTTPS Enforcement

Already configured in `.htaccess`:
```apache
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

## Mobile Configuration

### Responsive Meta Tag
Already configured:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

### Theme Color
```html
<meta name="theme-color" content="#0a0e27">
```

Update to your primary color.

## Social Media Links

Update in footer (index.html, lines 510-520):

```html
<a href="https://twitter.com/yourhandle" title="Twitter">𝕏</a>
<a href="https://github.com/yourname" title="GitHub">◆</a>
<a href="https://discord.gg/yourserver" title="Discord">💬</a>
```

## Tool-Specific Configuration

See `TOOLS_GUIDE.md` for:
- Adding new tools
- Creating tool sections
- Managing tool roadmap
- Tool development checklist

## Quick Customization Checklist

- [ ] Update site title and meta tags
- [ ] Change domain references to ciphertools.net
- [ ] Update brand colors
- [ ] Add logo and favicon
- [ ] Update contact email and social links
- [ ] Set up analytics (Google Analytics or alternative)
- [ ] Configure contact form (Formspree or backend)
- [ ] Add Open Graph meta tags
- [ ] Update sitemap.xml with real domain
- [ ] Update robots.txt with real domain
- [ ] Test on multiple browsers
- [ ] Test responsive design on mobile
- [ ] Set up SSL certificate
- [ ] Deploy to hosting

## Testing Configuration

### Validate HTML
```bash
# Online: https://validator.w3.org
# Upload your index.html to check for errors
```

### Check SEO
```bash
# Online: https://pagespeed.web.dev
# Paste your domain to check performance
```

### Test Forms
- Click contact form
- Fill and submit
- Verify email received
- Check form data in analytics

## Logging & Monitoring

### Enable Server Logs
- Track 404 errors
- Monitor traffic
- Find security issues
- Identify slow pages

### Set Up Monitoring
- Uptime Robot (free) - Monitor site availability
- Google Search Console - Track search performance
- Google Analytics - User behavior

## Troubleshooting

### Links Not Working
- Check domain in all URLs
- Verify anchor IDs match links
- Test in different browsers

### Images Not Showing
- Check file paths are correct
- Verify image files exist
- Check file permissions

### Styles Not Applied
- Hard refresh browser (Ctrl+Shift+R)
- Check CSS file path in HTML
- Verify CSS file exists

## Documentation Files to Update

When customizing, update these files:
- `README.md` - General information
- `TOOLS_GUIDE.md` - Tool expansion details
- `QUICKSTART.md` - Getting started guide
- `DEPLOYMENT.md` - Deployment instructions

---

**Configuration Complete!** Your CipherTools platform is ready to customize and expand.

For questions, refer to specific guides:
- Tools: See `TOOLS_GUIDE.md`
- Deployment: See `DEPLOYMENT.md`
- Getting Started: See `QUICKSTART.md`
