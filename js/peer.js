import { state, CHUNK_SIZE, STORE } from './state.js';
import { genRoomCode, isFileProtocol, getShareLink, escapeHtml, simpleEncrypt, simpleDecrypt } from './utils.js';
import { dbPut, dbGet, dbGetAll, dbGetAllKeys, dbDelete } from './db.js';
import { showHome, showRoom, setStatus, showToast, updateFileUI, renderFileList, renderPeerList, renderChatMessage, renderPeerListPanel, updateArchiveCount } from './ui.js';

const MAX_RETRIES = 3;

async function clearStorage() {
  if (!state.db) return;
  const keys = await dbGetAllKeys(STORE);
  for (const key of keys) await dbDelete(STORE, key);
  state.files.clear();
  state.queue = [];
  state.queueActive = false;
  renderFileList();
}

export async function createRoom() {
  if (isFileProtocol()) {
    showToast('Open via HTTP (GitHub Pages) - file:// blocks WebRTC');
    return;
  }
  await clearStorage();
  state.roomCode = genRoomCode();
  state.isCreator = true;
  const pw = document.getElementById('input-room-password');
  state.password = pw ? pw.value.trim() || null : null;
  showRoom();
  setStatus('connecting', 'Creating room...');
  initPeer(`fs-${state.roomCode}`);
  autoCopyLink();
  setTimeout(() => generateQR(), 500);
}

function autoCopyLink() {
  const link = getShareLink();
  navigator.clipboard.writeText(link).then(() => showToast('Room created! Link copied to clipboard')).catch(() => {});
}

export async function joinRoom(code) {
  code = code.trim().toLowerCase();
  if (!code) { showToast('Enter a room code'); return; }
  if (isFileProtocol()) {
    showToast('Open via HTTP (GitHub Pages) - file:// blocks WebRTC');
    return;
  }
  await clearStorage();
  state.roomCode = code;
  state.isCreator = false;
  const params = new URLSearchParams(window.location.search);
  const p = params.get('p');
  if (p) {
    try { state.password = atob(p); } catch(e) { state.password = null; }
  }
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
    requeueUnsynced();
    processQueue();
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
      const decrypted = state.password ? simpleDecrypt(data, state.password) : data;
      handleChunk(new Uint8Array(decrypted));
    } else if (data instanceof Blob) {
      data.arrayBuffer().then(buf => {
        const decrypted = state.password ? simpleDecrypt(buf, state.password) : buf;
        handleChunk(new Uint8Array(decrypted));
      });
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
      const files = all.map(f => ({ fileId: f.fileId, name: f.name, size: f.size, mime: f.mime, timestamp: f.timestamp, comment: f.comment }));
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
          comment: msg.comment || '',
        });
      }
      state.incoming[msg.fileId] = {
        meta: { name: msg.name, size: msg.size, mime: msg.mime, timestamp: msg.timestamp, comment: msg.comment || '' },
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
      renderPeerListPanel();
      break;
    }
    case 'peer-joined': {
      if (!state.peerIds.includes(msg.peerId)) state.peerIds.push(msg.peerId);
      renderPeerList();
      renderPeerListPanel();
      break;
    }
    case 'peer-left': {
      state.peerIds = state.peerIds.filter(p => p !== msg.peerId);
      renderPeerList();
      renderPeerListPanel();
      break;
    }
    case 'chat': {
      state.chatMessages.push({ sender: msg.sender || 'Peer', text: msg.text, self: false });
      renderChatMessage(msg.sender || 'Peer', msg.text, false);
      break;
    }
    case 'rename': {
      const entry = state.files.get(msg.fileId);
      if (entry) {
        entry.name = msg.name;
        state.files.set(msg.fileId, entry);
        await dbPut(STORE, entry);
        renderFileList();
      }
      break;
    }
    case 'comment': {
      const entry = state.files.get(msg.fileId);
      if (entry) {
        entry.comment = msg.comment;
        state.files.set(msg.fileId, entry);
        await dbPut(STORE, entry);
        renderFileList();
      }
      break;
    }
    case 'delete-file': {
      state.files.delete(msg.fileId);
      await dbDelete(STORE, msg.fileId);
      renderFileList();
      break;
    }
    case 'handoff-request': {
      if (state.isCreator) {
        const newCreatorId = msg.peerId;
        sendToAll({ type: 'handoff-transfer', newCreator: newCreatorId });
        state.isCreator = false;
        showToast('Room creator transferred');
        renderPeerList();
      }
      break;
    }
    case 'handoff-transfer': {
      showToast('Room creator has changed');
      renderPeerList();
      break;
    }
    case 'mesh-connect': {
      if (msg.targetId && state.peer) {
        const meshConn = state.peer.connect(msg.targetId, { reliable: true });
        setupMeshConnection(meshConn);
      }
      break;
    }
  }
}

function setupMeshConnection(conn) {
  conn.on('open', () => {
    if (!state.meshPeers) state.meshPeers = new Map();
    state.meshPeers.set(conn.peer, conn);
    showToast('Mesh connected: ' + conn.peer);
    sendTo(conn, { type: 'chat', sender: 'System', text: 'You are now mesh-connected' });
  });
  conn.on('data', data => {
    if (typeof data === 'string') {
      handleMessage(JSON.parse(data), conn);
    } else if (data instanceof ArrayBuffer) {
      const decrypted = state.password ? simpleDecrypt(data, state.password) : data;
      handleChunk(new Uint8Array(decrypted));
    }
  });
  conn.on('close', () => {
    if (state.meshPeers) state.meshPeers.delete(conn.peer);
    showToast('Mesh peer disconnected: ' + conn.peer);
  });
}

export function sendChat(text) {
  const msg = { type: 'chat', sender: state.peer ? state.peer.id : 'Me', text };
  state.chatMessages.push({ sender: 'Me', text, self: true });
  renderChatMessage('Me', text, true);
  sendToAll(JSON.stringify(msg));
  if (state.conn && state.conn.open) state.conn.send(JSON.stringify(msg));
  if (state.meshPeers) {
    const s = JSON.stringify(msg);
    for (const c of state.meshPeers.values()) { if (c.open) c.send(s); }
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
  if (state.meshPeers) {
    for (const c of state.meshPeers.values()) { if (c.open) c.send(msg); }
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

  if (entry.meta && entry.meta.mime && entry.meta.mime.startsWith('video/') && pct > 0 && pct % 25 === 0) {
    const partialBlob = new Blob(entry.chunks.filter(Boolean), { type: entry.meta.mime });
    const existing = state.files.get(fileId);
    if (existing) {
      existing.streamingBlob = partialBlob;
      state.files.set(fileId, existing);
    }
  }
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
      comment: fileData.comment || '',
    });
  }
  renderFileList();

  const enc = new TextEncoder();
  state.speedBytes = 0;
  state.speedStart = Date.now();

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
    let payload = slice;
    if (state.password) {
      payload = simpleEncrypt(new Uint8Array(slice), state.password);
    }
    const chunk = new Uint8Array(headerSize + payload.byteLength);
    const idBytes = enc.encode(fileData.fileId.padEnd(36, '\0').slice(0, 36));
    chunk.set(idBytes, 0);
    const view = new DataView(chunk.buffer);
    view.setUint32(36, i, true);
    view.setUint32(40, totalChunks, true);
    chunk.set(new Uint8Array(payload), 44);

    let sent = false;
    for (let retry = 0; retry <= MAX_RETRIES && !sent; retry++) {
      try {
        if (conn.open) {
          conn.send(chunk.buffer);
          sent = true;
        }
      } catch (e) {
        if (retry < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 200 * (retry + 1)));
        } else {
          showToast('Failed to send chunk: ' + fileData.name);
          return;
        }
      }
    }

    state.speedBytes += slice.byteLength;

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
    comment: entry.meta.comment || '',
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
  checkSelfDestruct(fileId);
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
      comment: '',
    };
    await dbPut(STORE, fileData);
    state.files.set(fileId, fileData);
    state.queue.push(fileData);
  }
  renderFileList();
  processQueue();
}

async function processQueue() {
  if (!state.conn && state.conns.size === 0) {
    state.queue = [];
    renderFileList();
    return;
  }
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

function requeueUnsynced() {
  for (const [id, f] of state.files) {
    if (!f.synced && !state.queue.some(q => q.fileId === id)) {
      state.queue.push(f);
    }
  }
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

export function generateQR() {
  const container = document.getElementById('qrcode');
  if (!container) return;
  container.innerHTML = '';
  try {
    new QRCode(container, { text: getShareLink(), width: 180, height: 180 });
  } catch(e) {
    showToast('QR generation failed');
  }
}

export function requestRename(fileId) {
  const entry = state.files.get(fileId);
  if (!entry) return;
  state.renameModal = fileId;
  const input = document.getElementById('rename-input');
  if (input) {
    input.value = entry.name;
    document.getElementById('rename-modal').classList.add('active');
    input.focus();
    input.select();
  }
}

export async function confirmRename() {
  const fileId = state.renameModal;
  if (!fileId) return;
  const input = document.getElementById('rename-input');
  const newName = input ? input.value.trim() : '';
  if (!newName) { showToast('Name cannot be empty'); return; }
  const entry = state.files.get(fileId);
  if (entry) {
    entry.name = newName;
    state.files.set(fileId, entry);
    await dbPut(STORE, entry);
    renderFileList();
    const renameMsg = { type: 'rename', fileId, name: newName };
    sendToAll(JSON.stringify(renameMsg));
    if (state.conn && state.conn.open) state.conn.send(JSON.stringify(renameMsg));
  }
  document.getElementById('rename-modal').classList.remove('active');
  state.renameModal = null;
}

export function cancelRename() {
  document.getElementById('rename-modal').classList.remove('active');
  state.renameModal = null;
}

export function requestComment(fileId) {
  const entry = state.files.get(fileId);
  if (!entry) return;
  state.commentModal = fileId;
  const input = document.getElementById('comment-input');
  if (input) {
    input.value = entry.comment || '';
    document.getElementById('comment-modal').classList.add('active');
    input.focus();
  }
}

export async function confirmComment() {
  const fileId = state.commentModal;
  if (!fileId) return;
  const input = document.getElementById('comment-input');
  const comment = input ? input.value.trim() : '';
  const entry = state.files.get(fileId);
  if (entry) {
    entry.comment = comment;
    state.files.set(fileId, entry);
    await dbPut(STORE, entry);
    renderFileList();
    const commentMsg = { type: 'comment', fileId, comment };
    sendToAll(JSON.stringify(commentMsg));
    if (state.conn && state.conn.open) state.conn.send(JSON.stringify(commentMsg));
  }
  document.getElementById('comment-modal').classList.remove('active');
  state.commentModal = null;
}

export function cancelComment() {
  document.getElementById('comment-modal').classList.remove('active');
  state.commentModal = null;
}

function checkSelfDestruct(fileId) {
  const entry = state.files.get(fileId);
  if (!entry || !entry.selfDestruct) return;
  const delay = entry.selfDestruct;
  state.selfDestructTimers[fileId] = setTimeout(async () => {
    await dbDelete(STORE, fileId);
    state.files.delete(fileId);
    delete state.selfDestructTimers[fileId];
    renderFileList();
    showToast('Self-destructed: ' + entry.name);
    const delMsg = { type: 'delete-file', fileId };
    sendToAll(JSON.stringify(delMsg));
    if (state.conn && state.conn.open) state.conn.send(JSON.stringify(delMsg));
  }, delay);
}

export function setSelfDestruct(fileId, minutes) {
  const entry = state.files.get(fileId);
  if (!entry) return;
  if (state.selfDestructTimers[fileId]) {
    clearTimeout(state.selfDestructTimers[fileId]);
  }
  if (minutes > 0) {
    entry.selfDestruct = minutes * 60 * 1000;
    state.files.set(fileId, entry);
    dbPut(STORE, entry);
    checkSelfDestruct(fileId);
    showToast(`Self-destruct in ${minutes}m`);
  } else {
    delete entry.selfDestruct;
    state.files.set(fileId, entry);
    dbPut(STORE, entry);
    showToast('Self-destruct cancelled');
  }
  renderFileList();
}

export function transferCreator(newPeerId) {
  if (!state.isCreator) return;
  sendToAll({ type: 'handoff-transfer', newCreator: newPeerId });
  state.isCreator = false;
  showToast('Transferred creator to ' + newPeerId);
  renderPeerList();
}

export function connectMesh(targetId) {
  if (!state.peer) return;
  const conn = state.peer.connect(targetId, { reliable: true });
  setupMeshConnection(conn);
  sendToAll({ type: 'mesh-connect', targetId });
  showToast('Connecting mesh: ' + targetId);
}

export function leaveRoom() {
  for (const id in state.selfDestructTimers) {
    clearTimeout(state.selfDestructTimers[id]);
  }
  if (state.conn) state.conn.close();
  for (const conn of state.conns.values()) conn.close();
  if (state.meshPeers) { for (const c of state.meshPeers.values()) c.close(); }
  if (state.peer) state.peer.destroy();
  state.peer = null;
  state.conn = null;
  state.conns = new Map();
  state.meshPeers = new Map();
  state.roomCode = null;
  state.incoming = {};
  state.queue = [];
  state.queueActive = false;
  state.paused = new Set();
  state.resumeState = {};
  state.selected = new Set();
  state.peerIds = [];
  state.chatMessages = [];
  state.password = null;
  state.selfDestructTimers = {};
  state.renameModal = null;
  state.commentModal = null;
  clearTimeout(state.reconnectTimer);
  history.replaceState(null, '', window.location.pathname);
  document.getElementById('qr-panel').style.display = 'none';
  document.getElementById('chat-panel').classList.remove('active');
  document.getElementById('peer-list-panel').classList.remove('active');
  const qrContainer = document.getElementById('qrcode');
  if (qrContainer) qrContainer.innerHTML = '';
  showHome();
  setStatus('disconnected', '');
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
