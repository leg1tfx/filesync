import { state, STORE } from './state.js';
import { fmtSize, fmtTime, extIcon, getPreviewType, debounce } from './utils.js';
import { dbDelete, dbPut, dbGetAll } from './db.js';
import { pauseTransfer, resumeTransfer, downloadAll, requestNotificationPermission } from './peer.js';

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
  el.peerList = $('#peer-list');
  el.queueInfo = $('#queue-info');
  el.queueCount = $('#queue-count');
  el.previewModal = $('#preview-modal');
  el.previewContent = $('#preview-content');
  el.previewClose = $('#preview-close');
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

export function updateFileUI(fileId, status, progress) {
  const card = document.querySelector(`[data-id="${fileId}"]`);
  if (!card) return;
  const badge = card.querySelector('.badge');
  const bar = card.querySelector('.progress-bar');
  if (badge) {
    const labels = { synced: 'Synced', pending: 'Pending', transfer: 'Syncing...', upload: 'Uploading...' };
    badge.textContent = labels[status] || status;
    const cls = { synced: 'badge-synced', pending: 'badge-pending', transfer: 'badge-transfer', upload: 'badge-upload' };
    badge.className = 'badge ' + (cls[status] || 'badge-transfer');
  }
  if (bar) bar.style.width = progress + '%';
}

export function renderPeerList() {
  const count = state.isCreator ? state.conns.size : (state.conn ? 1 + state.peerIds.length : 0);
  el.peerCount.textContent = count > 0 ? `${count} peer${count !== 1 ? 's' : ''} connected` : 'Waiting for peers...';
}

export function renderFileList() {
  const query = state.searchQuery.toLowerCase().trim();
  let items = Array.from(state.files.values());

  if (query) {
    items = items.filter(f => f.name.toLowerCase().includes(query));
  }

  items.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.timestamp - a.timestamp;
  });

  if (items.length === 0) {
    el.emptyState.style.display = 'block';
    el.emptyState.innerHTML = query
      ? '<div class="icon">&#128270;</div><p>No files match your search</p>'
      : '<div class="icon">&#128229;</div><p>No files yet. Upload something!</p>';
    el.fileList.innerHTML = '';
    updateBatchBar();
    updateQueueInfo();
    return;
  }
  el.emptyState.style.display = 'none';

  const queueIds = new Set(state.queue.map(f => f.fileId));

  el.fileList.innerHTML = items.map(f => {
    const isIncoming = !!state.incoming[f.fileId];
    const isUploading = f.uploading;
    const isTransferring = isIncoming || isUploading;
    const isPaused = f.paused;
    const inQueue = queueIds.has(f.fileId) && !isUploading;
    const isSelected = state.selected.has(f.fileId);
    const previewType = getPreviewType(f.mime);

    let badge;
    if (isIncoming) badge = '<span class="badge badge-transfer">Syncing...</span>';
    else if (isUploading && isPaused) badge = '<span class="badge badge-paused">Paused</span>';
    else if (isUploading) badge = '<span class="badge badge-upload">Uploading...</span>';
    else if (inQueue) badge = '<span class="badge badge-pending">Queued</span>';
    else if (!f.synced) badge = '<span class="badge badge-pending">Pending</span>';
    else badge = '<span class="badge badge-synced">Synced</span>';

    const progressPct = isIncoming ? 0 : (f.uploadProgress || 0);
    const pinIcon = f.pinned ? '\u2B50' : '\u2606';

    return `
      <div class="file-item ${isSelected ? 'selected' : ''}" data-id="${f.fileId}">
        <label class="checkbox-label">
          <input type="checkbox" class="file-checkbox" data-id="${f.fileId}" ${isSelected ? 'checked' : ''}>
        </label>
        <span class="icon">${extIcon(f.name)}</span>
        <div class="info">
          <div class="name">${f.name}</div>
          <div class="meta">
            <span>${fmtSize(f.size)}</span>
            <span>${fmtTime(f.timestamp)}</span>
            ${badge}
          </div>
          ${isTransferring ? '<div class="progress"><div class="progress-bar" style="width:' + progressPct + '%"></div></div>' : ''}
        </div>
        <div class="actions">
          <button class="btn btn-icon btn-action" data-action="pin" title="${f.pinned ? 'Unpin' : 'Pin'}">${pinIcon}</button>
          ${previewType && f.synced && !isTransferring ? '<button class="btn btn-icon btn-action" data-action="preview" title="Preview">\u{1F50D}</button>' : ''}
          ${isUploading && !isPaused ? '<button class="btn btn-icon btn-action" data-action="pause" title="Pause">\u23F8</button>' : ''}
          ${isUploading && isPaused ? '<button class="btn btn-icon btn-action" data-action="resume" title="Resume">\u25B6</button>' : ''}
          ${(!isTransferring || isPaused) && !inQueue ? '<button class="btn btn-icon btn-action" data-action="download" title="Download">\u2B07</button>' : ''}
          <button class="btn btn-danger btn-icon" data-action="delete">Delete</button>
        </div>
      </div>`;
  }).join('');

  el.fileList.querySelectorAll('.file-checkbox').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = e.target.dataset.id;
      if (e.target.checked) state.selected.add(id);
      else state.selected.delete(id);
      e.target.closest('.file-item').classList.toggle('selected', e.target.checked);
      updateBatchBar();
    });
  });

  el.fileList.querySelectorAll('[data-action="download"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-item').dataset.id;
      downloadFile(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-item').dataset.id;
      deleteFile(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="pin"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-item').dataset.id;
      togglePin(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="preview"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-item').dataset.id;
      openPreview(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="pause"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-item').dataset.id;
      pauseTransfer(id);
    });
  });

  el.fileList.querySelectorAll('[data-action="resume"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.file-item').dataset.id;
      resumeTransfer(id);
    });
  });

  updateBatchBar();
  updateQueueInfo();
}

export function updateQueueInfo() {
  const qLen = state.queue.length;
  if (qLen > 0) {
    el.queueInfo.style.display = 'flex';
    el.queueCount.textContent = `${qLen} file${qLen !== 1 ? 's' : ''} queued`;
  } else {
    el.queueInfo.style.display = 'none';
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
  const a = document.createElement('a');
  a.href = URL.createObjectURL(entry.data);
  a.download = entry.name;
  a.click();
  URL.revokeObjectURL(a.href);
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
  const visible = query ? items.filter(f => f.name.toLowerCase().includes(query)) : items;
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

  const url = URL.createObjectURL(entry.data);
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
    video.style.maxHeight = '80vh';
    el.previewContent.appendChild(video);
  } else if (previewType === 'audio') {
    const div = document.createElement('div');
    div.style.textAlign = 'center';
    div.style.padding = '40px 20px';
    div.innerHTML = `<div style="font-size:3rem;margin-bottom:16px">\u{1F3B5}</div><p style="margin-bottom:16px">${entry.name}</p>`;
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
    embed.style.height = '80vh';
    el.previewContent.appendChild(embed);
  } else if (previewType === 'text') {
    entry.data.text().then(text => {
      const pre = document.createElement('pre');
      pre.textContent = text;
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
      pre.style.maxHeight = '70vh';
      pre.style.overflowY = 'auto';
      pre.style.background = 'var(--bg-soft)';
      pre.style.padding = '16px';
      pre.style.borderRadius = '8px';
      pre.style.fontSize = '0.85rem';
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
