#!/usr/bin/env python3
"""
Mini HTTP proxy that rewrites Host header to localhost:11434,
strips /ollama prefix, and forwards to Ollama.
Listens on 127.0.0.1:11435.
Allows the Tailscale Funnel to forward without triggering Ollama's DNS-rebinding check.
"""
import http.server
import urllib.request
import urllib.error
import threading

UPSTREAM = "http://127.0.0.1:11434"
LISTEN = ("127.0.0.1", 11435)

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):    self.proxy()
    def do_POST(self):   self.proxy()
    def do_OPTIONS(self):self.proxy()
    def do_PUT(self):    self.proxy()
    def do_DELETE(self): self.proxy()
    def do_HEAD(self):   self.proxy()

    def log_message(self, fmt, *args): pass  # quiet

    def proxy(self):
        path = self.path
        if path.startswith('/ollama'):
            path = path[len('/ollama'):] or '/'
        target = UPSTREAM + path
        clen = int(self.headers.get('Content-Length','0') or '0')
        body = self.rfile.read(clen) if clen else None
        req = urllib.request.Request(target, data=body, method=self.command)
        for h,v in self.headers.items():
            if h.lower() in ('host','content-length'): continue
            req.add_header(h, v)
        req.add_header('Host', '127.0.0.1:11434')
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                self.send_response(r.status)
                for h,v in r.headers.items():
                    if h.lower() in ('connection','transfer-encoding','content-length'): continue
                    self.send_header(h, v)
                data = r.read()
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for h,v in e.headers.items():
                if h.lower() in ('connection','transfer-encoding','content-length'): continue
                self.send_header(h, v)
            data = e.read()
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(502, "Proxy error: "+str(e))

class ThreadingServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

if __name__ == "__main__":
    srv = ThreadingServer(LISTEN, ProxyHandler)
    print(f"Ollama proxy listening on http://{LISTEN[0]}:{LISTEN[1]} → {UPSTREAM} (strips /ollama, rewrites Host)")
    srv.serve_forever()
