#!/usr/bin/env python3
"""Simple HTTP server for viewing log viewer in browser."""

import http.server
import socketserver
import os
import sys

PORT = 8000

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Request handler with CORS support."""

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    print(f"Starting HTTP server on http://localhost:{PORT}")
    print(f"Serving files from: {os.getcwd()}")
    print(f"\nOpen your browser and navigate to:")
    print(f"  http://localhost:{PORT}/log-viewer.html")
    print("\nPress Ctrl+C to stop the server")

    with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == "__main__":
    main()
