import { $, el, cacheDOM, renderFileList, showToast, closePreview, setupGlobalDrag, batchDelete, batchDownload, selectAll, updateBatchBar, updateQueueInfo, renderChatHistory, renderPeerListPanel } from './ui.js';
import { state, STORE } from './state.js';
import { applyTheme, getPreferredTheme, toggleTheme, getShareLink, debounce, extIcon } from './utils.js';
import { icon } from './icons.js';
import { openDB, dbGetAll } from './db.js';
import { createRoom, joinRoom, uploadFiles, downloadAll, leaveRoom, sendChat, generateQR, confirmRename, cancelRename, confirmComment, cancelComment, requestNotificationPermission } from './peer.js';

cacheDOM();

if (el.btnShowQr) el.btnShowQr.innerHTML = icon.camera;
if (el.btnToggleChat) el.btnToggleChat.innerHTML = icon.messageCircle;
if (el.btnSettings) el.btnSettings.innerHTML = icon.zap;
if (el.searchIcon) el.searchIcon.innerHTML = icon.search;
if (el.queueIcon) el.queueIcon.innerHTML = icon.clock;

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
updateBatchBar();
updateQueueInfo();

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

el.uploadZone.addEventListener('click', () => {
  if (el.chkFolderMode && el.chkFolderMode.checked) {
    el.folderInput.click();
  } else {
    el.fileInput.click();
  }
});
el.btnBrowse.addEventListener('click', e => { e.stopPropagation(); el.fileInput.click(); });
el.fileInput.addEventListener('change', () => { uploadFiles(el.fileInput.files); el.fileInput.value = ''; });
el.folderInput.addEventListener('change', () => { uploadFiles(el.folderInput.files); el.folderInput.value = ''; });
if (el.chkFolderMode) {
  el.chkFolderMode.addEventListener('change', e => {
    el.fileInput.multiple = !e.target.checked;
  });
}

el.uploadZone.addEventListener('dragover', e => { e.preventDefault(); el.uploadZone.classList.add('dragover'); });
el.uploadZone.addEventListener('dragleave', () => el.uploadZone.classList.remove('dragover'));
el.uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  el.uploadZone.classList.remove('dragover');
  uploadFiles(e.dataTransfer.files);
});

el.btnDownloadAll.addEventListener('click', downloadAll);
el.btnLeave.addEventListener('click', leaveRoom);

el.searchInput.addEventListener('input', debounce(e => {
  state.searchQuery = e.target.value;
  renderFileList();
}, 200));

el.btnSelectAll.addEventListener('click', selectAll);
el.btnBatchDelete.addEventListener('click', batchDelete);
el.btnBatchDownload.addEventListener('click', batchDownload);

el.previewClose.addEventListener('click', closePreview);
el.previewModal.addEventListener('click', e => { if (e.target === el.previewModal) closePreview(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePreview(); });

setupGlobalDrag();

if (el.btnShowQr) {
  el.btnShowQr.addEventListener('click', () => {
    const panel = el.qrPanel;
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      import('./peer.js').then(m => m.generateQR());
    }
  });
  el.btnCloseQr.addEventListener('click', () => { el.qrPanel.style.display = 'none'; });
}

if (el.btnToggleChat) {
  el.btnToggleChat.addEventListener('click', () => {
    const panel = el.chatPanel;
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
      renderChatHistory();
      el.chatInput.focus();
    }
  });
  el.btnCloseChat.addEventListener('click', () => { el.chatPanel.style.display = 'none'; });
  el.btnChatSend.addEventListener('click', () => {
    const text = el.chatInput.value.trim();
    if (text) {
      sendChat(text);
      el.chatInput.value = '';
    }
  });
  el.chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      el.btnChatSend.click();
    }
  });
}

el.peerCount.addEventListener('click', () => {
  const panel = el.peerListPanel;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  if (panel.style.display === 'block') {
    import('./ui.js').then(m => m.renderPeerListPanel());
  }
});
if (el.btnClosePeerList) {
  el.btnClosePeerList.addEventListener('click', () => { el.peerListPanel.style.display = 'none'; });
}

el.btnSettings.addEventListener('click', () => {
  el.settingsModal.classList.add('active');
  el.settingsPassword.value = state.password || '';
  updateSettingsThemeBtn();
});

function updateSettingsThemeBtn() {
  const isDark = document.body.classList.contains('dark');
  el.settingsThemeToggle.innerHTML = (isDark ? icon.sun : icon.moon) + ' <span>' + (isDark ? 'Light' : 'Dark') + '</span>';
}

el.settingsThemeToggle.addEventListener('click', () => {
  toggleTheme();
  updateSettingsThemeBtn();
});

el.settingsClose.addEventListener('click', () => {
  el.settingsModal.classList.remove('active');
});
el.settingsModal.addEventListener('click', e => {
  if (e.target === el.settingsModal) el.settingsModal.classList.remove('active');
});

el.settingsSavePassword.addEventListener('click', () => {
  const pw = el.settingsPassword.value.trim();
  state.password = pw || null;
  showToast(pw ? 'Password saved' : 'Password cleared');
});

document.getElementById('btn-ocr').addEventListener('click', async () => {
  const { runOCR } = await import('./ui.js');
  runOCR();
});

document.getElementById('rename-confirm').addEventListener('click', confirmRename);
document.getElementById('rename-close').addEventListener('click', cancelRename);
document.getElementById('rename-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmRename(); });

document.getElementById('comment-confirm').addEventListener('click', confirmComment);
document.getElementById('comment-close').addEventListener('click', cancelComment);

requestNotificationPermission();
