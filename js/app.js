import { $, cacheDOM, el, renderFileList, showToast } from './ui.js';
import { state, STORE } from './state.js';
import { applyTheme, getPreferredTheme, toggleTheme, getShareLink } from './utils.js';
import { openDB, dbGetAll } from './db.js';
import { createRoom, joinRoom, uploadFiles, downloadAll, leaveRoom } from './peer.js';

cacheDOM();

applyTheme(getPreferredTheme());
$('#theme-toggle-home').addEventListener('click', toggleTheme);
$('#theme-toggle-room').addEventListener('click', toggleTheme);

try {
  state.db = await openDB();
  const stored = await dbGetAll(STORE);
  for (const f of stored) state.files.set(f.fileId, f);
} catch (e) {
  showToast('Failed to open storage: ' + e.message);
}

renderFileList();

const hash = window.location.hash.slice(1);
if (hash) {
  el.inputRoomCode.value = hash;
  joinRoom(hash);
}

el.btnCreate.addEventListener('click', createRoom);

el.btnJoin.addEventListener('click', () => joinRoom(el.inputRoomCode.value));
el.inputRoomCode.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(el.inputRoomCode.value); });

el.btnCopyCode.addEventListener('click', () => {
  const link = getShareLink();
  navigator.clipboard.writeText(link).then(() => showToast('Link copied!')).catch(() => {
    navigator.clipboard.writeText(state.roomCode).then(() => showToast('Room code copied!'));
  });
});

el.uploadZone.addEventListener('click', () => el.fileInput.click());
el.btnBrowse.addEventListener('click', e => { e.stopPropagation(); el.fileInput.click(); });
el.fileInput.addEventListener('change', () => { uploadFiles(el.fileInput.files); el.fileInput.value = ''; });

el.uploadZone.addEventListener('dragover', e => { e.preventDefault(); el.uploadZone.classList.add('dragover'); });
el.uploadZone.addEventListener('dragleave', () => el.uploadZone.classList.remove('dragover'));
el.uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  el.uploadZone.classList.remove('dragover');
  uploadFiles(e.dataTransfer.files);
});

el.btnDownloadAll.addEventListener('click', downloadAll);

el.btnLeave.addEventListener('click', leaveRoom);
