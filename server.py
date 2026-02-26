#!/usr/bin/env python3
"""
CipherTools Local Development Server
Serves the website locally for testing and demonstration
Usage: python server.py
Then visit: http://localhost:8000
"""

import http.server
import socketserver
import os
import sys
from pathlib import Path

PORT = 8000
DIRECTORY = Path(__file__).parent

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)
    
    def end_headers(self):
        # Add security headers
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-XSS-Protection', '1; mode=block')
        self.send_header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:")
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        super().end_headers()
    
    def log_message(self, format, *args):
        # Nice colorful logging
        if '200' in str(args):
            print(f"✅ {args[0]}")
        elif '404' in str(args):
            print(f"❌ {args[0]}")
        else:
            print(f"📝 {args[0]}")

def run_server():
    handler = MyHTTPRequestHandler
    
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        url = f"http://localhost:{PORT}"
        print("\n" + "="*60)
        print("🚀 CipherTools Local Server Started")
        print("="*60)
        print(f"📍 Address: {url}")
        print(f"📁 Directory: {DIRECTORY}")
        print(f"🔒 Security Headers: ENABLED")
        print("\n🌐 OPEN IN BROWSER:")
        print(f"   {url}")
        print("\n📊 DEMO PAGES:")
        print(f"   {url}                  (Home)")
        print(f"   {url}#tools            (Tools Catalog)")
        print(f"   {url}#cipher           (CIPHER Browser)")
        print(f"   {url}#security         (Security Info)")
        print(f"   {url}#contact          (Contact Form)")
        print("\n🛑 STOP SERVER: Press Ctrl+C")
        print("="*60 + "\n")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n⛔ Server stopped by user")
            sys.exit(0)

if __name__ == '__main__':
    open_browser = '--no-browser' not in sys.argv
    
    try:
        run_server()
    except OSError as e:
        print(f"❌ Error: {e}")
        print(f"Port {PORT} may already be in use. Try another port:")
        print(f"   python3 server.py --port 9000")
        sys.exit(1)
