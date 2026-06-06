import { state, STORE } from './state.js';
import { fmtSize, fmtTime, extIcon } from './utils.js';
import { dbDelete } from './db.js';

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

export function renderFileList() {
  const items = Array.from(state.files.values());
  if (items.length === 0) {
    el.emptyState.style.display = 'block';
    el.fileList.innerHTML = '';
    return;
  }
  el.emptyState.style.display = 'none';
  el.fileList.innerHTML = items.map(f => {
    const isIncoming = !!state.incoming[f.fileId];
    const isUploading = f.uploading;
    const isTransferring = isIncoming || isUploading;

    let badge;
    if (isIncoming) badge = '<span class="badge badge-transfer">Syncing...</span>';
    else if (isUploading) badge = '<span class="badge badge-upload">Uploading...</span>';
    else if (f.synced === false) badge = '<span class="badge badge-pending">Pending</span>';
    else badge = '<span class="badge badge-synced">Synced</span>';

    const progressPct = isIncoming ? 0 : (f.uploadProgress || 0);
    return `
      <div class="file-item" data-id="${f.fileId}">
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
          ${(f.receiving || isUploading) ? '' : '<button class="btn btn-secondary btn-icon" data-action="download">Download</button>'}
          <button class="btn btn-danger btn-icon" data-action="delete">Delete</button>
        </div>
      </div>`;
  }).join('');

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
  renderFileList();
}
