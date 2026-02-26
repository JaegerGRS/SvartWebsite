# CipherTools - Quick Reference for Developers

Fast reference guide for common tasks when expanding the platform.

## Adding a New Tool (5-Step Process)

### Step 1: Create Tool Card (5 minutes)
Edit `index.html` in the `tools-grid` div:

```html
<div class="tool-card tool-coming">  <!-- use "tool-featured" for active tools -->
    <div class="tool-badge badge-coming">Status</div>
    <div class="tool-icon">🔧</div>
    <h3>Tool Name</h3>
    <p class="tool-category">Category</p>
    <p class="tool-description">Short description (1-2 sentences)</p>
    <div class="tool-specs">
        <span class="spec-item">✓ Feature 1</span>
        <span class="spec-item">✓ Feature 2</span>
        <span class="spec-item">✓ Feature 3</span>
    </div>
    <a href="#tool-id" class="btn btn-primary">Learn More</a>
</div>
```

### Step 2: Add Navigation Link (1 minute)
Edit navbar in `index.html` (around line 22):

```html
<li><a href="#tool-id">Tool Name</a></li>
```

### Step 3: Create Full Tool Section (15 minutes)
Copy `tools-template.html` content and customize:

```html
<section id="tool-id" class="tool-details">
    <div class="container">
        <!-- Use tools-template.html as guide -->
    </div>
</section>
```

Insert after CIPHER Browser section in `index.html`.

### Step 4: Update SEO & Sitemap (2 minutes)
Edit `sitemap.xml`:

```xml
<url>
    <loc>https://ciphertools.net/#tool-id</loc>
    <lastmod>2026-01-01T00:00:00+00:00</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.85</priority>
</url>
```

### Step 5: Test & Deploy (3 minutes)
```bash
# Test locally
python -m http.server 8000

# Check links work
# Test on mobile

# Push to GitHub/Netlify
git add .
git commit -m "Add Tool Name to tools platform"
git push
```

**Total Time: ~30 minutes**

## File Reference Quick Links

| Task | File | Lines |
|------|------|-------|
| Add tool card | index.html | 80-200 |
| Update nav | index.html | 18-27 |
| Create tool details | tools-template.html | Full file |
| Update SEO | sitemap.xml | All URLs |
| Add nav link | index.html | 22 |
| Customize colors | css/style.css | 15-22 |
| Add analytics | index.html | <head> |
| Contact form | index.html | 405+ |

## CSS Classes Reference

```css
/* Tool Cards */
.tool-card           /* Main card container */
.tool-featured       /* For active/featured tools */
.tool-coming         /* For coming soon tools */
.tool-card:hover     /* Hover effect */

/* Sections */
.tool-details        /* Full tool section */
.tool-overview       /* Overview section */
.tool-cta            /* Call-to-action area */
.features            /* Features section */
.security            /* Security section */

/* Elements */
.tool-badge          /* Status badge */
.tool-icon           /* Icon (emoji) */
.tool-category       /* Category label */
.tool-specs          /* Feature list */
.spec-item           /* Individual spec */

/* Buttons */
.btn                 /* Base button */
.btn-primary         /* Primary action */
.btn-secondary       /* Secondary action */
.btn-download        /* Download button */

/* Text Styles */
.section-title       /* H2 title */
.section-subtitle    /* Subtitle */
.feature-badge       /* Small feature badge */
```

## Color Variables

Edit in `css/style.css` line 15-22:

```css
--primary: #00ff88;          /* Main brand color */
--primary-dark: #00cc6a;     /* Darker shade */
--accent: #00d4ff;           /* Secondary color */
--bg-dark: #0a0e27;          /* Dark background */
--text-light: #e8f0fe;       /* Light text */
--text-muted: #9ca3af;       /* Muted text */
--border-color: #1f2937;     /* Borders */
--success: #00ff88;          /* Success color */
--danger: #ff4444;           /* Error color */
```

## Common Customizations

### Change Primary Color
```css
/* In css/style.css */
:root {
    --primary: #YOURCOLOR;      /* Change here */
    --primary-dark: #YOURCOLORDARKER;
    --accent: #YOURCOLOR2;
}
```

### Add New Section
```html
<section id="section-id" class="section-name">
    <div class="container">
        <h2 class="section-title">Title</h2>
        <p class="section-subtitle">Subtitle</p>
        <!-- Content -->
    </div>
</section>
```

### Update Tool Status
```html
<!-- Change from: -->
<div class="tool-badge badge-coming">Coming Soon</div>

<!-- To: (for launch) -->
<div class="tool-badge">Featured</div>

<!-- And update button: -->
<!-- From: -->
<button class="btn btn-secondary" disabled>Coming Soon</button>

<!-- To: -->
<a href="#tool-id" class="btn btn-primary">Download</a>
```

## Status Values

```html
<div class="tool-badge">Featured</div>              <!-- Current/active tool -->
<div class="tool-badge badge-coming">Coming Soon</div>       <!-- Launching 1-2 months -->
<div class="tool-badge badge-coming">In Development</div>    <!-- Active development -->
<div class="tool-badge badge-coming">Planned</div>           <!-- Future roadmap -->
```

## Tool Categories

```
Web Browsing         🔐
Password Security    🔑
Email Privacy        📧
Data Protection      📁
Privacy Audit        🔍
Network Privacy      🛡️
File Encryption      📄
Communication        💬
Anonymity            👤
Authentication       🔑
Identity             👥
Productivity         📊
Backup               💾
Health/Wellness      🏥
Finance              💰
```

## Responsive Design Breakpoints

```css
/* Desktop: 1024px+ */
.feature-card { grid-template-columns: repeat(3, 1fr); }

/* Tablet: 768px - 1024px */
@media (max-width: 1024px) {
    .feature-card { grid-template-columns: repeat(2, 1fr); }
}

/* Mobile: < 768px */
@media (max-width: 768px) {
    .feature-card { grid-template-columns: 1fr; }
}
```

## Useful npm Commands

```bash
# Start local server
npm start

# Build (static site)
npm run build

# Lint HTML
npm run lint:html

# Lint CSS
npm run lint:css

# Lint JavaScript
npm run lint:js

# Deploy
npm run deploy
```

## Search & Replace Shortcuts

### Update All Instances
In VS Code:
1. Press `Ctrl+H` (Find & Replace)
2. Enter search term
3. Enter replacement
4. Click "Replace All"

Common replacements:
- `CIPHER` → Your brand name
- `cipher.dev` → `ciphertools.net`
- `#FF0000` → Your color

## File Size Guidelines

Keep performance high:

```
index.html      < 50KB     ✅ (~30KB current)
css/style.css   < 50KB     ✅ (~20KB current)
js/script.js    < 30KB     ✅ (~10KB current)
Images          < 100KB    ✅
Total page      < 200KB    ✅
```

## Testing Checklist

Before deploying new tool:

```
Functionality:
- [ ] All links work
- [ ] Forms submit
- [ ] Download links valid
- [ ] Navigation works

Design:
- [ ] Looks good on mobile
- [ ] Looks good on tablet
- [ ] Looks good on desktop
- [ ] Colors match brand
- [ ] Icons display correctly

SEO:
- [ ] Meta tags present
- [ ] Heading hierarchy correct (H1, H2, H3)
- [ ] Images have alt text
- [ ] URL is descriptive

Performance:
- [ ] Page loads < 2 seconds
- [ ] No console errors
- [ ] Lighthouse score 90+
```

## Git Workflow

```bash
# Create feature branch
git checkout -b add-password-manager

# Make changes
# Edit files...

# Commit changes
git add .
git commit -m "Add Password Manager tool to platform"

# Push to GitHub
git push origin add-password-manager

# Create Pull Request (if using GitHub)
# Or merge directly if solo development

git checkout main
git merge add-password-manager
git push origin main
```

## Debugging

### Links Not Working
```html
<!-- Check 1: ID exists -->
<section id="tool-id">       <!-- Make sure this exists -->

<!-- Check 2: Link is correct -->
<a href="#tool-id">          <!-- Must match section ID -->

<!-- Check 3: Navigation updated -->
<li><a href="#tool-id">...</li>  <!-- Should be in navbar -->
```

### Styles Not Applied
```css
/* Check 1: CSS file linked -->
<link rel="stylesheet" href="css/style.css">

/* Check 2: Browser cache -->
Ctrl+Shift+Delete (Clear cache)
Ctrl+Shift+R (Hard refresh)

/* Check 3: Class names correct -->
class="tool-card"   <!-- May be misspelled -->
class="tool Card"   <!-- Space = wrong -->
```

### Images Not Showing
```html
<!-- Check 1: File exists -->
assets/image.jpg

<!-- Check 2: Path is correct -->
src="assets/image.jpg"  <!-- Correct -->
src="Assets/image.jpg"  <!-- Wrong (case) -->

<!-- Check 3: File is accessible -->
Check browser console for 404 errors
```

## Performance Tips

1. **Compress images** - Use TinyPNG
2. **Use WebP** - Better compression
3. **Minimize CSS** - Remove unused styles
4. **Lazy load** - Load images on scroll
5. **Cache static** - Browser caching headers
6. **CDN** - Use Netlify/Vercel CDN

## Useful Tools

| Task | Tool |
|------|------|
| Design | Figma, Adobe XD |
| Colors | Coolors.co, ColorHunt |
| Images | Pexels, Unsplash, Pixabay |
| Icons | Emoji, FontAwesome |
| Optimization | TinyPNG, ImageOptim |
| Validation | W3C Validator |
| Performance | Google Lighthouse |
| Analytics | Google Analytics, Plausible |
| Hosting | Netlify, Vercel, GitHub Pages |

## Documentation References

| Need | File |
|------|------|
| Full tool guide | TOOLS_GUIDE.md |
| Configuration | CONFIG.md |
| Deployment | DEPLOYMENT.md |
| Quick start | QUICKSTART.md |
| Roadmap | ROADMAP.md |
| Overview | README.md |
| Tool template | tools-template.html |

## Contact & Support

Need help? Check these:
1. README.md - Overview
2. TOOLS_GUIDE.md - Adding tools
3. CONFIG.md - Configuration
4. QUICKSTART.md - Getting started
5. GitHub Issues - Bug reports
6. hello@cipher.dev - Support email

## Pro Tips

1. **Keep naming consistent** - Use hyphens in IDs (tool-id not toolId)
2. **Update multiple files** - Don't forget sitemap & favicon
3. **Test locally first** - Use `http-server` or Live Server
4. **Use semantic HTML** - Better for SEO and accessibility
5. **Comment your code** - Future you will thank you
6. **Keep file sizes small** - Faster loading = better UX
7. **Mobile-first design** - Design for small screens first

---

**Quick Question?** Check the section matching your task above, or see detailed guides in the documentation files.

Last Updated: February 2026
