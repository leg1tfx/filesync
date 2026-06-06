# FileSync

Peer-to-Peer Datei-Sync direkt im Browser. Kein Server, kein Account, keine Dateigrößen-Limits.

## How to use

1. Both open `index.html` (or the hosted URL)
2. One clicks **Create Room**, gets a room code
3. Share the link with your friend
4. Friend opens the link → connects automatically
5. Upload files – they sync instantly to the other person
6. **Download All as ZIP** to batch-download everything

## How it works

- **PeerJS** establishes a direct WebRTC connection between browsers
- Files are transferred in 64KB chunks directly, no intermediate server
- **IndexedDB** stores files locally (survives tab close / page reload)
- When both reconnect, files sync automatically

## Tech

- Single HTML file, zero dependencies to install
- PeerJS, JSZip (loaded via CDN at runtime)
- Works in all modern browsers (Chrome, Firefox, Edge, Safari)
