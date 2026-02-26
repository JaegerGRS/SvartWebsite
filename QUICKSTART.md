# CIPHER Website - Quick Start Guide

Get your website running in 5 minutes.

## 1. Local Preview (Fastest) — VS Code Only

> **Important:** All local development must be done through Visual Studio Code. No other local server method is supported.

### VS Code Live Server (Required)
1. Open the project folder in **Visual Studio Code**
2. Install the **"Live Server"** extension by Ritwick Dey (if not already installed)
3. Right-click `index.html`
4. Click **"Open with Live Server"**
5. Browser opens automatically at `http://127.0.0.1:5500`

No Python, Node.js, or external servers needed.

## 2. Customization (10 minutes)

### Change Colors
Edit `css/style.css` line 15-22:
```css
:root {
    --primary: #00ff88;      /* Change to your brand color */
    --primary-dark: #00cc6a;
    --accent: #00d4ff;
    /* ... other colors ... */
}
```

### Update Content
Edit `index.html`:

**Hero Title (line 52):**
```html
<h1 class="hero-title">
    <span class="cipher-logo-large">◆</span>
    <br>
    YOUR BROWSER NAME
</h1>
```

**Hero Description (line 58):**
```html
<p class="hero-description">
    Your tagline here
</p>
```

**Features (line 86-114):**
```html
<div class="feature-card">
    <div class="feature-icon">🔒</div>
    <h3>Feature Title</h3>
    <p>Feature description here</p>
</div>
```

**Contact Email (line 344):**
```html
<p><a href="mailto:your-email@example.com">your-email@example.com</a></p>
```

### Add Your Logo
1. Create `assets/` folder
2. Add your logo file (e.g., `logo.png`)
3. Replace favicon in `<head>`:
```html
<link rel="icon" type="image/png" href="assets/logo.png">
```

## 3. Deploy (5 minutes)

### Free Hosting: GitHub Pages

1. **Create GitHub Account** (if you don't have one)
   - Go to github.com
   - Sign up

2. **Create Repository**
   - Click "+" → "New repository"
   - Name: `cipher-website`
   - Make it public
   - Click "Create repository"

3. **Upload Files**
   - Click "Add file" → "Upload files"
   - Drag and drop entire `cipher-website` folder contents
   - Commit changes

4. **Enable GitHub Pages**
   - Go to Settings
   - Scroll to "GitHub Pages"
   - Select branch: `main`
   - Select folder: `/ (root)`
   - Save

5. **Your site is live!**
   - URL: `https://yourusername.github.io/cipher-website`
   - Share this link

## 4. Setup Custom Domain (Optional)

1. **Buy a domain**
   - Go to namecheap.com or similar
   - Search for your domain
   - Purchase and note nameservers

2. **Connect Domain to GitHub**
   - In GitHub: Settings → Pages
   - Under "Custom domain" enter: `yourdomain.com`
   - GitHub creates CNAME file

3. **Update DNS**
   - Log in to your domain registrar
   - Point nameservers to GitHub's nameservers
   - Wait 24-48 hours for propagation

4. **Site now at**
   - `https://yourdomain.com`

## 5. Analytics (Optional)

### Google Analytics
1. Go to google.com/analytics
2. Create new property
3. Copy tracking code
4. Paste in `index.html` `<head>`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_ID');
</script>
```

## File Structure

```
cipher-website/
├── index.html          ← Main page (edit content here)
├── css/
│   └── style.css      ← Colors and styling (edit colors here)
├── js/
│   └── script.js      ← Interactions (usually don't edit)
├── assets/            ← Add your images, logos here
├── docs/              ← Add PDFs, guides here
├── package.json       ← Project info
├── README.md          ← Documentation
├── .htaccess          ← Server config
├── robots.txt         ← SEO robots
└── sitemap.xml        ← Site map for Google
```

## Common Customizations

### Change Hero Image/Background
Replace linear-gradient in `css/style.css` (line 227-230):
```css
.hero {
    background: url('assets/background.jpg') center/cover;
}
```

### Add New Section
1. Copy template:
```html
<section id="section-name" class="section-name">
    <div class="container">
        <h2 class="section-title">Title</h2>
        <p class="section-subtitle">Subtitle</p>
        <!-- Content here -->
    </div>
</section>
```

2. Add CSS styling in `css/style.css`:
```css
.section-name {
    padding: 100px 20px;
    background: linear-gradient(135deg, rgba(0, 255, 136, 0.05) 0%, ...);
}
```

3. Add navigation link in navbar:
```html
<li><a href="#section-name">Section Name</a></li>
```

### Change Button Styling
Edit `css/style.css` `.btn-primary`:
```css
.btn-primary {
    background: your-color;
    color: text-color;
}
```

### Add Team Members Section
Create new section with team cards:
```html
<section id="team" class="team">
    <div class="container">
        <h2 class="section-title">Our Team</h2>
        <div class="team-grid">
            <div class="team-card">
                <img src="assets/person.jpg" alt="Name">
                <h3>Name</h3>
                <p>Role</p>
            </div>
        </div>
    </div>
</section>
```

## Testing Checklist

- [ ] Site loads without errors
- [ ] All links work
- [ ] Contact form responds
- [ ] Mobile view looks good
- [ ] Images load properly
- [ ] Colors match brand
- [ ] Text is readable
- [ ] No broken links

## Performance Tips

1. **Optimize images** (compress before uploading)
2. **Keep CSS/JS minimal** (remove unused code)
3. **Use lazy loading** for images
4. **Enable caching** (set in .htaccess)
5. **Minify code** (optional, for advanced users)

## Troubleshooting

### Site won't load
- Check file paths are correct
- Verify HTML has no syntax errors
- Clear browser cache (Ctrl+Shift+Delete)

### CSS not applying
- Hard refresh: Ctrl+Shift+R
- Check CSS path in HTML
- Verify style.css is in `css/` folder

### Images not showing
- Check image file exists in correct folder
- Verify path in HTML:
  - ✅ `assets/image.jpg`
  - ❌ `Assets/image.jpg` (case-sensitive on some servers)

### Contact form not working
- Form sends email to placeholder email
- Set up Formspree or Netlify for real email
- See DEPLOYMENT.md for details

## Get Help

- [HTML Validator](https://validator.w3.org)
- [CSS Validator](https://jigsaw.w3.org/css-validator)
- [GitHub Issues](https://github.com/cipher-browser/issues)
- [Stack Overflow](https://stackoverflow.com)

## Next Steps

1. ✅ Customize content
2. ✅ Test locally
3. ✅ Deploy to GitHub Pages
4. ✅ Set up custom domain
5. ✅ Add analytics
6. ✅ Promote on social media

---

**Questions?** See README.md for more details.

**Ready?** Follow steps 1-3 above and you're done!
