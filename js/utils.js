import { state, ADJECTIVES, NOUNS } from './state.js';
import { icon } from './icons.js';

export function genRoomCode() {
  const a = ADJECTIVES[Math.random() * ADJECTIVES.length | 0];
  const n = NOUNS[Math.random() * NOUNS.length | 0];
  const num = Math.random() * 100 | 0;
  return `${a}-${n}-${num}`;
}

export function uuid() { return crypto.randomUUID(); }

export function fmtSize(bytes) {
  if (bytes == null || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

export function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtSpeed(bytesPerSec) {
  if (bytesPerSec == null || bytesPerSec === 0) return '';
  if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + ' B/s';
  if (bytesPerSec < 1048576) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  return (bytesPerSec / 1048576).toFixed(1) + ' MB/s';
}

export function extIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    pdf: 'file', doc: 'file', docx: 'file',
    jpg: 'fileImage', jpeg: 'fileImage', png: 'fileImage', gif: 'fileImage', webp: 'fileImage', svg: 'fileImage',
    mp4: 'fileVideo', mov: 'fileVideo', avi: 'fileVideo', mkv: 'fileVideo', webm: 'fileVideo',
    mp3: 'fileAudio', wav: 'fileAudio', flac: 'fileAudio', ogg: 'fileAudio',
    zip: 'fileArchive', rar: 'fileArchive', '7z': 'fileArchive', gz: 'fileArchive', tgz: 'fileArchive',
    txt: 'fileText', md: 'fileText', json: 'fileText', xml: 'fileText', csv: 'fileText',
    js: 'fileText', ts: 'fileText', py: 'fileText', html: 'fileText', css: 'fileText',
    exe: 'fileExec', dmg: 'fileExec', apk: 'fileExec',
    iso: 'fileDisk', img: 'fileDisk',
    folder: 'folder',
  };
  return icon[map[ext]] || icon.folder;
}

export function getPreviewType(mime) {
  if (!mime) return null;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  return null;
}

export function getPreferredTheme() {
  const stored = localStorage.getItem('filesync-theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('filesync-theme', theme);
  document.querySelectorAll('.theme-toggle').forEach(b => b.innerHTML = theme === 'dark' ? icon.sun : icon.moon);
}

export function toggleTheme() {
  const isDark = document.body.classList.contains('dark');
  applyTheme(isDark ? 'light' : 'dark');
}

export function isFileProtocol() {
  return window.location.protocol === 'file:';
}

export function getShareLink() {
  const url = new URL(window.location);
  url.hash = state.roomCode;
  if (state.password) url.searchParams.set('p', btoa(state.password));
  return url.toString();
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export function simpleEncrypt(data, password) {
  const key = simpleKey(password);
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] ^= key[i % key.length];
  }
  return bytes.buffer;
}

export function simpleDecrypt(data, password) {
  return simpleEncrypt(data, password);
}

function simpleKey(password) {
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    key[i] = password.charCodeAt(i % password.length) ^ (i * 13);
  }
  return key;
}
