import { state, CHUNK_SIZE, STORE } from './state.js';
import { genRoomCode, isFileProtocol } from './utils.js';
import { dbPut, dbGet, dbGetAll } from './db.js';
import { showHome, showRoom, setStatus, showToast, updateFileUI, renderFileList } from './ui.js';

export function createRoom() {
  if (isFileProtocol()) {
    showToast('Open via HTTP (GitHub Pages) - file:// blocks WebRTC');
    return;
  }
  state.roomCode = genRoomCode();
  state.isCreator = true;
  showRoom();
  setStatus('connecting', 'Creating room...');
  initPeer(`fs-${state.roomCode}`);
}

export function joinRoom(code) {
  code = code.trim().toLowerCase();
  if (!code) { showToast('Enter a room code'); return; }
  if (isFileProtocol()) {
    showToast('Open via HTTP (GitHub Pages) - file:// blocks WebRTC');
    return;
  }
  state.roomCode = code;
  state.isCreator = false;
  showRoom();
  setStatus('connecting', 'Joining room...');
  initPeer(null);
}

function initPeer(peerId) {
  state.peer = new Peer(peerId, {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    }
  });

  state.peer.on('open', id => {
    if (!state.isCreator) {
      connectToPeer(`fs-${state.roomCode}`);
    }
  });

  state.peer.on('connection', conn => {
    acceptConnection(conn);
  });

  state.peer.on('error', err => {
    if (err.type === 'unavailable-id') {
      if (!state.isCreator) {
        showToast('Room not found');
        showHome();
      } else {
        showToast('Room code taken, trying another...');
        setTimeout(createRoom, 500);
      }
    } else if (err.type === 'peer-unavailable') {
      setStatus('disconnected', 'Friend is offline. Waiting...');
      scheduleReconnect();
    } else {
      setStatus('error', 'Connection error');
      const msg = isFileProtocol()
        ? 'file:// blocks WebRTC. Host the page on GitHub Pages or use "npx serve ."'
        : 'Connection error: ' + err.message;
      showToast(msg);
    }
  });

  state.peer.on('disconnected', () => {
    setStatus('disconnected', 'Disconnected');
    scheduleReconnect();
  });
}

function connectToPeer(targetId) {
  setStatus('connecting', 'Connecting...');
  const conn = state.peer.connect(targetId, { reliable: true });
  setupConnection(conn);
}

function acceptConnection(conn) {
  setupConnection(conn);
}

function setupConnection(conn) {
  conn.on('open', () => {
    state.conn = conn;
    setStatus('connected', 'Connected');
    clearTimeout(state.reconnectTimer);
    conn.send(JSON.stringify({ type: 'sync-request' }));
  });

  conn.on('data', data => {
    if (typeof data === 'string') {
      handleMessage(JSON.parse(data));
    } else if (data instanceof ArrayBuffer) {
      handleChunk(new Uint8Array(data));
    } else if (data instanceof Blob) {
      data.arrayBuffer().then(buf => handleChunk(new Uint8Array(buf)));
    }
  });

  conn.on('close', () => {
    state.conn = null;
    setStatus('disconnected', 'Disconnected');
    scheduleReconnect();
  });

  conn.on('error', err => {
    showToast('Connection error');
    state.conn = null;
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (state.isCreator) return;
  clearTimeout(state.reconnectTimer);
  state.reconnectTimer = setTimeout(() => {
    if (state.peer && state.roomCode && !state.isCreator) {
      connectToPeer(`fs-${state.roomCode}`);
    }
  }, 3000);
}

async function handleMessage(msg) {
  switch (msg.type) {
    case 'sync-request': {
      const all = await dbGetAll(STORE);
      const files = all.map(f => ({ fileId: f.fileId, name: f.name, size: f.size, mime: f.mime, timestamp: f.timestamp }));
      send({ type: 'sync-response', files });
      break;
    }
    case 'sync-response': {
      const local = await dbGetAll(STORE);
      const localIds = new Set(local.map(f => f.fileId));
      for (const f of msg.files) {
        if (!localIds.has(f.fileId)) {
          send({ type: 'sync-download', fileId: f.fileId });
        }
      }
      break;
    }
    case 'sync-download': {
      const entry = await dbGet(STORE, msg.fileId);
      if (entry) {
        await sendFile(entry);
        await markSynced(msg.fileId);
      }
      break;
    }
    case 'file-start': {
      if (!state.files.has(msg.fileId)) {
        state.files.set(msg.fileId, {
          fileId: msg.fileId,
          name: msg.name,
          size: msg.size,
          mime: msg.mime,
          timestamp: msg.timestamp,
          synced: true,
          receiving: true,
        });
      }
      state.incoming[msg.fileId] = {
        meta: { name: msg.name, size: msg.size, mime: msg.mime, timestamp: msg.timestamp },
        chunks: [],
        totalChunks: msg.totalChunks,
        received: 0,
      };
      renderFileList();
      break;
    }
    case 'file-complete': {
      await assembleFile(msg.fileId);
      break;
    }
  }
}

function send(obj) {
  if (state.conn && state.conn.open) {
    state.conn.send(JSON.stringify(obj));
  }
}

function handleChunk(uint8) {
  const dec = new TextDecoder();
  const fileId = dec.decode(uint8.slice(0, 36)).replace(/\0+$/, '');
  const chunkIndex = new DataView(uint8.buffer, uint8.byteOffset + 36, 4).getUint32(0, true);
  const totalChunks = new DataView(uint8.buffer, uint8.byteOffset + 40, 4).getUint32(0, true);
  const data = uint8.slice(44);

  if (!state.incoming[fileId]) return;
  const entry = state.incoming[fileId];
  entry.chunks[chunkIndex] = data;
  entry.received++;
  const pct = Math.round(entry.received / totalChunks * 100);
  updateFileUI(fileId, 'transfer', pct);
}

async function sendFile(fileData) {
  const blob = fileData.data;
  const totalChunks = Math.ceil(blob.size / CHUNK_SIZE) || 1;

  const localEntry = state.files.get(fileData.fileId);
  if (localEntry) {
    localEntry.uploading = true;
    localEntry.uploadProgress = 0;
  }
  renderFileList();

  send({
    type: 'file-start',
    fileId: fileData.fileId,
    name: fileData.name,
    size: fileData.size,
    mime: fileData.mime,
    timestamp: fileData.timestamp,
    totalChunks,
  });

  const enc = new TextEncoder();
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, blob.size);
    const slice = await blob.slice(start, end).arrayBuffer();

    const headerSize = 44;
    const chunk = new Uint8Array(headerSize + slice.byteLength);
    const idBytes = enc.encode(fileData.fileId.padEnd(36, '\0').slice(0, 36));
    chunk.set(idBytes, 0);
    const view = new DataView(chunk.buffer);
    view.setUint32(36, i, true);
    view.setUint32(40, totalChunks, true);
    chunk.set(new Uint8Array(slice), 44);

    if (state.conn && state.conn.open) {
      state.conn.send(chunk.buffer);
    }

    const pct = Math.round((i + 1) / totalChunks * 100);
    if (localEntry) {
      localEntry.uploadProgress = pct;
      updateFileUI(fileData.fileId, 'upload', pct);
    }
  }

  send({ type: 'file-complete', fileId: fileData.fileId });

  if (localEntry) {
    localEntry.uploading = false;
    delete localEntry.uploadProgress;
  }
  renderFileList();
}

async function assembleFile(fileId) {
  const entry = state.incoming[fileId];
  if (!entry) return;
  const parts = entry.chunks;
  const blob = new Blob(parts, { type: entry.meta.mime });
  const fileData = {
    fileId,
    name: entry.meta.name,
    size: entry.meta.size,
    mime: entry.meta.mime,
    timestamp: entry.meta.timestamp || Date.now(),
    data: blob,
  };
  fileData.synced = true;
  await dbPut(STORE, fileData);
  state.files.set(fileId, fileData);
  delete state.incoming[fileId];
  renderFileList();
  showToast(`Received: ${entry.meta.name}`);
}

async function markSynced(fileId) {
  const entry = state.files.get(fileId);
  if (!entry) return;
  entry.synced = true;
  state.files.set(fileId, entry);
  await dbPut(STORE, { ...entry, synced: true });
}

export async function uploadFiles(fileList) {
  for (const file of fileList) {
    const fileId = crypto.randomUUID();
    const fileData = {
      fileId,
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      timestamp: Date.now(),
      data: new Blob([file], { type: file.type }),
      synced: false,
    };
    await dbPut(STORE, fileData);
    state.files.set(fileId, fileData);

    if (state.conn && state.conn.open) {
      await sendFile(fileData);
      await markSynced(fileId);
    }
  }
  renderFileList();
}

export async function downloadAll() {
  const all = await dbGetAll(STORE);
  if (!all.length) { showToast('No files to download'); return; }
  const zip = new JSZip();
  for (const f of all) {
    zip.file(f.name, f.data);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `filesync-${state.roomCode || 'files'}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Downloaded ${all.length} file(s)`);
}

export function leaveRoom() {
  if (state.conn) state.conn.close();
  if (state.peer) state.peer.destroy();
  state.peer = null;
  state.conn = null;
  state.roomCode = null;
  state.incoming = {};
  clearTimeout(state.reconnectTimer);
  history.replaceState(null, '', window.location.pathname);
  showHome();
  setStatus('disconnected', '');
}
