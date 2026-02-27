import { cpSync, rmSync, mkdirSync, existsSync } from 'fs';

// Clean and recreate main/
if (existsSync('main')) rmSync('main', { recursive: true, force: true });
mkdirSync('main', { recursive: true });
mkdirSync('main/css', { recursive: true });
mkdirSync('main/js', { recursive: true });
mkdirSync('main/pages', { recursive: true });

// HTML pages
const htmlFiles = [
  'index.html', 'about.html', 'contact.html', 'pricing.html', 'comparison.html', 'topup.html',
  'login.html', 'signup.html', 'account.html', 'account-settings.html',
  'roadmap.html', 'SVART.html', 'tools.html',
  'website-security.html', 'eula.html', 'tools-template.html', 'admin.html',
  'forgot-password.html'
];
for (const f of htmlFiles) {
  if (existsSync(f)) cpSync(f, `main/${f}`);
}

// CSS
if (existsSync('css/style.css')) cpSync('css/style.css', 'main/css/style.css');

// JS
if (existsSync('js/script.js')) cpSync('js/script.js', 'main/js/script.js');

// Pages
if (existsSync('pages')) cpSync('pages', 'main/pages', { recursive: true });

// Config files
for (const f of ['robots.txt', 'sitemap.xml', '_headers', '_redirects']) {
  if (existsSync(f)) cpSync(f, `main/${f}`);
}

console.log('Build complete! Output directory: main/');
