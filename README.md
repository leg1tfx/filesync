# FileSync

Peer-to-peer file sync directly in your browser. No server, no account, no file size limits.

## Features

- **P2P file transfer** – Direct WebRTC connection between browsers, no relay server
- **Multi-Peer Mesh** – Multiple users simultaneously in one room (hub-and-spoke + direct mesh)
- **No file size limits** – No upload cap
- **No account needed** – No sign-up, no login
- **Persistent storage** – Files stay in IndexedDB, persists across tab closes
- **Auto-sync** – Automatic synchronization on reconnection
- **QR code** – Scan to join a room from any device
- **Chat** – Text chat alongside file transfers
- **Password-protected rooms** – Optional XOR-obfuscated room passwords
- **Upload queue** – Files are processed sequentially in a queue
- **Pause/Resume** – Pause and resume uploads
- **File preview** – Images, videos, audio, PDFs, and text files inline
- **Search & filter** – Search files by name and comments
- **OCR search** – Full-text search in images via Tesseract.js
- **Batch actions** – Select multiple files, delete or download as ZIP
- **Pin files** – Pin important files (always appear on top)
- **Browser notifications** – Notification on completed download
- **Dark mode** – Light/dark toggle (persists preference)
- **File rename** – Rename files in-app, synced across peers
- **File comments** – Add inline comments to any file
- **Self-destruct timer** – Set files to auto-delete after 1m to 24h
- **Folder upload** – Upload entire folder structures
- **Chunk-level retry** – Resilient transfer with automatic retry
- **Drag to desktop** – Native drag from browser to OS file manager
- **Upload speed display** – Live speed indicator per file
- **ZIP bulk download** – Download all or selected files as ZIP
- **Drag & drop** – Upload via drag & drop or file picker
- **PWA ready** – Installable as app, Service Worker for offline cache
- **Desktop drag** – Drag files from OS file manager directly into the app
- **Virtual scrolling** – Handles thousands of files efficiently
- **Chunked download** – Streams large files to disk
- **Creator handoff** – Transfer room ownership to another peer
- **Mesh networking** – Direct connections between non-creator peers
- **Video/audio streaming** – Start playback while file is still being received

## How to use

1. Both parties open `index.html` (or the hosted URL)
2. Person A clicks **Create Room** and shares the link
3. Everyone opens the link – connection is established automatically
4. Upload files: they are transferred to all connected peers
5. **Download All as ZIP** to batch-download all files

> **Note:** `file://` protocol is not supported because WebRTC requires an HTTP server. Use GitHub Pages or locally `npx serve .`.

## How it works

- **PeerJS** establishes WebRTC connections between browsers
- The room creator acts as the hub – all participants connect directly
- Files are transferred in 64 KB chunks
- **IndexedDB** stores files locally
- Chunk headers contain file ID, chunk index, and total count
- On reconnection, peers sync via a sync protocol
- All new features: chat, QR, rename, comments, self-destruct, OCR, mesh networking, handoff, and more

## Tech Stack

- **Vanilla JS (ES Modules)** – No framework, no build tools
- **PeerJS** (CDN) – WebRTC peer-to-peer connections
- **JSZip** (CDN) – ZIP creation in the browser
- **QRCode.js** (CDN) – QR code generation
- **Tesseract.js** (loaded on demand) – OCR for image text search
- **IndexedDB** – Local file storage
- **PWA** – Manifest + Service Worker for installable app
- **Vanilla CSS** – Editorial/magazine design system with CSS variables, dark mode (paper / night), responsive
- **Typography** – Fraunces (display), Newsreader (body), JetBrains Mono (data) — all variable
- **SVG icons** – 30 inline SVG icons (no emoji, no icon library)

## Browser Support

Chrome, Firefox, Edge, Safari (all modern browsers).

## Deployment

Simply deploy to GitHub Pages, Netlify, Vercel, or any static host:

```bash
npx serve .
```

Or via GitHub Actions (`.github/workflows/deploy.yml`).

## License

MIT
