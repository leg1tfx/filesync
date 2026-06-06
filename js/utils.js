import { state, ADJECTIVES, NOUNS } from './state.js';

export function genRoomCode() {
  const a = ADJECTIVES[Math.random() * ADJECTIVES.length | 0];
  const n = NOUNS[Math.random() * NOUNS.length | 0];
  const num = Math.random() * 100 | 0;
  return `${a}-${n}-${num}`;
}

export function uuid() { return crypto.randomUUID(); }

export function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

export function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function extIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    pdf: '\u{1F4C4}', doc: '\u{1F4C4}', docx: '\u{1F4C4}',
    jpg: '\u{1F5BC}', jpeg: '\u{1F5BC}', png: '\u{1F5BC}', gif: '\u{1F5BC}', webp: '\u{1F5BC}',
    mp4: '\u{1F3AC}', mov: '\u{1F3AC}', avi: '\u{1F3AC}',
    mp3: '\u{1F3B5}', wav: '\u{1F3B5}', flac: '\u{1F3B5}',
    zip: '\u{1F4E6}', rar: '\u{1F4E6}', '7z': '\u{1F4E6}',
    txt: '\u{1F4DD}', md: '\u{1F4DD}',
  };
  return map[ext] || '\u{1F4C1}';
}

export function getPreferredTheme() {
  const stored = localStorage.getItem('filesync-theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('filesync-theme', theme);
  document.querySelectorAll('.theme-toggle').forEach(b => b.textContent = theme === 'dark' ? '\u2600' : '\u263E');
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
  return url.toString();
}
