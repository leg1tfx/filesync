import { state, CHUNK_SIZE, STORE } from './state.js';
import { genRoomCode, isFileProtocol } from './utils.js';
import { dbPut, dbGet, dbGetAll } from './db.js';
import { showHome, showRoom, setStatus, showToast, updateFileUI, renderFileList, renderPeerList } from './ui.js';

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
    if (!state.isCreator) scheduleReconnect();
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
    if (state.isCreator) {
      const peerId = conn.peer;
      state.conns.set(peerId, conn);
      renderPeerList();
      broadcastExcept(peerId, { type: 'peer-joined', peerId });
      sendTo(conn, { type: 'peer-list', peers: Array.from(state.conns.keys()) });
    } else {
      state.conn = conn;
    }
    setStatus('connected', 'Connected');
    clearTimeout(state.reconnectTimer);
    if (state.isCreator) {
      sendToAll({ type: 'peer-list', peers: Array.from(state.conns.keys()) });
    } else {
      send({ type: 'sync-request' });
      processQueue();
    }
  });

  conn.on('data', data => {
    if (typeof data === 'string') {
      handleMessage(JSON.parse(data), conn);
    } else if (data instanceof ArrayBuffer) {
      handleChunk(new Uint8Array(data));
    } else if (data instanceof Blob) {
      data.arrayBuffer().then(buf => handleChunk(new Uint8Array(buf)));
    }
  });

  conn.on('close', () => {
    if (state.isCreator) {
      const peerId = conn.peer;
      state.conns.delete(peerId);
      renderPeerList();
      broadcastExcept(peerId, { type: 'peer-left', peerId });
    } else {
      state.conn = null;
    }
    setStatus('disconnected', 'Disconnected');
    if (!state.isCreator) scheduleReconnect();
  });

  conn.on('error', () => {
    if (state.isCreator) {
      state.conns.delete(conn.peer);
      renderPeerList();
    } else {
      state.conn = null;
    }
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

async function handleMessage(msg, conn) {
  switch (msg.type) {
    case 'sync-request': {
      const all = await dbGetAll(STORE);
      const files = all.map(f => ({ fileId: f.fileId, name: f.name, size: f.size, mime: f.mime, timestamp: f.timestamp }));
      sendTo(conn, { type: 'sync-response', files });
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
        const dest = conn || state.conn;
        if (dest) await sendFile(entry, dest);
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
      const entry = state.files.get(msg.fileId);
      if (state.isCreator && entry) {
        const otherConns = Array.from(state.conns.entries()).filter(([id]) => id !== (conn ? conn.peer : ''));
        for (const [, c] of otherConns) {
          await sendFile({ ...entry, data: entry.data }, c);
        }
      }
      break;
    }
    case 'peer-list': {
      state.peerIds = msg.peers;
      renderPeerList();
      break;
    }
    case 'peer-joined': {
      if (!state.peerIds.includes(msg.peerId)) state.peerIds.push(msg.peerId);
      renderPeerList();
      break;
    }
    case 'peer-left': {
      state.peerIds = state.peerIds.filter(p => p !== msg.peerId);
      renderPeerList();
      break;
    }
  }
}

function send(obj) {
  if (state.conn && state.conn.open) {
    state.conn.send(JSON.stringify(obj));
  }
}

function sendTo(conn, obj) {
  if (conn && conn.open) conn.send(JSON.stringify(obj));
}

function sendToAll(obj) {
  const msg = JSON.stringify(obj);
  for (const conn of state.conns.values()) {
    if (conn.open) conn.send(msg);
  }
}

function broadcastExcept(excludePeerId, obj) {
  const msg = JSON.stringify(obj);
  for (const [pid, conn] of state.conns) {
    if (pid !== excludePeerId && conn.open) conn.send(msg);
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

async function sendFile(fileData, dest, startFrom) {
  const blob = fileData.data;
  const totalChunks = Math.ceil(blob.size / CHUNK_SIZE) || 1;
  const conn = dest || state.conn;
  if (!conn || !conn.open) return;

  const localEntry = state.files.get(fileData.fileId);
  if (localEntry) {
    localEntry.uploading = true;
    if (!startFrom) localEntry.uploadProgress = 0;
  }

  if (!startFrom) {
    sendTo(conn, {
      type: 'file-start',
      fileId: fileData.fileId,
      name: fileData.name,
      size: fileData.size,
      mime: fileData.mime,
      timestamp: fileData.timestamp,
      totalChunks,
    });
  }
  renderFileList();

  const enc = new TextEncoder();
  for (let i = startFrom || 0; i < totalChunks; i++) {
    if (state.paused.has(fileData.fileId)) {
      state.resumeState[fileData.fileId] = { fileData, startChunk: i, dest: conn };
      if (localEntry) { localEntry.paused = true; }
      renderFileList();
      return;
    }

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

    if (conn.open) conn.send(chunk.buffer);

    const pct = Math.round((i + 1) / totalChunks * 100);
    if (localEntry) {
      localEntry.uploadProgress = pct;
      updateFileUI(fileData.fileId, 'upload', pct);
    }
  }

  sendTo(conn, { type: 'file-complete', fileId: fileData.fileId });

  if (localEntry) {
    localEntry.uploading = false;
    localEntry.paused = false;
    delete localEntry.uploadProgress;
  }
  renderFileList();
}

export function pauseTransfer(fileId) {
  state.paused.add(fileId);
  const entry = state.files.get(fileId);
  if (entry) {
    entry.paused = true;
    renderFileList();
  }
}

export async function resumeTransfer(fileId) {
  state.paused.delete(fileId);
  const rs = state.resumeState[fileId];
  const entry = state.files.get(fileId);
  if (entry) entry.paused = false;
  delete state.resumeState[fileId];

  if (rs) {
    await sendFile(rs.fileData, rs.dest, rs.startChunk);
    const idx = state.queue.findIndex(f => f.fileId === fileId);
    if (idx !== -1) state.queue.splice(idx, 1);
    await markSynced(fileId);
  } else {
    processQueue();
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
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('FileSync', { body: `Received: ${entry.meta.name}`, icon: '/favicon.ico' });
  }
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
    state.queue.push(fileData);
  }
  renderFileList();
  processQueue();
}

async function processQueue() {
  if (state.queueActive || state.queue.length === 0) return;
  state.queueActive = true;

  while (state.queue.length > 0) {
    const fileData = state.queue[0];
    let completed = false;
    if (state.conn && state.conn.open) {
      await sendFile(fileData, state.conn);
      if (!state.paused.has(fileData.fileId)) {
        state.queue.shift();
        await markSynced(fileData.fileId);
        completed = true;
      }
    } else if (state.conns.size > 0) {
      let allDone = true;
      for (const conn of state.conns.values()) {
        await sendFile(fileData, conn);
        if (state.paused.has(fileData.fileId)) { allDone = false; break; }
      }
      if (allDone) {
        state.queue.shift();
        await markSynced(fileData.fileId);
        completed = true;
      }
    }
    if (!completed) break;
  }

  state.queueActive = false;
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
  for (const conn of state.conns.values()) conn.close();
  if (state.peer) state.peer.destroy();
  state.peer = null;
  state.conn = null;
  state.conns = new Map();
  state.roomCode = null;
  state.incoming = {};
  state.queue = [];
  state.queueActive = false;
  state.paused = new Set();
  state.resumeState = {};
  state.selected = new Set();
  state.peerIds = [];
  clearTimeout(state.reconnectTimer);
  history.replaceState(null, '', window.location.pathname);
  showHome();
  setStatus('disconnected', '');
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
