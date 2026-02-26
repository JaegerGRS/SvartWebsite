# CIPHER Website - Deployment Guide

Complete instructions for deploying your CIPHER promotional website to production.

## Pre-Deployment Checklist

### Content & Branding
- [ ] Update all hero and feature descriptions
- [ ] Customize colors to match your brand
- [ ] Add your logo and favicon
- [ ] Update contact email and social links
- [ ] Write custom About section
- [ ] Update download links to real URLs
- [ ] Verify all external links work
- [ ] Check spelling and grammar

### Technical
- [ ] Test on Chrome, Firefox, Safari
- [ ] Test on mobile devices
- [ ] Run Google Lighthouse audit
- [ ] Test contact form submission
- [ ] Verify analytics integration (if used)
- [ ] Test email links (mailto:)
- [ ] Test social media links
- [ ] Verify SEO tags are present

### Performance
- [ ] Optimize images (use WebP format)
- [ ] Minify CSS and JavaScript (optional)
- [ ] Test page load speed (WebPageTest)
- [ ] Set up caching headers
- [ ] Enable GZIP compression

### Security
- [ ] Set up HTTPS (SSL certificate)
- [ ] Review .htaccess file
- [ ] Set security headers
- [ ] Test robots.txt
- [ ] Verify sensitive files are blocked

## Deployment Options

### Option 1: GitHub Pages (FREE, RECOMMENDED FOR BEGINNERS)

**Best for: Quick launch, zero cost**

1. Create GitHub account if you don't have one
2. Create new repository: `cipher-website`
3. Upload all files to repository
4. Go to Settings → Pages
5. Select "Deploy from a branch"
6. Choose `main` branch and `/root` folder
7. Wait 2-3 minutes for deployment
8. Your site is live at: `https://yourusername.github.io/cipher-website`

Optional: Point custom domain
- Buy domain from registrar (Namecheap, GoDaddy)
- In GitHub Settings → Pages → Custom domain
- Add CNAME record at registrar pointing to `yourusername.github.io`

### Option 2: Netlify (FREE WITH OPTIONAL PAID UPGRADES)

**Best for: Easy deployments, CDN, better performance**

1. Go to netlify.com
2. Click "Add new site" → "Deploy manually"
3. Drag and drop `cipher-website` folder
4. Site deployed instantly with random URL
5. Optional: Connect to GitHub for auto-deployments

Connect Custom Domain:
1. Buy domain
2. In Netlify: Domain settings → Add a domain
3. Update nameservers at registrar to Netlify's
4. HTTPS enabled automatically

### Option 3: Vercel (FREE TIER)

**Best for: Developers, CI/CD integration**

1. Go to vercel.com
2. Create account (link GitHub)
3. Import repository
4. Click Deploy
5. Live at `cipher-website.vercel.app`

Auto-deploys: Every push to GitHub automatically deploys

### Option 4: Traditional Shared Hosting

**Best for: Budget hosting, maximum control**

Popular Providers:
- Bluehost - $2.95/month
- HostGator - $2.75/month
- GoDaddy - $3.99/month
- Namecheap - $1.44/month

Steps:
1. Sign up for web hosting
2. FTP/SFTP files to `public_html` folder
3. Use .htaccess for redirects and headers
4. Enable SSL certificate (usually free)
5. Point domain to hosting

### Option 5: AWS/Azure/Google Cloud

**Best for: Large scale, professional setup**

AWS S3 + CloudFront:
```bash
# Upload to S3
aws s3 sync . s3://cipher-website/

# Set up CloudFront for CDN
# Enable Gzip compression
# Set cache policies
# Add SSL certificate from ACM
```

### Option 6: Docker Deployment

**Best for: Containerized hosting**

1. Create `Dockerfile`:
```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html/
COPY ./.htaccess /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

2. Build and deploy:
```bash
docker build -t cipher-website .
docker run -p 80:80 cipher-website
```

Hosts supporting Docker:
- Google Cloud Run
- AWS ECS/Fargate
- Azure Container Instances
- DigitalOcean App Platform

## Domain Setup

### Purchase Domain
1. Popular registrars:
   - Namecheap.com
   - GoDaddy.com
   - Domain.com
   - Google Domains

2. Search for available domains:
   - cipher.dev
   - cipher-browser.com
   - cipher-security.org

### DNS Configuration

**For GitHub Pages:**
```
Type: CNAME
Name: @
Value: yourusername.github.io
TTL: 3600
```

**For Netlify:**
```
Type: NS (Nameserver)
Use Netlify's nameservers
(provided in Netlify dashboard)
```

**For Traditional Hosting:**
```
Type: A
Name: @
Value: Your hosting IP address
TTL: 3600
```

### HTTPS Setup

**GitHub Pages/Netlify/Vercel:**
✅ Automatic - no setup needed

**Traditional Hosting:**
1. Generate SSL certificate (Let's Encrypt free)
2. Install on server
3. Update .htaccess to redirect HTTP → HTTPS

## Performance Optimization

### Image Optimization
```bash
# Convert to WebP format for better compression
# Using ImageMagick:
convert image.jpg -quality 80 image.webp

# Use in HTML:
<picture>
    <source srcset="image.webp" type="image/webp">
    <img src="image.jpg" alt="Description">
</picture>
```

### CSS/JS Minification (Optional)
```bash
# Using npm tools:
npm install -g cssnano-cli terser

# Minify CSS:
cssnano css/style.css > css/style.min.css

# Minify JS:
terser js/script.js > js/script.min.js
```

### Enable Caching
**Netlify:** Automatic
**GitHub Pages:** Set up Cache-Control headers
**Traditional:** Use .htaccess (included)

## Analytics Setup

### Google Analytics 4
1. Create free account: google.com/analytics
2. Add property for your domain
3. Copy tracking code to `<head>`
4. Wait 24h for data to appear

### Plausible Analytics (Privacy-First)
1. Sign up: plausible.io
2. Add domain
3. Copy script tag to `<head>`
4. More privacy-focused than Google

### Fathom Analytics
1. Lightweight alternative
2. GDPR compliant
3. Copy 1-line script

## Email Setup

### Contact Form Processing

Option 1: Formspree (FREE)
```html
<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
    <input type="email" name="email" required>
    <textarea name="message" required></textarea>
    <button type="submit">Send</button>
</form>
```

Option 2: Netlify Forms (if hosting on Netlify)
```html
<form name="contact" method="POST" netlify>
    <input type="text" name="name" required>
    <input type="email" name="email" required>
    <textarea name="message" required></textarea>
    <button type="submit">Send</button>
</form>
```

Option 3: SendGrid (Programmatic)
```javascript
// Send form data to your server
// Server calls SendGrid API
// Email sent to admin
```

## SSL Certificate Setup

### Let's Encrypt (FREE)
```bash
# Using Certbot:
sudo certbot certonly --webroot -w /var/www/cipher-website -d cipher.dev

# Auto-renew:
sudo certbot renew --dry-run
```

### Shared Hosting
- Usually 1-click SSL in control panel
- Or contact support for setup
- Many offer free Let's Encrypt certs

## Monitoring & Maintenance

### Set Up Monitoring
- **Uptime Robot** (free): Monitor site availability
- **Website Monitoring**: Check 24/7 if site is up
- **Alerts**: Get notified of downtime

### Regular Backups
```bash
# Manual backup:
zip -r cipher-website-backup.zip .

# Automated (on most hosts):
Enable in control panel
```

### Log Monitoring
- Check access logs for 404 errors
- Monitor for security threats
- Track crawlers and bots

### Content Updates
- Update documentation regularly
- Refresh "Latest News" section
- Add blog posts periodically

## Troubleshooting

### Site Not Found
- [ ] Domain DNS properly configured?
- [ ] Check name propagation: domain.com tools
- [ ] Wait 24-48 hours for DNS to propagate

### 404 Errors
- [ ] Check .htaccess file
- [ ] Verify file paths are correct
- [ ] Check server URL rewrite rules

### HTTPS Not Working
- [ ] Ensure certificate is installed
- [ ] Check .htaccess redirects
- [ ] Clear browser cache

### Slow Performance
- [ ] Optimize images
- [ ] Enable GZIP compression
- [ ] Check file sizes
- [ ] Use Google Lighthouse

## Post-Launch

### Promotion
1. Share on social media
2. Submit to directories
3. Get links from other sites (SEO)
4. Write blog posts
5. Email subscribers

### Monitoring
1. Check analytics daily
2. Track user engagement
3. Monitor bounce rate
4. Test conversions
5. Get user feedback

### Iteration
1. Update content based on feedback
2. Fix bugs and issues
3. Improve underperforming sections
4. Add new features
5. Keep documentation current

## Support

- **Netlify Support**: support.netlify.com
- **GitHub Help**: docs.github.com
- **Stack Overflow**: stackoverflow.com
- **Server Forums**: Community forums for your host

---

**Quick Links:**
- [GitHub Pages Docs](https://docs.github.com/en/pages)
- [Netlify Deploy Guide](https://docs.netlify.com/site-deploys/gits/overview/)
- [Vercel Deployment](https://vercel.com/docs)
- [Let's Encrypt](https://letsencrypt.org)
- [Google Lighthouse](https://pagespeed.web.dev/)

**Ready to deploy?** Choose your option above and follow the steps!
