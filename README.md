# FileSync

Peer-to-Peer Datei-Sync direkt im Browser. Kein Server, kein Account, keine Dateigrößen-Limits.

## Features

- **P2P file transfer** – Direkte WebRTC-Verbindung zwischen Browsern, kein Zwischen-Server
- **No file size limits** – Keine Upload-Begrenzung
- **No account needed** – Keine Registrierung, kein Login
- **Persistent storage** – Dateien bleiben in IndexedDB erhalten, auch nach Tab-Schließen
- **Auto-sync** – Automatische Synchronisation bei Wiederherstellung der Verbindung
- **Dark mode** – Hell/Dunkel-Umschaltung (speichert Präferenz)
- **ZIP bulk download** – Alle Dateien auf einmal herunterladen
- **Drag & drop** – Dateien per Drag & Drop oder Dateiauswahl hochladen

## How to use

1. Beide öffnen `index.html` (oder die gehostete URL)
2. Person A klickt **Create Room** und teilt den Link mit Person B
3. Person B öffnet den Link – Verbindung wird automatisch hergestellt
4. Dateien hochladen: Sie werden sofort an die andere Person übertragen
5. **Download All as ZIP** zum Batch-Download aller Dateien

> **Hinweis:** `file://`-Protokoll wird nicht unterstützt, da WebRTC einen HTTP-Server benötigt. Nutze GitHub Pages oder lokal `npx serve .`.

## How it works

- **PeerJS** stellt eine direkte WebRTC-Verbindung zwischen den Browsern her
- Dateien werden in 64-KB-Chunks direkt übertragen – kein Zwischen-Server
- **IndexedDB** speichert Dateien lokal (überlebt Tab-Schließen/Seiten-Neuladen)
- Chunk-Header enthalten File-ID, Chunk-Index und Gesamtzahl für fehlerfreie Rekonstruktion
- Bei erneuter Verbindung gleichen sich die Peers per `sync-request`/`sync-response` ab

## Tech Stack

- **Single HTML file** – Keine Abhängigkeiten, keine Build-Tools, kein Framework
- **PeerJS** (CDN) – WebRTC Peer-to-Peer Verbindungen
- **JSZip** (CDN) – ZIP-Erstellung im Browser
- **IndexedDB** – Lokale Dateispeicherung
- **Vanilla CSS** – Dark Mode mit CSS-Variablen, responsive, animierte UI

## Browser Support

Chrome, Firefox, Edge, Safari (alle modernen Browser).

## Deployment

Einfach auf GitHub Pages, Netlify, Vercel oder einem beliebigen Static-Hoster ablegen:

```bash
npx serve .
```

Oder die `index.html` auf einen Webserver kopieren.

## License

MIT
