# FileSync

Peer-to-Peer Datei-Sync direkt im Browser. Kein Server, kein Account, keine Dateigrößen-Limits.

## Features

- **P2P file transfer** – Direkte WebRTC-Verbindung zwischen Browsern, kein Zwischen-Server
- **Multi-Peer Mesh** – Mehrere Nutzer gleichzeitig in einem Raum (Hub-and-Spoke)
- **No file size limits** – Keine Upload-Begrenzung
- **No account needed** – Keine Registrierung, kein Login
- **Persistent storage** – Dateien bleiben in IndexedDB erhalten, auch nach Tab-Schließen
- **Auto-sync** – Automatische Synchronisation bei Wiederherstellung der Verbindung
- **Upload queue** – Dateien werden nacheinander in einer Warteschlange verarbeitet
- **Pause/Resume** – Uploads anhalten und fortsetzen
- **File preview** – Bilder, Videos, Audio, PDFs und Textdokumente inline ansehen
- **Search & filter** – Dateien nach Namen durchsuchen
- **Batch actions** – Mehrere Dateien auswählen, löschen oder als ZIP herunterladen
- **Pin files** – Wichtige Dateien anpinnen (erscheinen immer oben)
- **Browser notifications** – Benachrichtigung bei abgeschlossenem Download
- **Dark mode** – Hell/Dunkel-Umschaltung (speichert Präferenz)
- **ZIP bulk download** – Alle Dateien auf einmal herunterladen
- **Drag & drop** – Dateien per Drag & Drop oder Dateiauswahl hochladen
- **PWA ready** – Installierbar als App, Service Worker für Offline-Cache
- **Desktop drag** – Dateien aus dem OS-Dateimanager direkt in die App ziehen

## How to use

1. Beide öffnen `index.html` (oder die gehostete URL)
2. Person A klickt **Create Room** und teilt den Link mit weiteren Personen
3. Alle öffnen den Link – Verbindung wird automatisch hergestellt
4. Dateien hochladen: Sie werden an alle verbundenen Teilnehmer übertragen
5. **Download All as ZIP** zum Batch-Download aller Dateien

> **Hinweis:** `file://`-Protokoll wird nicht unterstützt, da WebRTC einen HTTP-Server benötigt. Nutze GitHub Pages oder lokal `npx serve .`.

## How it works

- **PeerJS** stellt WebRTC-Verbindungen zwischen den Browsern her
- Der Raumersteller fungiert als Hub – alle Teilnehmer verbinden sich direkt
- Dateien werden in 64-KB-Chunks übertragen
- **IndexedDB** speichert Dateien lokal
- Chunk-Header enthalten File-ID, Chunk-Index und Gesamtzahl
- Bei erneuter Verbindung gleichen sich die Peers per Sync-Protokoll ab

## Tech Stack

- **Vanilla JS (ES Modules)** – Kein Framework, keine Build-Tools
- **PeerJS** (CDN) – WebRTC Peer-to-Peer Verbindungen
- **JSZip** (CDN) – ZIP-Erstellung im Browser
- **IndexedDB** – Lokale Dateispeicherung
- **PWA** – Manifest + Service Worker für installierbare App
- **Vanilla CSS** – Dark Mode mit CSS-Variablen, responsive, animierte UI

## Browser Support

Chrome, Firefox, Edge, Safari (alle modernen Browser).

## Deployment

Einfach auf GitHub Pages, Netlify, Vercel oder einem beliebigen Static-Hoster ablegen:

```bash
npx serve .
```

Oder via GitHub Actions (`.github/workflows/deploy.yml`).

## License

MIT
