# Merkez Ankara kiosk sunucusu:
#   - Statik dosyalari sunar (index.html, GLB, JS...)
#   - POST /api/save-graph -> editordeki grafi assets/data/graph.json dosyasina yazar
#     (onceki surumu graph.json.bak olarak yedekler)
#
# Calistirma:  python server.py          (varsayilan port 8000)
#              python server.py 8001     (farkli port)

import json
import os
import shutil
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
GRAPH_PATH = os.path.join(ROOT, "assets", "data", "graph.json")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class KioskHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        if self.path != "/api/save-graph":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            # bozuk JSON veya bozuk karakter kodlamasi dosyaya yazilmasin
            data = json.loads(body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self.send_error(400, "Gecersiz JSON")
            return

        if os.path.exists(GRAPH_PATH):
            shutil.copyfile(GRAPH_PATH, GRAPH_PATH + ".bak")
        with open(GRAPH_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')
        print(f"[kaydet] graph.json guncellendi "
              f"({len(data.get('nodes', []))} nokta, {len(data.get('edges', []))} kenar)")

    def end_headers(self):
        # Editor/kiosk gelistirme dongusunde JSON'lar hep taze gelsin
        if self.path.endswith(".json"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    print(f"Merkez Ankara kiosk sunucusu: http://localhost:{PORT}")
    print(f"  Kiosk : http://localhost:{PORT}")
    print(f"  Editor: http://localhost:{PORT}/?editor=1")
    print("Durdurmak icin Ctrl+C")
    ThreadingHTTPServer(("0.0.0.0", PORT), KioskHandler).serve_forever()
