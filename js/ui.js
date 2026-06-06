import { state, STORE } from './state.js';
import { fmtSize, fmtTime, fmtSpeed, extIcon, getPreviewType, debounce, escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { dbDelete, dbPut, dbGetAll } from './db.js';
import { pauseTransfer, resumeTransfer, downloadAll, requestNotificationPermission, requestRename, requestComment, setSelfDestruct } from './peer.js';

export const $ = s => document.querySelector(s);
export const el = {};

export function cacheDOM() {
  el.screenHome = $('#screen-home');
  el.screenRoom = $('#screen-room');
  el.btnCreate = $('#btn-create');
  el.btnJoin = $('#btn-join');
  el.inputRoomCode = $('#input-room-code');
  el.roomCodeDisplay = $('#room-code-display');
  el.btnCopyCode = $('#btn-copy-code');
  el.statusDot = $('#status-dot');
  el.statusText = $('#status-text');
  el.uploadZone = $('#upload-zone');
  el.btnBrowse = $('#btn-browse');
  el.fileInput = $('#file-input');
  el.fileList = $('#file-list');
  el.emptyState = $('#empty-state');
  el.btnDownloadAll = $('#btn-download-all');
  el.btnLeave = $('#btn-leave');
  el.toast = $('#toast');
  el.searchInput = $('#search-input');
  el.batchBar = $('#batch-bar');
  el.batchCount = $('#batch-count');
  el.btnBatchDelete = $('#btn-batch-delete');
  el.btnBatchDownload = $('#btn-batch-download');
  el.btnSelectAll = $('#btn-select-all');
  el.peerCount = $('#peer-count');
  el.queueInfo = $('#queue-info');
  el.queueCount = $('#queue-count');
  el.speedDisplay = $('#speed-display');
  el.previewModal = $('#preview-modal');
  el.previewContent = $('#preview-content');
  el.previewTitle = $('#preview-title');
  el.previewClose = $('#preview-close');
  el.qrPanel = $('#qr-panel');
  el.btnShowQr = $('#btn-show-qr');
  el.btnCloseQr = $('#btn-close-qr');
  el.chatPanel = $('#chat-panel');
  el.btnToggleChat = $('#btn-toggle-chat');
  el.btnCloseChat = $('#btn-close-chat');
  el.chatMessages = $('#chat-messages');
  el.chatInput = $('#chat-input');
  el.btnChatSend = $('#btn-chat-send');
  el.peerListPanel = $('#peer-list-panel');
  el.peerListContent = $('#peer-list-content');
  el.btnClosePeerList = $('#btn-close-peer-list');
  el.chkFolderMode = $('#chk-folder-mode');
  el.folderInput = $('#folder-input');
  el.searchIcon = $('#search-icon');
  el.queueIcon = $('#queue-icon');
  el.btnSettings = $('#btn-settings');
  el.settingsModal = $('#settings-modal');
  el.settingsClose = $('#settings-close');
  el.settingsThemeToggle = $('#settings-theme-toggle');
  el.settingsPassword = $('#settings-password');
  el.settingsSavePassword = $('#settings-save-password');
  el.themeLabelHome = $('#theme-label-home');
  el.themeLabelRoom = $('#theme-label-room');
  el.settingsThemeLabel = $('#settings-theme-label');
  el.archiveCount = $('#archive-count');
  el.selfDestructModal = $('#self-destruct-modal');
  el.sdOptions = $('#sd-options');
  el.sdClose = $('#sd-close');
}

export function showHome() {
  el.screenHome.classList.add('active');
  el.screenRoom.classList.remove('active');
}

export function showRoom() {
  el.screenHome.classList.remove('active');
  el.screenRoom.classList.add('active');
  el.roomCodeDisplay.textContent = state.roomCode;
  history.replaceState(null, '', '#' + state.roomCode);
  requestNotificationPermission();
}

export function setStatus(type, text) {
  const dots = { connecting: 'dot-connecting', connected: 'dot-connected', error: 'dot-error', disconnected: 'dot-disconnected' };
  el.statusDot.className = 'dot ' + (dots[type] || 'dot-disconnected');
  el.statusText.textContent = text;
}

export function showToast(msg, duration) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(el.toast._t);
  el.toast._t = setTimeout(() => el.toast.classList.remove('show'), duration || 2500);
}

export function updateThemeLabels() {
  const isDark = document.body.classList.contains('dark');
  const label = isDark ? 'Night' : 'Day';
  if (el.themeLabelHome) el.themeLabelHome.textContent = label;
  if (el.themeLabelRoom) el.themeLabelRoom.textContent = label;
  if (el.settingsThemeLabel) el.settingsThemeLabel.textContent = label;
}

export function updateFileUI(fileId, status, progress) {
  const card = document.querySelector(`[data-id="${fileId}"]`);
  if (!card) return;
  const badge = card.querySelector('.badge');
  const bar = card.querySelector('.file-row__progress-bar');
  const speedEl = card.querySelector('.speed-indicator');
  if (badge) {
    const labels = { synced: 'Synced', pending: 'Pending', transfer: 'Syncing', upload: 'Uploading' };
    badge.textContent = labels[status] || status;
    const cls = { synced: 'badge-synced', pending: 'badge-pending', transfer: 'badge-transfer', upload: 'badge-upload' };
    badge.className = 'badge ' + (cls[status] || 'badge-transfer');
  }
  if (bar) bar.style.width = progress + '%';
  if (speedEl && status === 'upload') {
    const elapsed = (Date.now() - state.speedStart) / 1000;
    if (elapsed > 0) speedEl.textContent = fmtSpeed(state.speedBytes / elapsed);
  }
}

export function renderPeerList() {
  const count = state.isCreator ? state.conns.size : (state.conn ? 1 + state.peerIds.length : 0);
  el.peerCount.textContent = count > 0 ? `${count} peer${count !== 1 ? 's' : ''} connected` : 'Waiting for peers';
}

export function renderPeerListPanel() {
  if (!el.peerListContent) return;
  const peers = state.isCreator
    ? Array.from(state.conns.keys())
    : [state.conn ? state.conn.peer : null, ...state.peerIds].filter(Boolean);
  if (peers.length === 0) {
    el.peerListContent.innerHTML = '<p style="font-family:var(--serif);font-style:italic;color:var(--text-secondary);font-size:15px">No peers connected yet</p>';
    return;
  }
  el.peerListContent.innerHTML = peers.map(p => `
    <div class="peer-list__item">
      <span class="peer-list__dot"></span>
      <span class="peer-list__name">${escapeHtml(p)}</span>
      ${state.isCreator ? `<button class="btn btn--sm btn--ghost" onclick="import('./peer.js').then(m=>m.transferCreator('${p}'))">Handoff</button>` : ''}
      <button class="btn btn--sm btn--ghost" onclick="import('./peer.js').then(m=>m.connectMesh('${p}'))">Mesh</button>
    </div>
  `).join('');
}

export function renderChatMessage(sender, text, self) {
  if (!el.chatMessages) return;
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (sender === 'System' ? 'system' : self ? 'self' : 'other');
  if (sender !== 'System' && !self) {
    const nameDiv = document.createElement('div');
    nameDiv.className = 'chat-msg__sender';
    nameDiv.textContent = sender;
    div.appendChild(nameDiv);
  }
  const textDiv = document.createTextNode(text);
  div.appendChild(textDiv);
  el.chatMessages.appendChild(div);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

export function renderChatHistory() {
  if (!el.chatMessages) return;
  el.chatMessages.innerHTML = '';
  for (const msg of state.chatMessages) {
    renderChatMessage(msg.sender, msg.text, msg.self);
  }
}

export function updateArchiveCount() {
  if (!el.archiveCount) return;
  const n = state.files.size;
  el.archiveCount.textContent = n;
}

export function renderFileList() {
  const query = state.searchQuery.toLowerCase().trim();
  let items = Array.from(state.files.values());

  if (query) {
    items = items.filter(f =>
      f.name.toLowerCase().includes(query) ||
      (f.comment && f.comment.toLowerCase().includes(query)) ||
      (state.ocrActive && state.ocrIndex[f.fileId] && state.ocrIndex[f.fileId].includes(query))
    );
  }

  items.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.timestamp - a.timestamp;
  });

  updateArchiveCount();

  if (items.length === 0) {
    el.emptyState.style.display = 'block';
    el.emptyState.innerHTML = query
      ? '<div class="empty-state__mark">∅</div><div class="empty-state__text">No items match your search</div>'
      : '<div class="empty-state__mark">—</div><div class="empty-state__text">No items in the archive yet</div>';
    el.fileList.innerHTML = '';
    updateBatchBar();
    updateQueueInfo();
    return;
  }
  el.emptyState.style.display = 'none';

  if (state.ocrActive && query) {
    for (const f of items) {
      if (state.ocrIndex[f.fileId] && state.ocrIndex[f.fileId].includes(query)) {
        continue;
      }
    }
  }

  const queueIds = new Set(state.queue.map(f => f.fileId));

  const total = items.length;
  const limit = state.renderLimit;
  const showLoadMore = total > limit;
  if (showLoadMore) items = items.slice(0, limit);

  const rendered = items.map((f, idx) => {
    const isIncoming = !!state.incoming[f.fileId];
    const incomingData = state.incoming[f.fileId];
    const isUploading = f.uploading;
    const isTransferring = isIncoming || isUploading;
    const isPaused = f.paused;
    const inQueue = queueIds.has(f.fileId) && !isUploading;
    const isSelected = state.selected.has(f.fileId);
    const previewType = getPreviewType(f.mime);
    const hasSelfDestruct = !!f.selfDestruct;
    const pinned = f.pinned;

    let badge;
    if (isIncoming) badge = '<span class="badge badge-transfer">Syncing</span>';
    else if (isUploading && isPaused) badge = '<span class="badge badge-paused">Paused</span>';
    else if (isUploading) badge = '<span class="badge badge-upload">Uploading</span>';
    else if (inQueue) badge = '<span class="badge badge-pending">Queued</span>';
    else if (!f.synced) badge = '<span class="badge badge-pending">Pending</span>';
    else if (hasSelfDestruct) badge = '<span class="badge badge-self-destruct">Expires</span>';
    else badge = '<span class="badge badge-synced">Synced</span>';

    const pct = isIncoming && incomingData
      ? Math.round((incomingData.received || 0) / (incomingData.totalChunks || 1) * 100)
      : (f.uploadProgress || 0);
    const pinIcon = pinned ? icon.star : icon.starOutline;

    const elapsed = isUploading && state.speedStart ? (Date.now() - state.speedStart) / 1000 : 0;
    const speedStr = isUploading && elapsed > 0 ? fmtSpeed(state.speedBytes / elapsed) : '';

    const indexLabel = String(idx + 1).padStart(2, '0');

    return `
      <div class="file-row ${isSelected ? 'selected' : ''}" data-id="${f.fileId}" draggable="true">
        <span class="file-row__index">${indexLabel}${pinned ? ' ★' : ''}</span>
        <span class="file-row__icon">${extIcon(f.name)}</span>
        <div class="file-row__body">
          <div class="file-row__name" ondblclick="import('./peer.js').then(m=>m.requestRename('${f.fileId}'))" title="Double-click to rename">${escapeHtml(f.name)}</div>
          ${f.comment ? '<div class="file-row__comment">' + escapeHtml(f.comment) + '</div>' : ''}
          <div class="file-row__meta">
            <span>${fmtTime(f.timestamp)}</span>
            ${badge}
            ${speedStr ? '<span class="speed-indicator">' + speedStr + '</span>' : ''}
          </div>
          ${isTransferring ? '<div class="file-row__progress"><div class="file-row__progress-bar" style="width:' + pct + '%"></div></div>' : ''}
        </div>
        <div class="file-row__size">${fmtSize(f.size)}</div>
        <div class="file-row__actions">
          <button class="icon-btn ${pinned ? 'icon-btn--active' : ''}" data-action="pin" title="${pinned ? 'Unpin' : 'Pin'}">${pinIcon}</button>
          ${previewType && f.synced && !isTransferring ? `<button class="icon-btn" data-action="preview" title="Preview">${icon.eye}</button>` : ''}
          <button class="icon-btn" data-action="comment" title="Comment">${icon.textQuote}</button>
          <button class="icon-btn" data-action="self-destruct" title="Self-destruct">${icon.hourglass}</button>
          ${isUploading && !isPaused ? `<button class="icon-btn" data-action="pause" title="Pause">${icon.pause}</button>` : ''}
          ${isUploading && isPaused ? `<button class="icon-btn" data-action="resume" title="Resume">${icon.play}</button>` : ''}
          ${(!isTransferring || isPaused) && !inQueue ? `<button class="icon-btn" data-action="download" title="Download">${icon.download}</button>` : ''}
          <button class="icon-btn icon-btn--danger" data-action="delete" title="Delete">${icon.trash2}</button>
        </div>
      </div>`;
  }).join('');

  el.fileList.innerHTML = rendered;

  if (showLoadMore) {
    const btn = document.createElement('button');
    btn.className = 'load-more';
    btn.textContent = `Show ${total - limit} more · ${total} total`;
    btn.addEventListener('click', () => {
      state.renderLimit += 50;
      import('./ui.js').then(m => m.renderFileList());
    });
    el.fileList.appendChild(btn);
  }

  el.fileList.querySelectorAll('.file-checkbox').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = e.target.dataset.id;
      if (e.target.checked) state.selected.add(id);
      else state.selected.delete(id);
      e.target.closest('.file-row').classList.toggle('selected', e.target.checked);
      updateBatchBar();
    });
  });

  el.fileList.querySelectorAll('[data-action="download"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-row').dataset.id;
      downloadFile(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-row').dataset.id;
      deleteFile(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="pin"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-row').dataset.id;
      togglePin(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="preview"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-row').dataset.id;
      openPreview(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="pause"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-row').dataset.id;
      pauseTransfer(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="resume"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-row').dataset.id;
      resumeTransfer(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="comment"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-row').dataset.id;
      requestComment(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="self-destruct"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-row').dataset.id;
      showSelfDestructMenu(id);
    });
  });

  el.fileList.querySelectorAll('.file-row[draggable="true"]').forEach(item => {
    item.addEventListener('dragstart', e => {
      const id = item.dataset.id;
      const entry = state.files.get(id);
      if (entry && entry.data) {
        e.dataTransfer.setData('text/plain', entry.name);
        e.dataTransfer.setData('DownloadURL', entry.mime + ':' + entry.name + ':' + URL.createObjectURL(entry.data));
      }
    });
  });

  updateBatchBar();
  updateQueueInfo();
}

function showSelfDestructMenu(fileId) {
  const entry = state.files.get(fileId);
  if (!entry) return;
  const current = entry.selfDestruct ? entry.selfDestruct / 60000 : 0;
  const options = [0, 1, 5, 15, 30, 60, 1440];
  const labels = ['Off', '1 minute', '5 minutes', '15 minutes', '30 minutes', '1 hour', '24 hours'];
  el.sdOptions.innerHTML = options.map((o, i) =>
    `<button class="option-list__item ${o === current ? 'option-list__item--active' : ''}" data-val="${o}">
      <span>${labels[i]}</span>
      <span class="option-list__meta">${o === 0 ? 'never' : o + ' min'}</span>
    </button>`
  ).join('');
  el.selfDestructModal.classList.add('active');
  el.sdOptions.querySelectorAll('[data-val]').forEach(b => {
    b.addEventListener('click', () => {
      setSelfDestruct(fileId, parseInt(b.dataset.val));
      el.selfDestructModal.classList.remove('active');
    });
  });
}

if (el.sdClose) {
  el.sdClose.addEventListener('click', () => el.selfDestructModal.classList.remove('active'));
}
if (el.selfDestructModal) {
  el.selfDestructModal.addEventListener('click', e => {
    if (e.target === el.selfDestructModal) el.selfDestructModal.classList.remove('active');
  });
}

export function updateQueueInfo() {
  const qLen = state.queue.length;
  if (qLen > 0) {
    el.queueInfo.style.display = 'flex';
    el.queueCount.textContent = `${qLen} file${qLen !== 1 ? 's' : ''} queued`;
    const elapsed = state.speedStart ? (Date.now() - state.speedStart) / 1000 : 0;
    if (elapsed > 0 && state.speedBytes > 0) {
      el.speedDisplay.textContent = fmtSpeed(state.speedBytes / elapsed);
    } else {
      el.speedDisplay.textContent = '';
    }
  } else {
    el.queueInfo.style.display = 'none';
    el.speedDisplay.textContent = '';
  }
}

export function updateBatchBar() {
  const count = state.selected.size;
  if (count > 0) {
    el.batchBar.classList.add('active');
    el.batchCount.textContent = `${count} selected`;
  } else {
    el.batchBar.classList.remove('active');
  }
}

function downloadFile(fileId) {
  const entry = state.files.get(fileId);
  if (!entry) return;
  if (entry.data.stream) {
    downloadChunked(entry);
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(entry.data);
    a.download = entry.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function downloadChunked(entry) {
  const stream = entry.data.stream();
  const reader = stream.getReader();
  const chunks = [];
  reader.read().then(function process({ done, value }) {
    if (done) {
      const blob = new Blob(chunks, { type: entry.mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    chunks.push(value);
    reader.read().then(process);
  });
}

async function deleteFile(fileId) {
  await dbDelete(STORE, fileId);
  state.files.delete(fileId);
  state.selected.delete(fileId);
  renderFileList();
}

async function togglePin(fileId) {
  const entry = state.files.get(fileId);
  if (!entry) return;
  entry.pinned = !entry.pinned;
  state.files.set(fileId, entry);
  await dbPut(STORE, entry);
  renderFileList();
}

export async function batchDelete() {
  const ids = Array.from(state.selected);
  for (const id of ids) {
    await dbDelete(STORE, id);
    state.files.delete(id);
  }
  state.selected.clear();
  renderFileList();
  showToast(`Deleted ${ids.length} file(s)`);
}

export async function batchDownload() {
  const ids = Array.from(state.selected);
  const all = await dbGetAll(STORE);
  const selected = all.filter(f => ids.includes(f.fileId));
  if (!selected.length) return;
  const zip = new JSZip();
  for (const f of selected) zip.file(f.name, f.data);
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `filesync-selected-${state.roomCode || 'files'}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Downloaded ${selected.length} file(s)`);
}

export function selectAll() {
  const items = Array.from(state.files.values());
  const query = state.searchQuery.toLowerCase().trim();
  const visible = query ? items.filter(f => f.name.toLowerCase().includes(query) || (f.comment && f.comment.toLowerCase().includes(query))) : items;
  const allSelected = visible.every(f => state.selected.has(f.fileId));
  if (allSelected) {
    for (const f of visible) state.selected.delete(f.fileId);
  } else {
    for (const f of visible) state.selected.add(f.fileId);
  }
  renderFileList();
}

function openPreview(fileId) {
  const entry = state.files.get(fileId);
  if (!entry || !entry.data) return;
  const previewType = getPreviewType(entry.mime);
  if (!previewType) return;

  if (el.previewTitle) el.previewTitle.textContent = entry.name;

  const blobToUse = entry.streamingBlob || entry.data;
  const url = URL.createObjectURL(blobToUse);
  el.previewModal.classList.add('active');
  el.previewContent.innerHTML = '';

  if (previewType === 'image') {
    const img = document.createElement('img');
    img.src = url;
    img.alt = entry.name;
    el.previewContent.appendChild(img);
  } else if (previewType === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    video.autoplay = false;
    video.style.maxWidth = '100%';
    video.style.maxHeight = '70vh';
    video.preload = 'auto';
    el.previewContent.appendChild(video);
  } else if (previewType === 'audio') {
    const div = document.createElement('div');
    div.style.textAlign = 'center';
    div.style.padding = '40px 20px';
    div.innerHTML = `<div style="font-size:3rem;margin-bottom:16px">${icon.music}</div><p style="font-family:var(--serif);font-style:italic;font-size:18px;margin-bottom:16px">${escapeHtml(entry.name)}</p>`;
    const audio = document.createElement('audio');
    audio.src = url;
    audio.controls = true;
    audio.style.width = '100%';
    div.appendChild(audio);
    el.previewContent.appendChild(div);
  } else if (previewType === 'pdf') {
    const embed = document.createElement('embed');
    embed.src = url;
    embed.type = 'application/pdf';
    embed.style.width = '100%';
    embed.style.height = '70vh';
    el.previewContent.appendChild(embed);
  } else if (previewType === 'text') {
    entry.data.text().then(text => {
      const pre = document.createElement('pre');
      pre.textContent = text;
      el.previewContent.appendChild(pre);
    });
  }

  el.previewContent.dataset.url = url;
}

export function closePreview() {
  const url = el.previewContent.dataset.url;
  if (url) URL.revokeObjectURL(url);
  el.previewContent.innerHTML = '';
  el.previewContent.dataset.url = '';
  el.previewModal.classList.remove('active');
}

export function setupGlobalDrag() {
  document.addEventListener('dragover', e => { e.preventDefault(); });
  document.addEventListener('drop', e => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      import('./peer.js').then(m => m.uploadFiles(files));
    }
  });
}

export async function runOCR() {
  state.ocrActive = !state.ocrActive;
  const btn = document.getElementById('btn-ocr');
  if (!state.ocrActive) {
    if (btn) btn.textContent = 'OCR';
    state.searchQuery = '';
    document.getElementById('search-input').value = '';
    renderFileList();
    return;
  }
  if (btn) btn.textContent = 'Scanning…';
  try {
    const { createWorker } = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    const worker = await createWorker('eng');
    const imageFiles = Array.from(state.files.values()).filter(f =>
      f.mime && f.mime.startsWith('image/') && f.data && !state.ocrIndex[f.fileId]
    );
    for (let i = 0; i < imageFiles.length; i++) {
      const f = imageFiles[i];
      try {
        const blob = f.data;
        const { data } = await worker.recognize(blob);
        state.ocrIndex[f.fileId] = data.text.toLowerCase();
        if (btn) btn.textContent = `Scanning ${Math.round(i / imageFiles.length * 100)}%`;
      } catch (e) {
        state.ocrIndex[f.fileId] = '';
      }
    }
    await worker.terminate();
    if (btn) btn.textContent = 'OCR Done';
    showToast(`OCR indexed ${imageFiles.length} file(s)`);
  } catch (e) {
    showToast('OCR failed: ' + e.message);
    if (btn) btn.textContent = 'OCR';
  }
  renderFileList();
}
