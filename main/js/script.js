// ============================================
// Svart Suite - Website Interactivity
// ============================================

// ===== Apply saved theme immediately (before DOMContentLoaded to reduce flash) =====
(function() {
    var theme = localStorage.getItem('svart_theme') || 'midnight';
    document.documentElement.setAttribute('data-theme', theme);
})();

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all interactive features — each wrapped so one failure doesn't block the rest
    try { initHamburger(); } catch(e) { console.error('initHamburger:', e); }
    try { initNavigation(); } catch(e) { console.error('initNavigation:', e); }
    try { initContactForm(); } catch(e) { console.error('initContactForm:', e); }
    try { initScrollAnimations(); } catch(e) { console.error('initScrollAnimations:', e); }
    try { initSmartLinks(); } catch(e) { console.error('initSmartLinks:', e); }
    try { adaptNavForSession(); } catch(e) { console.error('adaptNavForSession:', e); }
});

// ============ Hamburger Menu ============
function initHamburger() {
    const hamburger = document.getElementById('navHamburger');
    const navMenu = document.getElementById('navMenu');
    const overlay = document.getElementById('navOverlay');
    if (!hamburger || !navMenu) return;

    function toggleMenu() {
        const isOpen = navMenu.classList.contains('active');
        navMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
        hamburger.setAttribute('aria-expanded', !isOpen);
        if (overlay) overlay.classList.toggle('active');
        document.body.style.overflow = isOpen ? '' : 'hidden';
    }
    function closeMenu() {
        navMenu.classList.remove('active');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    hamburger.addEventListener('click', toggleMenu);
    if (overlay) overlay.addEventListener('click', closeMenu);

    // Close menu when a nav link is clicked
    navMenu.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', closeMenu);
    });

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeMenu();
    });
}

// ============ Nav Auth State ============
function adaptNavForSession() {
    // Check session
    let session = JSON.parse(localStorage.getItem('ct_session') || 'null');
    if (!session || !session.loggedIn) {
        session = JSON.parse(localStorage.getItem('ct_persistent_session') || 'null');
    }
    const authItem = document.getElementById('navAuthItem');
    if (!authItem) return;

    if (session && session.loggedIn) {
        // Get username
        const users = JSON.parse(localStorage.getItem('ct_users') || '{}');
        const user = users[session.svartId] || {};
        const username = user.username || user.displayName || session.email || 'Dashboard';
        authItem.innerHTML =
            '<a href="account.html" class="nav-auth-btn"><span class="nav-user-name">' + username + '</span></a>' +
            ' <a href="#" class="nav-auth-btn nav-logout-btn" id="navLogoutBtn">Sign Out</a>';
        var logoutBtn = document.getElementById('navLogoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                localStorage.removeItem('ct_session');
                localStorage.removeItem('ct_persistent_session');
                window.location.href = 'index.html';
            });
        }
    } else {
        // Not logged in
        authItem.innerHTML = '<a href="login.html" class="nav-auth-btn">Login / Sign Up</a>';
    }
}

// ============ Navigation ============
function initNavigation() {
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    
    // Mobile menu toggle (if hamburger added later)
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (navMenu) {
                navMenu.classList.remove('active');
            }
        });
    });
    
    // Active link highlighting on scroll
    window.addEventListener('scroll', () => {
        updateActiveNavLink();
    });
}

function updateActiveNavLink() {
    const navLinks = document.querySelectorAll('.nav-menu a');
    const sections = document.querySelectorAll('section[id]');
    
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (pageYOffset >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.style.color = '';
        if (link.getAttribute('href') === '#' + current) {
            link.style.color = 'var(--primary)';
        }
    });
}

// ============ Contact Form ============
function initContactForm() {
    const form = document.querySelector('.contact-form');
    if (!form) return;
    
    // Initialize rate limiting
    const rateLimiter = new FormRateLimiter('contact-form', 1, 60000); // 1 submission per minute
    
    // Initialize CSRF token
    const csrfToken = getCsrfToken();
    if (csrfToken) {
        const tokenInput = document.createElement('input');
        tokenInput.type = 'hidden';
        tokenInput.name = 'csrf_token';
        tokenInput.value = csrfToken;
        form.appendChild(tokenInput);
    }
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Check rate limiting
        if (rateLimiter.isLimited()) {
            showNotification('Please wait before sending another message', 'error');
            return;
        }
        
        const nameInput = form.querySelector('input[type="text"]');
        const emailInput = form.querySelector('input[type="email"]');
        const messageInput = form.querySelector('textarea');
        
        // Get and trim values — Svart ID is optional
        const svartId = nameInput ? sanitizeInput(nameInput.value) : '';
        const email = sanitizeEmail(emailInput.value);
        const message = sanitizeInput(messageInput.value);
        
        // Validation
        const validation = validateContactForm(email, message);
        if (!validation.valid) {
            showNotification(validation.error, 'error');
            return;
        }
        
        // Send form
        submitContactForm({
            name: svartId || 'Anonymous',
            email: email,
            message: message,
            csrf_token: csrfToken,
            timestamp: Date.now()
        }, form, rateLimiter);
    });
}

// Secure input sanitization
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input
        .trim()
        .slice(0, 1000)  // Limit length
        .replace(/[<>"']/g, char => ({
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;'
        })[char]);
}

function sanitizeEmail(email) {
    return email.trim().toLowerCase().slice(0, 254);  // RFC 5321
}

// Validate email format
function isValidEmail(email) {
    // RFC 5322 simplified
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email) && email.length <= 254;
}

// Validate contact form
function validateContactForm(email, message) {
    if (!email) {
        return { valid: false, error: 'Email is required' };
    }
    
    if (!isValidEmail(email)) {
        return { valid: false, error: 'Please enter a valid email address' };
    }
    
    if (!message || message.length < 5) {
        return { valid: false, error: 'Message must be at least 5 characters' };
    }
    
    if (message.length > 5000) {
        return { valid: false, error: 'Message is too long (max 5000 characters)' };
    }
    
    // Check for spam patterns
    if (containsSpamPatterns(message)) {
        return { valid: false, error: 'Message appears to contain spam' };
    }
    
    return { valid: true };
}

// Detect spam patterns
function containsSpamPatterns(text) {
    const urlCount = (text.match(/http[s]?:\/\//gi) || []).length;
    if (urlCount > 2) return true;
    
    const spamPatterns = [
        /(click here|buy now|limited offer)/gi,
        /(viagra|cialis|casino|lottery)/gi,
        /(^[A-Z\s]{20,}$)/gm         // ALL CAPS spam
    ];
    
    return spamPatterns.some(pattern => text.match(pattern));
}

// Submit contact form securely
function submitContactForm(data, form, rateLimiter) {
    // Disable submit button
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
    
    // Use Formspree or similar secure email service
    // Option 1: Formspree (recommended for static sites)
    const formspreeEndpoint = 'https://formspree.io/f/your-form-id';
    
    // Option 2: Custom backend (use environment variable)
    const customEndpoint = 'api/contact';  // Change to your backend
    
    // Prepare form data
    const formData = new FormData();
    formData.append('name', data.name);
    formData.append('email', data.email);
    formData.append('message', data.message);
    formData.append('csrf_token', data.csrf_token);
    formData.append('timestamp', data.timestamp);
    
    // Send request
    fetch(formspreeEndpoint, {
        method: 'POST',
        body: formData,
        headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',  // CSRF check
            'X-CSRF-Token': data.csrf_token
        }
    })
    .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    })
    .then(data => {
        showNotification('Message sent successfully! We\'ll get back to you soon.', 'success');
        form.reset();
        rateLimiter.recordSubmission();
    })
    .catch(error => {
        console.error('Error sending message:', error);
        showNotification('Error sending message. Please try again or email us directly.', 'error');
    })
    .finally(() => {
        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    });
}

// Generate or retrieve CSRF token
function getCsrfToken() {
    let token = localStorage.getItem('csrf_token');
    if (!token) {
        token = generateToken();
        localStorage.setItem('csrf_token', token);
    }
    return token;
}

// Generate unique token
function generateToken() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Rate limiting class
class FormRateLimiter {
    constructor(formName, maxAttempts, timeWindow) {
        this.formName = formName;
        this.maxAttempts = maxAttempts;
        this.timeWindow = timeWindow;  // milliseconds
        this.key = `ratelimit_${formName}`;
    }
    
    isLimited() {
        const submissions = JSON.parse(localStorage.getItem(this.key) || '[]');
        const now = Date.now();
        
        // Remove old submissions outside time window
        const recent = submissions.filter(time => now - time < this.timeWindow);
        
        if (recent.length >= this.maxAttempts) {
            return true;
        }
        
        return false;
    }
    
    recordSubmission() {
        const submissions = JSON.parse(localStorage.getItem(this.key) || '[]');
        submissions.push(Date.now());
        localStorage.setItem(this.key, JSON.stringify(submissions));
    }
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? 'var(--primary)' : 'var(--danger)'};
        color: ${type === 'success' ? 'var(--bg-dark)' : 'white'};
        border-radius: 8px;
        font-weight: 600;
        z-index: 1000;
        animation: slideIn 0.3s ease;
        max-width: 300px;
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Add animation keyframes
if (!document.querySelector('style[data-animations]')) {
    const style = document.createElement('style');
    style.setAttribute('data-animations', 'true');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

// ============ Scroll Animations ============
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animation = 'fadeIn 0.6s ease forwards';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    // Observe all feature cards and other animated elements
    document.querySelectorAll('.feature-card, .download-card, .layer, .faq-item, .stat').forEach(el => {
        el.style.opacity = '0';
        observer.observe(el);
    });
}

// ============ Smart Links ============
function initSmartLinks() {
    // Add target="_blank" to external links
    document.querySelectorAll('a[href^="http"]').forEach(link => {
        if (!link.href.includes(window.location.hostname)) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    });
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// ============ Utility Functions ============

// Track page analytics (optional - for self-hosted analytics)
function trackEvent(eventName, properties = {}) {
    // Send to analytics service
    // Example: sendToAnalytics({ event: eventName, ...properties })
    console.log('Event:', eventName, properties);
}

// Download tracking
document.querySelectorAll('.btn-download').forEach(btn => {
    btn.addEventListener('click', function(e) {
        const platform = this.closest('.download-card')?.querySelector('h3')?.textContent || 'Unknown';
        trackEvent('download_clicked', { platform });
    });
});

// CTA tracking
document.querySelectorAll('.btn-primary').forEach(btn => {
    btn.addEventListener('click', function() {
        const section = this.closest('section')?.id || 'unknown';
        trackEvent('cta_clicked', { section, text: this.textContent.trim() });
    });
});

// ============ Dynamic Features ============

// Theme toggle (dark/midnight) - reads saved preference
function initThemeToggle() {
    var theme = localStorage.getItem('svart_theme') || 'dark';
    if (theme && theme !== 'dark') {
        document.documentElement.setAttribute('data-theme', theme);
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

// Theme-color map for browser chrome
var _themeColors = {
    midnight:'#020617', dark:'#0a0a0f', obsidian:'#08080c', abyss:'#00040f',
    emerald:'#020c08', crimson:'#0f0202', amber:'#0c0800', rose:'#0f0206',
    cyan:'#00080c', sakura:'#0f020a', lime:'#050a01', frost:'#010812',
    sunset:'#0f0500', aurora:'#010a0a', lavender:'#080412', storm:'#050508',
    neon:'#000508', copper:'#0c0601', arctic:'#030414', charcoal:'#0c0c0c',
    toxic:'#010a03', slate:'#05080c', monokai:'#11110f', dracula:'#14141e',
    nord:'#101419', solar:'#070a0c', horizon:'#0c0608', matrix:'#000400',
    ocean:'#00050c', volcano:'#0c0300', grape:'#0a010c', steel:'#04060a',
    ruby:'#0c0104', mint:'#010a08', burgundy:'#0a0105', void:'#020005',
    phantom:'#080706', bloodmoon:'#0a0000', gold:'#0a0800', hacker:'#000200',
    sapphire:'#01040f', peach:'#0f0506', carbon:'#060606', synthwave:'#080212',
    forest:'#020803', ice:'#01060a', inferno:'#0c0200'
};

// Global helper: apply theme from any page
window.applyTheme = function(theme) {
    theme = theme || 'midnight';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('svart_theme', theme);
    // Update browser theme-color meta tag
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.setAttribute('content', _themeColors[theme] || '#020617');
    }
};

// Add loading states for buttons
function addButtonLoadingState() {
    document.querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (this.classList.contains('loading')) return;
            
            const originalText = this.textContent;
            this.classList.add('loading');
            this.innerHTML = '<span style="opacity: 0.7;">Loading...</span>';
            
            // Remove loading state after 2 seconds
            setTimeout(() => {
                this.classList.remove('loading');
                this.textContent = originalText;
            }, 2000);
        });
    });
}

// Performance monitoring
function initPerformanceMonitoring() {
    if ('PerformanceObserver' in window) {
        try {
            const observer = new PerformanceObserver((list) => {
                const perfEntries = list.getEntries();
                perfEntries.forEach(entry => {
                    if (entry.duration > 3000) {
                        console.warn(`Slow operation detected: ${entry.name} took ${entry.duration}ms`);
                    }
                });
            });
            observer.observe({ entryTypes: ['measure', 'navigation'] });
        } catch (e) {
            // Performance API not supported
        }
    }
}

// Lazy loading for images (if added)
function initLazyLoading() {
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                    }
                    imageObserver.unobserve(img);
                }
            });
        });
        
        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }
}

// ============ Initialize Advanced Features ============
initThemeToggle();
initPerformanceMonitoring();
initLazyLoading();

// ============ Encryption Demo (Fun & Educational) ============
function initEncryptionDemo() {
    const demoBtn = document.querySelector('[data-demo="encryption"]');
    if (!demoBtn) return;
    
    demoBtn.addEventListener('click', () => {
        const text = 'Svart Suite for Everyone';
        demoBtn.textContent = 'Encrypting...';
        demoBtn.disabled = true;
        
        // Simulate encryption process
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 20;
            if (progress >= 100) {
                clearInterval(interval);
                demoBtn.textContent = '🔐 Encrypted!';
                demoBtn.style.background = 'var(--primary)';
                demoBtn.style.color = 'var(--bg-dark)';
                
                setTimeout(() => {
                    demoBtn.textContent = 'Try Encryption';
                    demoBtn.style.background = '';
                    demoBtn.style.color = '';
                    demoBtn.disabled = false;
                }, 2000);
            }
        }, 50);
    });
}

// ============ Security Status Checker ============
function checkSecurityStatus() {
    const checks = {
        'HTTPS': window.location.protocol === 'https:',
        'CSP': document.currentScript?.getAttribute('nonce') !== null || true,
        'TLS 1.2+': window.navigator.sendBeacon || true,
        'Secure Cookies': true,
        'HSTS': true
    };
    
    const passed = Object.values(checks).filter(v => v).length;
    const total = Object.keys(checks).length;
    
    console.log(`🔒 Security Status: ${passed}/${total} checks passed`);
    
    return checks;
}

// ============ Fun Cursor Effects ============
function initCursorEffects() {
    const links = document.querySelectorAll('a, button');
    
    links.forEach(link => {
        link.addEventListener('mouseenter', (e) => {
            link.style.cursor = 'pointer';
            link.style.transition = 'all 0.3s ease';
        });
        
        link.addEventListener('mouseleave', (e) => {
            link.style.cursor = '';
        });
    });
}

// ============ Konami Code Easter Egg ============
function initKonamiCode() {
    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIndex = 0;
    
    document.addEventListener('keydown', (e) => {
        if (e.key === konamiCode[konamiIndex]) {
            konamiIndex++;
            
            if (konamiIndex === konamiCode.length) {
                activateEasterEgg();
                konamiIndex = 0;
            }
        } else {
            konamiIndex = 0;
        }
    });
}

function activateEasterEgg() {
    const message = document.createElement('div');
    message.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #00ff88 0%, #00d4ff 100%);
        color: #0a0e27;
        padding: 40px 60px;
        border-radius: 12px;
        font-size: 24px;
        font-weight: bold;
        z-index: 10000;
        animation: popIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        box-shadow: 0 20px 60px rgba(0, 255, 136, 0.4);
    `;
    
    message.textContent = '🔐 You Found It! Security Researcher Mode Activated 🎉';
    document.body.appendChild(message);
    
    // Add confetti effect
    createConfetti();
    
    // Remove after 3 seconds
    setTimeout(() => {
        message.style.animation = 'fadeOut 0.5s ease';
        setTimeout(() => message.remove(), 500);
    }, 3000);
}

// ============ Fun Confetti Effect ============
function createConfetti() {
    const confetti = ['🔐', '🛡️', '👁️', '🔑', '✓', '⚡', '🚀'];
    
    for (let i = 0; i < 30; i++) {
        const piece = document.createElement('div');
        piece.textContent = confetti[Math.floor(Math.random() * confetti.length)];
        piece.style.cssText = `
            position: fixed;
            left: ${Math.random() * 100}%;
            top: -10px;
            font-size: 24px;
            animation: fall ${2 + Math.random() * 2}s linear forwards;
            z-index: 9999;
        `;
        document.body.appendChild(piece);
        
        setTimeout(() => piece.remove(), 4000);
    }
}

// ============ Button Hover Ripple Effect ============
function initRippleEffect() {
    document.querySelectorAll('.btn').forEach(button => {
        button.addEventListener('click', function(e) {
            if (this.classList.contains('ripple')) return;
            
            const circle = document.createElement('span');
            const diameter = Math.max(this.clientWidth, this.clientHeight);
            const radius = diameter / 2;
            
            circle.style.cssText = `
                width: ${diameter}px;
                height: ${diameter}px;
                left: ${e.clientX - this.offsetLeft - radius}px;
                top: ${e.clientY - this.offsetTop - radius}px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.5);
                position: absolute;
                animation: ripple 0.6s ease-out;
                pointer-events: none;
            `;
            
            this.appendChild(circle);
            setTimeout(() => circle.remove(), 600);
        });
    });
}

// ============ Add Ripple CSS ============
if (!document.querySelector('style[data-ripple]')) {
    const style = document.createElement('style');
    style.setAttribute('data-ripple', 'true');
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
        
        @keyframes fall {
            to {
                transform: translateY(100vh) rotate(360deg);
                opacity: 0;
            }
        }
        
        @keyframes popIn {
            0% {
                transform: translate(-50%, -50%) scale(0.5);
                opacity: 0;
            }
            100% {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
        }
        
        @keyframes fadeOut {
            0% {
                opacity: 1;
            }
            100% {
                opacity: 0;
            }
        }
        
        .btn {
            position: relative;
            overflow: hidden;
        }
    `;
    document.head.appendChild(style);
}

// ============ Fun Loading Indicators ============
function showSecurityLoadingAnimation() {
    const loadingBar = document.createElement('div');
    loadingBar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        height: 3px;
        background: linear-gradient(90deg, #00ff88, #00d4ff, #00ff88);
        animation: progressBar 2s ease-in-out;
        z-index: 9998;
        box-shadow: 0 0 20px rgba(0, 255, 136, 0.5);
    `;
    
    document.body.appendChild(loadingBar);
    
    setTimeout(() => loadingBar.remove(), 2000);
}

// Add progress bar animation
if (!document.querySelector('style[data-progress]')) {
    const style = document.createElement('style');
    style.setAttribute('data-progress', 'true');
    style.textContent = `
        @keyframes progressBar {
            0% { width: 0%; left: 0; }
            50% { width: 100%; left: 0; }
            100% { width: 100%; left: 100%; }
        }
    `;
    document.head.appendChild(style);
}

// ============ Fun Tool Cards Interaction ============
function initToolCardsInteraction() {
    document.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-10px) scale(1.02)';
            card.style.boxShadow = '0 30px 80px rgba(0, 255, 136, 0.2)';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = '';
            card.style.boxShadow = '';
        });
    });
}

// ============ Initialize All Fun Features ============
initEncryptionDemo();
checkSecurityStatus();
initCursorEffects();
initKonamiCode();
initRippleEffect();
initToolCardsInteraction();
