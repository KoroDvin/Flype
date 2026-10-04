/* ============================================================
   FLYPE · СУПЕР-АПП
   app.js — Часть 1: Ядро, мессенджер, Firebase, госуслуги
   ============================================================ */

const STORAGE_KEYS = {
  users: 'flype_users',
  currentUserId: 'flype_current_user',
  chats: 'flype_chats',
  messages: 'flype_messages',
  statuses: 'flype_statuses',
  settings: 'flype_settings',
  hiddenChats: 'flype_hidden_chats',
  tutorialDone: 'flype_tutorial_done',
  activeApp: 'flype_active_app',
  music: 'flype_music',
  videoHistory: 'flype_video_history',
  gosData: 'flype_gos_data'
};
const ADMIN_UID = '';
const ADMIN_EMAIL = 'admin.servera.ec@gmail.com';
const ADMIN_USERNAME = 'admin001';
const ADMIN_PASSWORD = 'FlypeAdmin#Root2026!';
const ADMIN_FIRSTNAME = 'Администратор';
const ADMIN_LASTNAME = 'Flype';
const ID_CHANGE_COOLDOWN = 30*24*60*60*1000;
const LOGIN_BLOCK_KEY = 'flype_login_block';
const REPORTS_LIMIT_PER_MONTH = 2;
const WARNINGS_FOR_AUTOBAN = 6;
const AUTOBAN_DAYS = 30;
const JITSI_DOMAIN = 'meet.jit.si';
const SYNC_REQUEST_TTL = 24*60*60*1000;
const SYNC_CODE_TTL = 5*60*1000;
const SYNC_UNLOCK_TTL = 24*60*60*1000;
const MAX_MESSAGES_PER_CHAT = 500;
const CURRENCY = '₮';
let syncKeysListener = null;

/* Регионы ФРС: республика → области */
const SLASTVIA_REGIONS = {
  'Украинская': ['Киевская','Львовская','Одесская','Харьковская','Днепропетровская','Запорожская','Винницкая','Полтавская','Черкасская','Житомирская','Ровенская','Тернопольская','Ивано-Франковская','Волынская','Закарпатская','Черновицкая','Херсонская','Николаевская','Кировоградская','Сумская','Черниговская','Донецкая','Луганская','Крымская'],
  'Белорусская': ['Минская','Гомельская','Брестская','Витебская','Гродненская','Могилёвская','Минск'],
  'Польская': ['Мазовецкое','Малопольское','Силезское','Великопольское','Нижнесилезское','Лодзинское','Люблинское','Поморское','Западно-Поморское','Куявско-Поморское','Варминьско-Мазурское','Свентокшиское','Подляское','Подкарпатское','Опольское','Любушское'],
  'Чешская': ['Прага','Среднечешский','Южночешский','Пльзеньский','Карловарский','Устецкий','Либерецкий','Краловеградецкий','Пардубицкий','Высочина','Южноморавский','Оломоуцкий','Злинский','Моравскосилезский'],
  'Словацкая': ['Братиславский','Трнавский','Тренчинский','Нитранский','Жилинский','Банскобистрицкий','Прешовский','Кошицкий'],
  'Киев': ['Киев']
};

const SOUND_FILES = {
  ringtone:'sounds/Flype-Standart.mp3',
  error:'sounds/error.mp3',
  notification:'sounds/notification.mp3',
  systemNotification:'sounds/system-notification.mp3',
  callConnect:'sounds/connection-call.mp3',
  callStart:'sounds/call-start.mp3',
  callEnded:'sounds/call-ended.mp3',
  callFailed:'sounds/connect-failed.mp3',
  connectionLost:'sounds/connection-lost.mp3',
  logout:'sounds/logout.mp3',
  statusSent:'sounds/status-sent.mp3',
  statusFailed:'sounds/failed-send-status.mp3'
};
const soundCache = {};
const soundFailed = new Set();
function playSoundFile(name, volume = 0.5) {
  if (!state.settings.sounds) return;
  const src = SOUND_FILES[name]; if (!src) return;
  if (soundFailed.has(name)) return;
  try {
    if (!soundCache[name]) {
      soundCache[name] = new Audio(src);
      soundCache[name].preload = 'auto';
      soundCache[name].addEventListener('error', () => { soundFailed.add(name); }, { once: true });
    }
    const player = soundCache[name].cloneNode();
    player.volume = volume;
    player.play().catch(() => {});
  } catch (e) {}
}
const Sound = {
  messageIn() { playSoundFile('notification', 0.6); },
  notification() { playSoundFile('notification', 0.6); },
  messageOut() {}, send() {},
  system() { playSoundFile('systemNotification', 0.5); },
  error() { playSoundFile('error', 0.5); },
  callConnect() { playSoundFile('callConnect', 0.6); },
  callStart() { playSoundFile('callStart', 0.7); },
  callEnded() { playSoundFile('callEnded', 0.6); },
  callFailed() { playSoundFile('callFailed', 0.6); },
  connectionLost() { playSoundFile('connectionLost', 0.6); },
  statusSent() { playSoundFile('statusSent', 0.5); },
  statusFailed() { playSoundFile('statusFailed', 0.5); },
  logout() { playSoundFile('logout', 0.5); }
};

async function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isValidUsername(u) { return /^[a-zA-Z][a-zA-Z0-9_]{3,19}$/.test(u); }
function normalizeUsername(u) { return String(u || '').trim().toLowerCase(); }
async function isUsernameTaken(u) {
  const n = normalizeUsername(u);
  const local = loadData(STORAGE_KEYS.users, []);
  if (local.some(x => normalizeUsername(x.flypeId || '') === n)) return true;
  if (window.flypeFirebase) {
    try {
      const { database, ref, get } = window.flypeFirebase;
      const snap = await get(ref(database, 'users'));
      const all = snap.val() || {};
      return Object.values(all).some(x => normalizeUsername(x.flypeId || '') === n);
    } catch (e) {}
  }
  return false;
}

function getLoginBlock() {
  try { const raw = localStorage.getItem(LOGIN_BLOCK_KEY); return raw ? JSON.parse(raw) : { attempts: 0, blockedUntil: 0, blockDuration: 0 }; }
  catch (e) { return { attempts: 0, blockedUntil: 0, blockDuration: 0 }; }
}
function saveLoginBlock(d) { try { localStorage.setItem(LOGIN_BLOCK_KEY, JSON.stringify(d)); } catch (e) {} }
function checkLoginBlock() {
  const b = getLoginBlock(); const now = Date.now();
  if (b.blockedUntil > now) {
    const left = Math.ceil((b.blockedUntil - now)/1000);
    const min = Math.floor(left/60); const sec = left%60;
    return { blocked: true, message: `Подождите ${min > 0 ? min + ' мин ' : ''}${sec} сек.` };
  }
  if (b.blockedUntil > 0 && b.blockedUntil <= now) saveLoginBlock({ attempts: 0, blockedUntil: 0, blockDuration: b.blockDuration });
  return { blocked: false };
}
function registerFailedLogin() {
  const b = getLoginBlock();
  b.attempts += 1;
  if (b.attempts >= 3) { b.blockDuration = b.blockDuration ? b.blockDuration*2 : 60; b.blockedUntil = Date.now() + b.blockDuration*1000; b.attempts = 0; }
  saveLoginBlock(b);
}
function resetLoginBlock() { saveLoginBlock({ attempts: 0, blockedUntil: 0, blockDuration: 0 }); }

async function generateKeyPair() { return await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']); }
async function exportPublicKey(pk) { const e = await crypto.subtle.exportKey('raw', pk); return btoa(String.fromCharCode(...new Uint8Array(e))); }
async function importPublicKey(b64) { const bin = atob(b64); const b = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i); return await crypto.subtle.importKey('raw', b, { name: 'ECDH', namedCurve: 'P-256' }, true, []); }
async function exportPrivateKey(pk) { const e = await crypto.subtle.exportKey('pkcs8', pk); return btoa(String.fromCharCode(...new Uint8Array(e))); }
async function importPrivateKey(b64) { const bin = atob(b64); const b = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i); return await crypto.subtle.importKey('pkcs8', b, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']); }
async function deriveSharedSecret(mp, tp) { return await crypto.subtle.deriveKey({ name: 'ECDH', public: tp }, mp, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
async function encryptMessage(text, key) {
  const e = new TextEncoder(); const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, e.encode(text));
  const c = new Uint8Array(iv.length + enc.byteLength); c.set(iv, 0); c.set(new Uint8Array(enc), iv.length);
  return btoa(String.fromCharCode(...c));
}
async function decryptMessage(b64, key) {
  const c = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  const iv = c.slice(0, 12); const enc = c.slice(12);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, enc);
  return new TextDecoder().decode(dec);
}
async function encryptPrivateKeyWithCode(privateKeyStr, code) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(code), { name: 'PBKDF2' }, false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(privateKeyStr));
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0); combined.set(iv, salt.length); combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}
async function decryptPrivateKeyWithCode(encoded, code) {
  const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const salt = combined.slice(0, 16); const iv = combined.slice(16, 28); const ciphertext = combined.slice(28);
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(code), { name: 'PBKDF2' }, false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
  return new TextDecoder().decode(decrypted);
}

function loadData(key, fallback = []) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } }
function saveData(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {} }

let state = {
  currentUser: null,
  users: [],
  chats: [],
  messages: [],
  statuses: [],
  settings: { darkTheme: false, sounds: true, theme: 'standard', oldFlype: false, ringtone: 'sounds/Flype-Standart.mp3' },
  activeChatId: null,
  activeTab: 'chats',
  searchQuery: '',
  activeApp: 'messenger',
  gosSection: 'dashboard'
};

/* ================== ГОСУСЛУГИ: ДАННЫЕ ================== */
function getGosData() {
  const all = loadData(STORAGE_KEYS.gosData, {});
  return all[state.currentUser ? state.currentUser.id : 'anon'] || {};
}
function saveGosData(data) {
  const all = loadData(STORAGE_KEYS.gosData, {});
  all[state.currentUser ? state.currentUser.id : 'anon'] = data;
  saveData(STORAGE_KEYS.gosData, all);
}

/* ================== ГРАЖДАНИН ФРС ================== */
function isCitizenFRC() { return state.currentUser && state.currentUser.isCitizenFRC === true; }

function applyCitizenMode() {
  const citizen = isCitizenFRC();
  document.body.classList.toggle('citizen-frc', citizen);
  const gosBtn = document.querySelector('.app-rail-btn[data-app="gossuslugi"]');
  const gosMod = document.getElementById('module-gossuslugi');
  if (gosBtn) gosBtn.style.display = citizen ? '' : 'none';
  if (gosMod && !citizen && gosMod.classList.contains('active')) {
    if (window.FlypeShell && window.FlypeShell.switchApp) window.FlypeShell.switchApp('messenger');
  }
  const srg = document.getElementById('settingsRegionGroup');
  if (srg) srg.style.display = citizen ? '' : 'none';
}

async function deleteGosBotChat() {
  if (!state.currentUser) return;
  const chatId = 'chat_gosbot_' + state.currentUser.id;
  state.chats = state.chats.filter(c => c.id !== chatId);
  state.messages = state.messages.filter(m => m.chatId !== chatId);
  persistChats(); persistMessages();
  if (window.flypeFirebase) {
    try {
      const { database, ref, remove, get } = window.flypeFirebase;
      await remove(ref(database, 'chats/' + chatId));
      const ms = await get(ref(database, 'messages'));
      const all = ms.val() || {};
      const tasks = [];
      Object.entries(all).forEach(([id, m]) => { if (m.chatId === chatId) tasks.push(remove(ref(database, 'messages/' + id))); });
      await Promise.all(tasks);
    } catch (e) {}
  }
  if (state.activeChatId === chatId) { state.activeChatId = null; renderActiveChat(); }
  renderChatList();
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
function formatTime(ts) { return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function formatDate(ts) {
  const d = new Date(ts); const n = new Date();
  if (d.toDateString() === n.toDateString()) return 'Сегодня';
  const y = new Date(n); y.setDate(y.getDate()-1);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function formatContactGroup(ts) {
  const d = new Date(ts); const n = new Date();
  if (d.toDateString() === n.toDateString()) return 'Сегодня';
  const y = new Date(n); y.setDate(y.getDate()-1);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  const w = new Date(n); w.setDate(w.getDate()-7);
  if (d >= w) return 'На этой неделе';
  return 'Раньше';
}
function formatFileSize(bytes) { if (bytes < 1024) return bytes + ' Б'; if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' КБ'; return (bytes/1048576).toFixed(1) + ' МБ'; }
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]); }
function initial(name) { return name ? name.trim().charAt(0).toUpperCase() : '?'; }
function senderColor(sid) { let h = 0; for (let i = 0; i < sid.length; i++) h = (h*31 + sid.charCodeAt(i)) % 5; return `color-${Math.abs(h)}`; }
function getTimeAgo(ts) { const d = Date.now() - ts; const m = Math.floor(d/60000); if (m < 1) return 'только что'; if (m < 60) return `${m} мин назад`; const h = Math.floor(m/60); if (h < 24) return `${h} ч назад`; return 'давно'; }
function isUserOnline(u) { if (!u) return false; if (u.isAdmin === true) return true; if (u.isBot === true) return true; if (!u.lastSeen) return false; return (Date.now() - u.lastSeen) < 60000; }

function showToast(title, text, icon = 'fa-comment', duration = 3500) {
  const c = document.getElementById('toastContainer'); if (!c) return;
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<i class="fas ${icon}"></i><div class="toast-text"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 300); }, duration);
}

function getHiddenChats() {
  try { const raw = localStorage.getItem(STORAGE_KEYS.hiddenChats + '_' + (state.currentUser ? state.currentUser.id : 'anon')); return raw ? JSON.parse(raw) : []; }
  catch (e) { return []; }
}
function saveHiddenChats(arr) {
  try { localStorage.setItem(STORAGE_KEYS.hiddenChats + '_' + (state.currentUser ? state.currentUser.id : 'anon'), JSON.stringify(arr)); } catch (e) {}
}
function hideChatForMe(chatId) {
  const h = getHiddenChats();
  if (!h.includes(chatId)) h.push(chatId);
  saveHiddenChats(h);
  state.activeChatId = null;
  document.getElementById('profilePanel').classList.remove('open');
  renderChatList(); renderActiveChat();
  Sound.send();
  showToast('Скрыто', 'Чат удалён только у вас', 'fa-eye-slash', 3000);
}
function unhideChat(chatId) {
  const h = getHiddenChats().filter(id => id !== chatId);
  saveHiddenChats(h);
}

function applyTheme() {
  const themes = ['theme-standard', 'theme-green', 'theme-red', 'theme-blue', 'theme-white', 'theme-orange', 'theme-purple', 'theme-pink', 'theme-turquoise', 'theme-gold'];
  document.body.classList.remove(...themes, 'theme-oldflype');
  const theme = state.settings.theme || 'standard';
  document.body.classList.add('theme-' + theme);
  if (state.settings.oldFlype === true) document.body.classList.add('theme-oldflype');
  document.body.classList.toggle('dark', state.settings.darkTheme === true);
  document.querySelectorAll('.theme-swatch').forEach(sw => { sw.classList.toggle('selected', sw.dataset.theme === theme); });
}
function applySettings() {
  applyTheme();
  const st = document.getElementById('soundToggle'); if (st) st.checked = state.settings.sounds;
  const dt = document.getElementById('darkThemeToggle'); if (dt) dt.checked = state.settings.darkTheme;
  const oft = document.getElementById('oldFlypeToggle'); if (oft) oft.checked = state.settings.oldFlype === true;
  const rt = document.getElementById('ringtoneSelect'); if (rt) rt.value = state.settings.ringtone || 'sounds/Flype-Standart.mp3';
}

function checkAuth() {
  const userId = localStorage.getItem(STORAGE_KEYS.currentUserId);
  if (userId) {
    const users = loadData(STORAGE_KEYS.users, []);
    const user = users.find(u => u.id === userId);
    if (user && user.banned) {
      if (user.bannedUntil === 0 || Date.now() < user.bannedUntil) { showBannedScreen(user); return true; }
      else { user.banned = false; user.bannedUntil = 0; saveData(STORAGE_KEYS.users, users); }
    }
    if (user) { state.currentUser = user; state.users = users; showMainScreen(); return true; }
  }
  showAuthScreen(); return false;
}
function showBannedScreen(user) {
  document.getElementById('authScreen').classList.remove('active');
  document.getElementById('mainScreen').classList.remove('active');
  document.getElementById('maintenanceScreen').classList.remove('active');
  document.getElementById('bannedScreen').classList.add('active');
  document.getElementById('bannedReason').textContent = user.banReason || 'Нарушение правил сообщества.';
  const untilEl = document.getElementById('bannedUntil');
  if (user.bannedUntil === 0) untilEl.textContent = 'Блокировка: навсегда';
  else {
    const dateStr = new Date(user.bannedUntil).toLocaleString('ru-RU');
    const daysLeft = Math.ceil((user.bannedUntil - Date.now())/(24*60*60*1000));
    untilEl.textContent = `Разблокировка: ${dateStr} (осталось ${daysLeft} дн.)`;
  }
}
function showAuthScreen() {
  document.getElementById('maintenanceScreen').classList.remove('active');
  document.getElementById('bannedScreen').classList.remove('active');
  document.getElementById('authScreen').classList.add('active');
  document.getElementById('mainScreen').classList.remove('active');
  const f = document.getElementById('authFooter'); if (f) f.style.display = 'block';
}
function showMaintenanceScreen() {
  document.getElementById('authScreen').classList.remove('active');
  document.getElementById('mainScreen').classList.remove('active');
  document.getElementById('bannedScreen').classList.remove('active');
  document.getElementById('maintenanceScreen').classList.add('active');
}
function showMainScreen() {
  const a = document.getElementById('authScreen');
  a.style.opacity = '0'; a.style.transform = 'scale(0.98)'; a.style.transition = 'opacity 0.3s, transform 0.3s';
  setTimeout(() => {
    a.classList.remove('active');
    a.style.opacity = ''; a.style.transform = ''; a.style.transition = '';
    document.getElementById('maintenanceScreen').classList.remove('active');
    document.getElementById('bannedScreen').classList.remove('active');
    document.getElementById('mainScreen').classList.add('active');
    const f = document.getElementById('authFooter'); if (f) f.style.display = 'none';
    hidePreloader();
    loadState(); renderAll(); listenToUsers(); listenToChats(); listenToCalls();
    listenToMaintenance(); listenToStatuses(); startBanChecker();
    updateSidebarProfile(); updateAdminPanel(); startPresenceHeartbeat();
    listenToSyncRequests(); checkSyncTimer();
    if (state.currentUser) {
      const hour = new Date().getHours();
      let g = 'Добрый день';
      if (hour < 12) g = 'Доброе утро'; else if (hour >= 18) g = 'Добрый вечер';
      setTimeout(() => { Sound.system(); showToast('Flype', `${g}, ${state.currentUser.firstName}!`, 'fa-hand-wave', 4000); }, 600);
      const done = localStorage.getItem(STORAGE_KEYS.tutorialDone + '_' + state.currentUser.id);
      if (!done) setTimeout(() => startTutorial(), 1200);
    }
    applyCitizenMode();
    if (window.FlypeShell && window.FlypeShell.init) window.FlypeShell.init();
  }, 300);
}
function hidePreloader() {
  const pl = document.getElementById('flypePreloader');
  if (pl) { pl.classList.add('hide'); setTimeout(() => pl.remove(), 700); }
}
function updateSidebarProfile() {
  const u = state.currentUser; if (!u) return;
  const name = `${u.firstName} ${u.lastName}`.trim();
  const sn = document.getElementById('sidebarName'); if (sn) sn.textContent = name;
  const sa = document.getElementById('sidebarAvatar');
  if (sa) { if (u.avatar) sa.innerHTML = `<img src="${escapeHtml(u.avatar)}">`; else sa.textContent = initial(name); }
  const st = document.getElementById('sidebarStatus');
  if (st) st.textContent = u.isAdmin ? 'Администратор' : (u.isCitizenFRC ? 'Гражданин ФРС' : 'В сети');
}
function loadState() {
  const userId = state.currentUser.id;
  state.users = loadData(STORAGE_KEYS.users, []);
  state.currentUser = state.users.find(u => u.id === userId) || state.currentUser;
  state.chats = loadData(STORAGE_KEYS.chats, []);
  state.messages = loadData(STORAGE_KEYS.messages, []);
  state.statuses = loadData(STORAGE_KEYS.statuses, []);
  const s = loadData(STORAGE_KEYS.settings, null);
  if (s) state.settings = { ...state.settings, ...s };
  applySettings();
  state.chats = state.chats.filter(c => c.participants.includes(userId));
}
function persistChats() { const all = loadData(STORAGE_KEYS.chats, []); const others = all.filter(c => !c.participants.includes(state.currentUser.id)); saveData(STORAGE_KEYS.chats, [...others, ...state.chats]); }
function persistMessages() { const all = loadData(STORAGE_KEYS.messages, []); const ids = new Set(state.chats.map(c => c.id)); const others = all.filter(m => !ids.has(m.chatId)); saveData(STORAGE_KEYS.messages, [...others, ...state.messages]); }
function persistUsers() { saveData(STORAGE_KEYS.users, state.users); }
function persistStatuses() { const all = loadData(STORAGE_KEYS.statuses, []); const others = all.filter(s => s.userId !== state.currentUser.id); saveData(STORAGE_KEYS.statuses, [...others, ...state.statuses]); }
function persistSettings() { saveData(STORAGE_KEYS.settings, state.settings); }

let presenceInterval = null;
function startPresenceHeartbeat() {
  if (presenceInterval) clearInterval(presenceInterval);
  const update = async () => {
    if (!state.currentUser) return;
    state.currentUser.lastSeen = Date.now();
    const lu = loadData(STORAGE_KEYS.users, []);
    const idx = lu.findIndex(u => u.id === state.currentUser.id);
    if (idx !== -1) { lu[idx] = state.currentUser; saveData(STORAGE_KEYS.users, lu); }
    if (window.flypeFirebase) {
      try { const { database, ref, update: fbU } = window.flypeFirebase; await fbU(ref(database, 'users/' + state.currentUser.id), { lastSeen: state.currentUser.lastSeen }); } catch (e) {}
    }
  };
  update(); presenceInterval = setInterval(update, 30000);
}
function stopPresenceHeartbeat() { if (presenceInterval) { clearInterval(presenceInterval); presenceInterval = null; } }

async function ensureAdminExists() {
  if (!window.flypeFirebase) { setTimeout(ensureAdminExists, 500); return; }
  if (!ADMIN_UID) return;
  try {
    const { database, ref, get, set } = window.flypeFirebase;
    const snap = await get(ref(database, 'users/' + ADMIN_UID));
    if (!snap.exists()) {
      const au = { id: ADMIN_UID, flypeId: ADMIN_USERNAME, email: ADMIN_EMAIL, firstName: ADMIN_FIRSTNAME, lastName: ADMIN_LASTNAME, password: ADMIN_PASSWORD, avatar: '', about: 'Техническая поддержка', online: true, lastSeen: Date.now(), blocked: [], isAdmin: true, idChangedAt: 0, createdAt: Date.now(), banned: false, bannedUntil: 0, isCitizenFRC: false, region: '' };
      try { const kp = await generateKeyPair(); au.publicKey = await exportPublicKey(kp.publicKey); } catch (e) {}
      await set(ref(database, 'users/' + ADMIN_UID), au);
      const lu = loadData(STORAGE_KEYS.users, []);
      if (!lu.find(u => u.id === ADMIN_UID)) { lu.push(au); saveData(STORAGE_KEYS.users, lu); }
    }
  } catch (err) {}
}

let banCheckerInterval = null;
function startBanChecker() {
  if (banCheckerInterval) clearInterval(banCheckerInterval);
  banCheckerInterval = setInterval(async () => {
    if (!window.flypeFirebase || !state.users.length) return;
    const now = Date.now();
    const expired = state.users.filter(u => u.banned && u.bannedUntil > 0 && u.bannedUntil <= now);
    if (expired.length === 0) return;
    const { database, ref, update } = window.flypeFirebase;
    for (const u of expired) {
      try {
        await update(ref(database, 'users/' + u.id), { banned: false, bannedUntil: 0, banReason: '' });
        const lu = loadData(STORAGE_KEYS.users, []);
        const idx = lu.findIndex(x => x.id === u.id);
        if (idx !== -1) { lu[idx].banned = false; lu[idx].bannedUntil = 0; saveData(STORAGE_KEYS.users, lu); }
      } catch (e) {}
    }
  }, 60000);
}

let maintenanceUnsubscribe = null;
function listenToMaintenance() {
  if (!window.flypeFirebase) { setTimeout(listenToMaintenance, 500); return; }
  const { database, ref, onValue } = window.flypeFirebase;
  if (maintenanceUnsubscribe) maintenanceUnsubscribe();
  maintenanceUnsubscribe = onValue(ref(database, 'maintenance'), (snapshot) => {
    const data = snapshot.val() || {};
    const isActive = data.active === true;
    const isAdmin = state.currentUser && state.currentUser.isAdmin === true;
    if (isAdmin) { document.getElementById('maintenanceScreen').classList.remove('active'); if (state.currentUser) document.getElementById('mainScreen').classList.add('active'); return; }
    if (isActive) { showMaintenanceScreen(); const msg = document.getElementById('maintenanceMessage'); if (msg) msg.textContent = data.message || ''; }
    else { document.getElementById('maintenanceScreen').classList.remove('active'); if (state.currentUser) document.getElementById('mainScreen').classList.add('active'); else document.getElementById('authScreen').classList.add('active'); }
  });
}
function updateAdminPanel() {
  const p = document.getElementById('adminPanel'); if (!p) return;
  p.classList.toggle('hidden', !(state.currentUser && state.currentUser.isAdmin === true));
}

let statusesUnsubscribe = null;
function listenToStatuses() {
  if (!window.flypeFirebase) { setTimeout(listenToStatuses, 500); return; }
  const { database, ref, onValue } = window.flypeFirebase;
  if (statusesUnsubscribe) statusesUnsubscribe();
  statusesUnsubscribe = onValue(ref(database, 'statuses'), (snapshot) => {
    const data = snapshot.val() || {};
    const all = Object.values(data);
    const local = loadData(STORAGE_KEYS.statuses, []);
    const merged = [...all];
    local.forEach(ls => { if (!merged.find(s => s.id === ls.id)) merged.push(ls); });
    state.statuses = merged;
    persistStatuses(); renderStatusList();
  });
}

function generateSyncCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = ''; for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
async function requestKeyFromOtherDevice() {
  if (!window.flypeFirebase) { Sound.error(); showToast('Ошибка', 'Firebase не подключён', 'fa-exclamation-circle'); return; }
  const u = state.currentUser; if (!u) return;
  const hasKey = !!localStorage.getItem('flype_private_key_' + u.id);
  const isPrimary = localStorage.getItem('flype_is_primary') === 'true';
  if (hasKey && isPrimary) { showToast('Уже активно', 'Вы на основном устройстве', 'fa-info-circle', 4000); return; }
  const { database, ref, set, onValue } = window.flypeFirebase;
  try {
    await set(ref(database, 'sync_requests/' + u.id), { requestedAt: Date.now(), expiresAt: Date.now() + SYNC_REQUEST_TTL, deviceInfo: navigator.userAgent.substring(0, 80) });
    document.getElementById('syncWaitingOverlay').classList.add('open');
    if (syncKeysListener) syncKeysListener();
    syncKeysListener = onValue(ref(database, 'sync_keys/' + u.id), (snapshot) => {
      const data = snapshot.val();
      if (data && data.expiresAt > Date.now()) {
        document.getElementById('syncWaitingOverlay').classList.remove('open');
        if (syncKeysListener) { syncKeysListener(); syncKeysListener = null; }
        setTimeout(async () => {
          const code = prompt('Введите код с основного устройства:');
          if (code) { try { await tryDecryptSyncKey(data.encryptedKey, code.trim().toUpperCase()); } catch (err) { Sound.error(); } }
        }, 300);
      }
    });
  } catch (err) { Sound.error(); }
}
function listenToSyncRequests() {
  if (!window.flypeFirebase) { setTimeout(listenToSyncRequests, 500); return; }
  const { database, ref, onValue } = window.flypeFirebase;
  const u = state.currentUser; if (!u) return;
  const hasKey = !!localStorage.getItem('flype_private_key_' + u.id);
  const isPrimary = localStorage.getItem('flype_is_primary') === 'true';
  if (!hasKey && !isPrimary) return;
  onValue(ref(database, 'sync_requests/' + u.id), (snapshot) => {
    const data = snapshot.val();
    if (data && data.expiresAt > Date.now()) document.getElementById('syncConfirmOverlay').classList.add('open');
    else document.getElementById('syncConfirmOverlay').classList.remove('open');
  });
}
async function tryDecryptSyncKey(encryptedKey, code) {
  const privateKey = await decryptPrivateKeyWithCode(encryptedKey, code);
  localStorage.setItem('flype_private_key_' + state.currentUser.id, privateKey);
  localStorage.setItem('flype_sync_unlock_until', String(Date.now() + SYNC_UNLOCK_TTL));
  Sound.send();
  showToast('Синхронизировано!', 'Сообщения расшифрованы на 24 часа', 'fa-check-circle', 5000);
  renderMessages(state.activeChatId);
  if (window.flypeFirebase) { try { const { database, ref, remove } = window.flypeFirebase; await remove(ref(database, 'sync_keys/' + state.currentUser.id)); } catch (e) {} }
}
function checkSyncTimer() {
  const until = parseInt(localStorage.getItem('flype_sync_unlock_until') || '0');
  const isPrimary = localStorage.getItem('flype_is_primary') === 'true';
  if (isPrimary) return;
  if (until > 0 && Date.now() >= until && state.currentUser) {
    localStorage.removeItem('flype_private_key_' + state.currentUser.id);
    localStorage.removeItem('flype_sync_unlock_until');
    renderMessages(state.activeChatId);
  }
}
setInterval(checkSyncTimer, 60000);

/* ================== РЕГИСТРАЦИЯ ================== */
async function handleRegister(e) {
  e.preventDefault();
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName = document.getElementById('regLastName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const usernameInput = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const isCitizen = document.getElementById('regCitizenFRC').checked === true;
  const region = isCitizen ? (document.getElementById('regRegion').value || '') : '';
  const birthDate = isCitizen ? (document.getElementById('regBirthDate').value || '') : '';

  let valid = true;
  if (!firstName) { showError('regFirstName', true); valid = false; } else showError('regFirstName', false);
  if (!lastName) { showError('regLastName', true); valid = false; } else showError('regLastName', false);
  const ep = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!ep.test(email)) { showError('regEmail', true); valid = false; } else showError('regEmail', false);
  if (password.length < 6) { showError('regPassword', true); valid = false; } else showError('regPassword', false);
  const uErr = document.getElementById('regUsernameError');
  uErr.classList.remove('visible'); document.getElementById('regUsername').classList.remove('error');
  if (!isValidUsername(usernameInput)) { uErr.textContent = 'Ник: 4–20 символов, латиница/цифры/_, начинается с буквы.'; uErr.classList.add('visible'); document.getElementById('regUsername').classList.add('error'); valid = false; }
  else if (['flype','admin','support','root','system','gosbot'].includes(normalizeUsername(usernameInput))) { uErr.textContent = 'Этот ник зарезервирован.'; uErr.classList.add('visible'); document.getElementById('regUsername').classList.add('error'); valid = false; }
  else { const taken = await isUsernameTaken(usernameInput); if (taken) { uErr.textContent = 'Такой ник уже занят.'; uErr.classList.add('visible'); document.getElementById('regUsername').classList.add('error'); valid = false; } }
  if (!valid) { Sound.error(); return; }

  const flypeId = normalizeUsername(usernameInput);
  let firebaseUser = null;
  if (window.flypeFirebase && window.flypeFirebase.createUserWithEmailAndPassword) {
    try {
      const cred = await window.flypeFirebase.createUserWithEmailAndPassword(window.flypeFirebase.auth, email, password);
      firebaseUser = cred.user;
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') { showError('regEmail', true); document.getElementById('regEmailError').textContent = 'Этот Gmail уже зарегистрирован.'; Sound.error(); return; }
      if (err.code === 'auth/weak-password') { showError('regPassword', true); Sound.error(); return; }
      if (err.code === 'auth/invalid-email') { showError('regEmail', true); Sound.error(); return; }
      Sound.error(); showToast('Ошибка', 'Не удалось создать аккаунт', 'fa-exclamation-circle'); return;
    }
  }
  const isRootAdmin = email === ADMIN_EMAIL;
  const newUser = {
    id: firebaseUser ? firebaseUser.uid : genId(),
    flypeId, firstName, lastName, email, password,
    isCitizenFRC: isCitizen, region: region, birthDate: birthDate,
    avatar: '', about: '', online: true, lastSeen: Date.now(),
    blocked: [], idChangedAt: Date.now(), isAdmin: isRootAdmin,
    banned: false, bannedUntil: 0, banReason: ''
  };
  try {
    const kp = await generateKeyPair();
    newUser.publicKey = await exportPublicKey(kp.publicKey);
    localStorage.setItem('flype_private_key_' + newUser.id, await exportPrivateKey(kp.privateKey));
    localStorage.setItem('flype_is_primary', 'true');
  } catch (err) {}
  const users = loadData(STORAGE_KEYS.users, []);
  users.push(newUser); saveData(STORAGE_KEYS.users, users);
  localStorage.setItem(STORAGE_KEYS.currentUserId, newUser.id);
  state.currentUser = newUser; state.users = users;
  createWelcomeChat(newUser);
  try { if (window.flypeFirebase) { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'users/' + newUser.id), newUser); } } catch (err) {}
  Sound.statusSent();
  showToast('Регистрация успешна!', `Ваш ник: @${flypeId}`, 'fa-check-circle', 5000);

  if (isCitizen) { ensureGosBot().then(() => createGosBotChat(newUser)); }
  setTimeout(() => showMainScreen(), 1500);
}

function createWelcomeChat(user) {
  const botUser = { id: 'flype_bot', flypeId: 'flype', firstName: 'Flype', lastName: 'Команда', password: '', avatar: '', online: true, lastSeen: Date.now(), isBot: true };
  const users = loadData(STORAGE_KEYS.users, []);
  if (!users.find(u => u.id === botUser.id)) { users.push(botUser); saveData(STORAGE_KEYS.users, users); }
  const chatId = 'chat_welcome_' + user.id;
  const chats = loadData(STORAGE_KEYS.chats, []);
  if (!chats.find(c => c.id === chatId)) { chats.push({ id: chatId, type: 'private', participants: [user.id, botUser.id], createdAt: Date.now(), lastMessageAt: Date.now() }); saveData(STORAGE_KEYS.chats, chats); }
  const messages = loadData(STORAGE_KEYS.messages, []);
  if (!messages.find(m => m.chatId === chatId)) {
    const w = [`Привет, ${user.firstName}! 👋 Добро пожаловать в Flype — супер-апп!`, user.isCitizenFRC ? `Ваш регион: ${user.region || 'не указан'}.` : 'Приятного общения!', 'Если нужна помощь — напишите Администратору: @admin001'];
    w.forEach((text, i) => { messages.push({ id: genId(), chatId, senderId: botUser.id, text, timestamp: Date.now() - (w.length - i) * 60000, read: true, type: 'text' }); });
    saveData(STORAGE_KEYS.messages, messages);
  }
}

/* ================== ЛОГИН ================== */
async function handleLogin(e) {
  e.preventDefault();
  const block = checkLoginBlock();
  if (block.blocked) { Sound.error(); showToast('Заблокировано', block.message, 'fa-clock', 5000); return; }
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  let valid = true; const ep = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!ep.test(email)) { showError('loginEmail', true); valid = false; } else showError('loginEmail', false);
  if (password.length < 6) { showError('loginPassword', true); valid = false; } else showError('loginPassword', false);
  if (!valid) { Sound.error(); return; }
  let allUsers = loadData(STORAGE_KEYS.users, []);
  let foundUser = null;
  if (window.flypeFirebase && window.flypeFirebase.signInWithEmailAndPassword) {
    try {
      const cred = await window.flypeFirebase.signInWithEmailAndPassword(window.flypeFirebase.auth, email, password);
      const uid = cred.user.uid;
      const { database, ref, get } = window.flypeFirebase;
      const snap = await get(ref(database, 'users/' + uid));
      if (snap.exists()) foundUser = { id: uid, ...snap.val() };
    } catch (err) {}
  }
  if (!foundUser) foundUser = allUsers.find(u => u.email === email && u.password === password);
  if (!foundUser && window.flypeFirebase) {
    try {
      const { database, ref, get } = window.flypeFirebase;
      const snap = await get(ref(database, 'users'));
      const cloud = snap.val() || {};
      Object.values(cloud).forEach(cu => {
        if (!allUsers.find(u => u.id === cu.id)) allUsers.push(cu);
        else { const i = allUsers.findIndex(u => u.id === cu.id); if (i !== -1) allUsers[i] = { ...allUsers[i], ...cu }; }
      });
      foundUser = allUsers.find(u => u.email === email && u.password === password);
    } catch (err) {}
  }
  if (!foundUser) {
    Sound.error(); registerFailedLogin();
    const b = getLoginBlock();
    if (b.blockedUntil > Date.now()) { const left = Math.ceil((b.blockedUntil - Date.now())/1000); showToast('Заблокировано', `Подождите ${Math.ceil(left/60)} мин.`, 'fa-clock', 5000); }
    else { showToast('Ошибка входа', `Неверный Gmail или пароль.`, 'fa-exclamation-circle'); }
    updateLoginBlockUI(); return;
  }
  if (foundUser.banned) {
    if (foundUser.bannedUntil === 0 || Date.now() < foundUser.bannedUntil) { showBannedScreen(foundUser); return; }
    else { foundUser.banned = false; foundUser.bannedUntil = 0; }
  }
  resetLoginBlock();
  localStorage.setItem(STORAGE_KEYS.currentUserId, foundUser.id);
  state.currentUser = foundUser; state.users = allUsers;
  saveData(STORAGE_KEYS.users, allUsers);
  Sound.statusSent();
  showToast('Добро пожаловать!', `${foundUser.firstName}, рады видеть вас!`, 'fa-check-circle');
  if (foundUser.isCitizenFRC === true) { ensureGosBot().then(() => createGosBotChat(foundUser)); }
  showMainScreen();
}

function showError(id, show) { const i = document.getElementById(id); const e = document.getElementById(id + 'Error'); if (i) i.classList.toggle('error', show); if (e) e.classList.toggle('visible', show); }
async function handleLogout() {
  if (!confirm('Вы уверены, что хотите выйти?')) return;
  Sound.logout();
  if (window.flypeFirebase && window.flypeFirebase.signOut) { try { await window.flypeFirebase.signOut(window.flypeFirebase.auth); } catch (e) {} }
  localStorage.removeItem(STORAGE_KEYS.currentUserId);
  stopPresenceHeartbeat();
  state.currentUser = null; state.activeChatId = null;
  if (messagesUnsubscribe) { messagesUnsubscribe(); messagesUnsubscribe = null; }
  if (callListenerUnsubscribe) { callListenerUnsubscribe(); callListenerUnsubscribe = null; }
  stopRingtone(); showAuthScreen();
  document.getElementById('loginForm').reset();
  document.getElementById('registerForm').reset();
}
function updateLoginBlockUI() {
  const b = checkLoginBlock();
  const btn = document.querySelector('#loginForm button[type=submit]');
  const note = document.getElementById('loginBlockNote');
  if (!btn) return;
  if (b.blocked) { btn.disabled = true; btn.style.opacity = '0.5'; if (note) { note.textContent = b.message; note.style.display = 'block'; } }
  else { btn.disabled = false; btn.style.opacity = '1'; if (note) note.style.display = 'none'; }
}

function listenToUsers() {
  if (!window.flypeFirebase) { setTimeout(listenToUsers, 500); return; }
  const { database, ref, onValue } = window.flypeFirebase;
  onValue(ref(database, 'users'), (snapshot) => {
    const data = snapshot.val() || {};
    const cloud = Object.values(data);
    const cloudIds = new Set(cloud.map(cu => cu.id));
    const local = loadData(STORAGE_KEYS.users, []);
    const fixedIds = new Set(['flype_bot', 'gosbot', ADMIN_UID]);
    const merged = local.filter(u => fixedIds.has(u.id) || cloudIds.has(u.id));
    cloud.forEach(cu => { const idx = merged.findIndex(u => u.id === cu.id); if (idx === -1) merged.push(cu); else merged[idx] = { ...merged[idx], ...cu }; });
    state.users = merged;
    saveData(STORAGE_KEYS.users, merged);
    const me = merged.find(u => u.id === state.currentUser.id);
    if (me && me.banned && (me.bannedUntil === 0 || Date.now() < me.bannedUntil)) showBannedScreen(me);
    renderChatList(); renderActiveChat(); renderStatusList();
    const o = document.getElementById('newChatOverlay');
    if (o && o.classList.contains('open')) renderNewChatResults(document.getElementById('newChatSearch').value);
    const ao = document.getElementById('addMemberOverlay');
    if (ao && ao.classList.contains('open')) renderAddMemberResults(document.getElementById('addMemberSearch').value);
  });
}

let chatsUnsubscribe = null;
function listenToChats() {
  if (!window.flypeFirebase) { setTimeout(listenToChats, 500); return; }
  const { database, ref, onValue, remove } = window.flypeFirebase;
  if (chatsUnsubscribe) chatsUnsubscribe();
  chatsUnsubscribe = onValue(ref(database, 'chats'), async (snapshot) => {
    const data = snapshot.val() || {};
    const allChats = Object.values(data);
    const myChats = allChats.filter(c => c.participants && c.participants.includes(state.currentUser.id));
    const localChats = loadData(STORAGE_KEYS.chats, []).filter(c => c.participants.includes(state.currentUser.id));
    const merged = [...myChats];
    localChats.forEach(lc => { if (!merged.find(c => c.id === lc.id)) merged.push(lc); });
    const seen = new Map(); const unique = []; const toDelete = [];
    merged.forEach(c => {
      if (c.type === 'private' && c.participants && c.participants.length === 2 && !c.isGovChat) {
        const key = [...c.participants].sort().join('|');
        if (seen.has(key)) {
          const existing = seen.get(key);
          if ((c.createdAt || 0) < (existing.createdAt || 0)) { toDelete.push(existing); seen.set(key, c); const idx = unique.indexOf(existing); if (idx !== -1) unique[idx] = c; }
          else { toDelete.push(c); }
        } else { seen.set(key, c); unique.push(c); }
      } else unique.push(c);
    });
    if (toDelete.length > 0 && window.flypeFirebase) { for (const dup of toDelete) { try { await remove(ref(database, 'chats/' + dup.id)); } catch (e) {} } }
    state.chats = unique; persistChats(); renderChatList();
    if (state.activeChatId && !state.chats.find(c => c.id === state.activeChatId)) { state.activeChatId = null; renderActiveChat(); }
  });
}

let messagesUnsubscribe = null;
function listenToMessages(chatId) {
  if (!window.flypeFirebase) { setTimeout(() => listenToMessages(chatId), 500); return; }
  const { database, ref, onValue, update } = window.flypeFirebase;
  if (messagesUnsubscribe) { messagesUnsubscribe(); messagesUnsubscribe = null; }
  messagesUnsubscribe = onValue(ref(database, 'messages'), (snapshot) => {
    const data = snapshot.val() || {};
    const all = Object.entries(data).map(([id, m]) => ({ id, ...m }));
    const chatMessages = all.filter(m => m.chatId === chatId).sort((a, b) => a.timestamp - b.timestamp);
    state.messages = state.messages.filter(m => m.chatId !== chatId);
    state.messages.push(...chatMessages);
    const newInc = chatMessages.filter(m => m.senderId !== state.currentUser.id && !m.read && m.timestamp > (window.__lastMsgTs || 0));
    if (newInc.length > 0) { window.__lastMsgTs = Date.now(); if (state.activeChatId !== chatId) Sound.messageIn(); }
    if (state.activeChatId === chatId) renderMessages(chatId);
    renderChatList();
    chatMessages.forEach(m => { if (m.senderId !== state.currentUser.id && !m.read) { m.read = true; update(ref(database, 'messages/' + m.id), { read: true }).catch(() => {}); } });
  });
}

let currentCall = null, callListenerUnsubscribe = null, ringtoneAudio = null, outgoingCallTimer = null, outgoingCallRef = null, outgoingCallTimerInterval = null;
function startRingtone() { stopRingtone(); if (!state.settings.sounds) return; try { const src = state.settings.ringtone || SOUND_FILES.ringtone; ringtoneAudio = new Audio(src); ringtoneAudio.loop = true; ringtoneAudio.volume = 0.7; ringtoneAudio.play().catch(() => {}); } catch (e) {} }
function stopRingtone() { if (ringtoneAudio) { try { ringtoneAudio.pause(); ringtoneAudio.currentTime = 0; } catch (e) {} ringtoneAudio = null; } }
function listenToCalls() {
  if (!window.flypeFirebase) { setTimeout(listenToCalls, 500); return; }
  const { database, ref, onValue, remove } = window.flypeFirebase;
  if (callListenerUnsubscribe) callListenerUnsubscribe();
  callListenerUnsubscribe = onValue(ref(database, 'calls'), (snapshot) => {
    const data = snapshot.val() || {};
    const allCalls = Object.entries(data).map(([id, c]) => ({ id, ...c }));
    const myCall = allCalls.find(c => c.toId === state.currentUser.id && c.status === 'ringing' && Date.now() - c.timestamp < 30000);
    if (myCall) { if (!currentCall || currentCall.id !== myCall.id) { currentCall = myCall; showIncomingCall(myCall); } }
    else if (currentCall && currentCall.toId === state.currentUser.id) { hideIncomingCall(); currentCall = null; }
    if (outgoingCallRef) {
      const myOut = allCalls.find(c => c.id === outgoingCallRef);
      if (myOut && myOut.status !== 'ringing') {
        if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
        hideOutgoingCall();
        if (myOut.status === 'accepted') { Sound.callStart(); showToast('Принято', 'Соединяем...', 'fa-phone', 2000); openJitsiTab(myOut.type === 'video', myOut.chatId); }
        else if (myOut.status === 'rejected') { Sound.callFailed(); showToast('Отклонено', '', 'fa-phone-slash', 3000); }
        else if (myOut.status === 'missed') { Sound.callFailed(); showToast('Пропущенный', '', 'fa-phone-slash', 3000); }
        remove(ref(database, 'calls/' + myOut.id)).catch(() => {});
        outgoingCallRef = null;
      }
    }
    allCalls.forEach(c => { if (Date.now() - c.timestamp > 60000) remove(ref(database, 'calls/' + c.id)).catch(() => {}); });
  });
}
function showIncomingCall(call) {
  const caller = state.users.find(u => u.id === call.fromId);
  const name = caller ? `${caller.firstName} ${caller.lastName}`.trim() : 'Неизвестный';
  document.getElementById('incomingCallName').textContent = name;
  document.getElementById('incomingCallType').textContent = call.type === 'video' ? 'Входящий видеозвонок...' : 'Входящий звонок...';
  const av = document.getElementById('incomingCallAvatar');
  if (caller && caller.avatar) av.innerHTML = `<img src="${escapeHtml(caller.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  else av.textContent = initial(name);
  document.getElementById('incomingCallOverlay').classList.add('open');
  startRingtone();
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
}
function hideIncomingCall() { document.getElementById('incomingCallOverlay').classList.remove('open'); stopRingtone(); }
async function startCall(chatId, isVideo) {
  if (!window.flypeFirebase) { Sound.error(); showToast('Ошибка', 'Firebase не подключён', 'fa-exclamation-circle'); return; }
  const chat = state.chats.find(c => c.id === chatId); if (!chat) return;
  if (chat.isGovChat) { Sound.error(); showToast('Недоступно', 'Звонки в чате с ботом отключены', 'fa-ban', 3000); return; }
  const otherId = chat.participants.find(p => p !== state.currentUser.id); if (!otherId) return;
  const other = state.users.find(u => u.id === otherId);
  const otherName = other ? `${other.firstName} ${other.lastName}`.trim() : 'Неизвестный';
  const callData = { chatId, fromId: state.currentUser.id, toId: otherId, type: isVideo ? 'video' : 'audio', status: 'ringing', timestamp: Date.now() };
  const { database, ref, push, set } = window.flypeFirebase;
  const callRef = push(ref(database, 'calls')); await set(callRef, callData); outgoingCallRef = callRef.key;
  showOutgoingCall(otherName, isVideo); Sound.callConnect();
  let callSeconds = 0; const timerEl = document.getElementById('outgoingCallTimer');
  if (outgoingCallTimerInterval) clearInterval(outgoingCallTimerInterval);
  outgoingCallTimerInterval = setInterval(() => { callSeconds++; const m = Math.floor(callSeconds/60), s = callSeconds%60; if (timerEl) timerEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }, 1000);
  outgoingCallTimer = setTimeout(async () => { const { get, update } = window.flypeFirebase; const snap = await get(ref(database, 'calls/' + callRef.key)); const call = snap.val(); if (call && call.status === 'ringing') await update(ref(database, 'calls/' + callRef.key), { status: 'missed' }); }, 30000);
}
function showOutgoingCall(name, isVideo) {
  document.getElementById('outgoingCallName').textContent = name;
  document.getElementById('outgoingCallType').textContent = isVideo ? 'Видеозвонок...' : 'Вызов...';
  document.getElementById('outgoingCallTimer').textContent = '00:00';
  const av = document.getElementById('outgoingCallAvatar');
  const chat = state.chats.find(c => c.id === state.activeChatId);
  const other = chat ? state.users.find(u => u.id === chat.participants.find(p => p !== state.currentUser.id)) : null;
  if (other && other.avatar) av.innerHTML = `<img src="${escapeHtml(other.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  else av.textContent = initial(name);
  document.getElementById('outgoingCallOverlay').classList.add('open');
}
function hideOutgoingCall() { document.getElementById('outgoingCallOverlay').classList.remove('open'); if (outgoingCallTimerInterval) { clearInterval(outgoingCallTimerInterval); outgoingCallTimerInterval = null; } }
async function cancelCall() {
  if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
  if (outgoingCallTimerInterval) { clearInterval(outgoingCallTimerInterval); outgoingCallTimerInterval = null; }
  if (outgoingCallRef && window.flypeFirebase) { try { const { database, ref, remove } = window.flypeFirebase; await remove(ref(database, 'calls/' + outgoingCallRef)); } catch (e) {} outgoingCallRef = null; }
  hideOutgoingCall(); Sound.callFailed(); showToast('Вызов отменён', '', 'fa-phone-slash', 2000);
}
async function acceptCall() {
  if (!currentCall) return;
  const { database, ref, update } = window.flypeFirebase;
  await update(ref(database, 'calls/' + currentCall.id), { status: 'accepted' });
  const call = currentCall; hideIncomingCall(); hideOutgoingCall();
  Sound.callStart(); openJitsiTab(call.type === 'video', call.chatId); currentCall = null;
}
async function rejectCall() {
  if (!currentCall) return;
  const { database, ref, update } = window.flypeFirebase;
  await update(ref(database, 'calls/' + currentCall.id), { status: 'rejected' });
  hideIncomingCall(); currentCall = null;
}
function openJitsiTab(isVideo, chatId) {
  const id = chatId || state.activeChatId; if (!id) return;
  const chat = state.chats.find(c => c.id === id); if (!chat || chat.isGovChat) return;
  const roomName = 'flype-' + chat.id;
  const userName = encodeURIComponent(`${state.currentUser.firstName} ${state.currentUser.lastName}`.trim());
  const params = [`userInfo.displayName="${userName}"`, `config.prejoinPageEnabled=false`, `config.startWithVideoMuted=${!isVideo}`, `config.startWithAudioMuted=false`].join('&');
  window.open(`https://${JITSI_DOMAIN}/${roomName}#${params}`, '_blank');
  showToast('Звонок открыт', 'Ссылка в новой вкладке', 'fa-external-link-alt', 3000);
  Sound.callEnded();
}

function renderAll() { renderChatList(); renderStatusList(); renderActiveChat(); updateSidebarProfile(); updateAdminPanel(); }

function isBlockedChat(chat) {
  if (!chat || chat.type !== 'private') return false;
  const oid = chat.participants.find(p => p !== state.currentUser.id);
  return state.currentUser.blocked && state.currentUser.blocked.includes(oid);
}
function renderChatList() {
  const c = document.getElementById('chatList'); if (!c) return;
  const hidden = getHiddenChats();
  const citizen = isCitizenFRC();
  let chats = state.chats.filter(x => !hidden.includes(x.id));
  chats = chats.filter(x => !x.isGovChat || citizen);
  const q = state.searchQuery.toLowerCase();
  if (q) chats = chats.filter(x => getChatInfo(x).name.toLowerCase().includes(q));
  chats.sort((a, b) => (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt));
  if (chats.length === 0) { c.innerHTML = `<div style="padding:20px 16px;text-align:center;color:var(--text-secondary);font-size:12.5px;">Нет чатов.<br>Нажмите «Новый» или «Группа».</div>`; return; }
  const groups = {}; chats.forEach(x => { const k = formatContactGroup(x.lastMessageAt || x.createdAt); if (!groups[k]) groups[k] = []; groups[k].push(x); });
  const order = ['Сегодня', 'Вчера', 'На этой неделе', 'Раньше']; let html = '';
  order.forEach(key => {
    if (!groups[key]) return;
    html += `<div class="contacts-group-title">${key}</div>`;
    html += groups[key].map(chat => {
      const info = getChatInfo(chat);
      const lastMsg = getLastMessage(chat.id);
      const unread = getUnreadCount(chat.id);
      const isActive = chat.id === state.activeChatId;
      const lastText = lastMsg ? getMessagePreview(lastMsg) : 'Нет сообщений';
      const lastTime = lastMsg ? formatTime(lastMsg.timestamp) : '';
      const online = chat.type === 'private' && isUserOnline(state.users.find(u => u.id === chat.participants.find(p => p !== state.currentUser.id)));
      const isGov = chat.isGovChat === true;
      return `<div class="chat-item ${isActive ? 'active' : ''}" data-chat-id="${chat.id}"><div class="avatar">${info.avatar ? `<img src="${escapeHtml(info.avatar)}">` : (isGov ? '<i class="fas fa-landmark"></i>' : initial(info.name))}${online ? '<span class="online-dot"></span>' : ''}</div><div class="chat-info"><div class="name">${escapeHtml(info.name)}${isGov ? ' <i class="fas fa-check-circle" style="color:var(--accent);font-size:10px;"></i>' : ''}${isBlockedChat(chat) ? ' <i class="fas fa-ban" style="color:var(--danger);font-size:10px;"></i>' : ''}${info.isAdmin ? ' <i class="fas fa-shield-alt" style="color:var(--accent);font-size:10px;"></i>' : ''}</div><div class="last-msg">${escapeHtml(lastText)}</div></div><div class="chat-meta"><span class="time">${lastTime}</span>${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}</div></div>`;
    }).join('');
  });
  c.innerHTML = html;
  c.querySelectorAll('.chat-item').forEach(el => el.addEventListener('click', () => {
    state.activeChatId = el.dataset.chatId; renderAll(); listenToMessages(state.activeChatId);
    if (window.innerWidth <= 900) document.getElementById('sidebar').classList.add('hidden');
  }));
}
function getChatInfo(chat) {
  if (!chat) return { name: 'Чат', avatar: '', online: false };
  if (chat.type === 'group') return { name: chat.name || 'Группа', avatar: chat.avatar || '', online: false };
  const oid = chat.participants.find(p => p !== state.currentUser.id);
  const other = state.users.find(u => u.id === oid);
  if (other) {
    const name = other.id === 'gosbot' ? '🏛️ ' + `${other.firstName} ${other.lastName}`.trim() : `${other.firstName} ${other.lastName}`.trim();
    return { name, avatar: other.avatar || '', online: isUserOnline(other), flypeId: other.flypeId, isAdmin: other.isAdmin === true, isBot: other.isBot === true };
  }
  return { name: 'Пользователь', avatar: '', online: false, flypeId: '—' };
}
function getLastMessage(chatId) { const msgs = state.messages.filter(m => m.chatId === chatId); if (msgs.length === 0) return null; return msgs.sort((a, b) => b.timestamp - a.timestamp)[0]; }
function getUnreadCount(chatId) { return state.messages.filter(m => m.chatId === chatId && m.senderId !== state.currentUser.id && !m.read).length; }
function getMessagePreview(msg) {
  if (msg.type === 'image') return '📷 Фото';
  if (msg.type === 'file') return `📎 ${msg.fileName || 'Файл'}`;
  if (msg.type === 'report') return '🚩 Жалоба';
  if (msg.type === 'emergency') return '🚨 ' + (msg.text || '').split('\n')[0];
  if (msg.type === 'tax') return '💰 Налог';
  if (msg.type === 'election') return '🗳️ Выборы';
  if (msg.type === 'announcement') return '📢 Объявление';
  if (msg.encrypted) return '🔒 Сообщение';
  return msg.text || '';
}

function renderActiveChat() {
  const emptyChat = document.getElementById('emptyChat');
  const chatHeader = document.getElementById('chatHeader');
  const messagesContainer = document.getElementById('messagesContainer');
  const chatInputArea = document.getElementById('chatInputArea');
  const typingIndicator = document.getElementById('typingIndicator');
  const groupBar = document.getElementById('groupMembersBar');
  const oldPanel = document.querySelector('.gosbot-admin-panel'); if (oldPanel) oldPanel.remove();
  document.body.classList.remove('gov-chat-open');
  if (!state.activeChatId) {
    emptyChat.classList.remove('hidden'); chatHeader.classList.add('hidden');
    messagesContainer.classList.add('hidden'); chatInputArea.classList.add('hidden');
    typingIndicator.classList.add('hidden'); groupBar.classList.add('hidden');
    return;
  }
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat) { state.activeChatId = null; renderActiveChat(); return; }
  emptyChat.classList.add('hidden'); chatHeader.classList.remove('hidden');
  messagesContainer.classList.remove('hidden'); chatInputArea.classList.remove('hidden');
  const isGovChat = chat.isGovChat === true;
  if (isGovChat) document.body.classList.add('gov-chat-open');
  const info = getChatInfo(chat);
  document.getElementById('chatHeaderName').textContent = info.name;
  const statusEl = document.getElementById('chatHeaderStatus');
  if (isGovChat) { statusEl.textContent = 'Бот Госуслуг ФРС'; statusEl.className = 'status online'; }
  else if (chat.type === 'group') { statusEl.textContent = `${chat.participants.length} участников`; statusEl.className = 'status'; }
  else if (info.online) { statusEl.textContent = 'В сети'; statusEl.className = 'status online'; }
  else { statusEl.textContent = 'Был(а) недавно'; statusEl.className = 'status'; }
  const ae = document.getElementById('chatHeaderAvatar');
  if (info.avatar) ae.innerHTML = `<img src="${escapeHtml(info.avatar)}">`;
  else if (isGovChat) ae.innerHTML = '<i class="fas fa-landmark"></i>';
  else ae.textContent = initial(info.name);
  if (chat.type === 'group') {
    groupBar.classList.remove('hidden');
    groupBar.innerHTML = chat.participants.map(uid => {
      const u = state.users.find(x => x.id === uid); if (!u) return '';
      const n = `${u.firstName} ${u.lastName}`.trim(); const sn = u.firstName || n;
      return `<div class="group-member"><i class="fas fa-check-circle"></i><div class="avatar sm">${u.avatar ? `<img src="${escapeHtml(u.avatar)}">` : initial(n)}</div><span>${escapeHtml(sn)}</span></div>`;
    }).join('');
  } else groupBar.classList.add('hidden');
  let changed = false;
  state.messages.forEach(m => { if (m.chatId === chat.id && m.senderId !== state.currentUser.id && !m.read) { m.read = true; changed = true; } });
  if (changed) persistMessages();
  listenToMessages(chat.id); renderMessages(chat.id); renderChatList();
  if (isGovChat && state.currentUser.isAdmin) {
    const panelHtml = renderGosBotAdminPanel(chat.id);
    if (panelHtml) document.getElementById('chatInputArea').insertAdjacentHTML('beforebegin', panelHtml);
  }
}

let chatSearchQuery = '';
async function renderMessages(chatId) {
  const c = document.getElementById('messagesContainer'); if (!c) return;
  const hk = 'flype_hidden_msgs_' + state.currentUser.id;
  const hidden = loadData(hk, []);
  const blocked = state.currentUser.blocked || [];
  let msgs = state.messages.filter(m => { if (m.chatId !== chatId) return false; if (hidden.includes(m.id)) return false; if (blocked.includes(m.senderId)) return false; return true; }).sort((a, b) => a.timestamp - b.timestamp);
  if (chatSearchQuery) msgs = msgs.filter(m => { if (m.encrypted) return false; return (m.text || '').toLowerCase().includes(chatSearchQuery); });
  if (msgs.length === 0) { c.innerHTML = `<div style="text-align:center;color:var(--text-secondary);font-size:13px;padding:30px 0;">${chatSearchQuery ? 'Ничего не найдено' : 'Нет сообщений. Начните общение!'}</div>`; return; }
  let html = ''; let ld = '';
  for (const msg of msgs) { const md = formatDate(msg.timestamp); if (md !== ld) { html += `<div style="text-align:center;font-size:11px;color:var(--text-muted);margin:10px 0 4px;">${md}</div>`; ld = md; } html += await renderMessageBubble(msg, chatId); }
  c.innerHTML = html; c.scrollTop = c.scrollHeight;
  c.querySelectorAll('.message-row').forEach((r, i) => { r.style.animationDelay = (Math.min(i, 20) * 0.03) + 's'; });
  c.querySelectorAll('.msg-image').forEach(img => img.addEventListener('click', (e) => { e.stopPropagation(); const lb = document.getElementById('lightboxOverlay'); const li = document.getElementById('lightboxImg'); const dl = document.getElementById('lightboxDownload'); li.src = img.src; dl.href = img.src; dl.download = 'flype-photo-' + Date.now() + '.jpg'; lb.classList.add('open'); }));
  c.querySelectorAll('.message-bubble').forEach((bubble, i) => {
    const msg = msgs[i]; if (!msg) return;
    bubble.addEventListener('contextmenu', (e) => { e.preventDefault(); showMessageMenu(e.clientX, e.clientY, msg, chatId); });
    let pt = null;
    bubble.addEventListener('touchstart', (e) => { pt = setTimeout(() => { const t = e.touches[0]; showMessageMenu(t.clientX, t.clientY, msg, chatId); if (navigator.vibrate) navigator.vibrate(30); }, 500); }, { passive: true });
    bubble.addEventListener('touchend', () => clearTimeout(pt));
    bubble.addEventListener('touchmove', () => clearTimeout(pt));
  });
  c.querySelectorAll('.admin-action-btn').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); openAdminActionsByReport(btn.dataset.reportId, btn.dataset.action); }));
  c.querySelectorAll('.reaction-badge').forEach(badge => { badge.addEventListener('click', (e) => { e.stopPropagation(); toggleReaction(badge.dataset.msgId, badge.dataset.chatId, badge.dataset.reaction); }); });
}
async function renderMessageBubble(msg, chatId) {
  const isOut = msg.senderId === state.currentUser.id;
  const chat = state.chats.find(c => c.id === chatId);
  const sender = state.users.find(u => u.id === msg.senderId);
  const senderName = sender ? `${sender.firstName} ${sender.lastName}` : 'Неизвестный';
  let displayText = msg.text;
  if (msg.encrypted && msg.type === 'text') {
    try {
      const oid = chat.participants.find(p => p !== state.currentUser.id);
      const other = state.users.find(u => u.id === oid);
      if (other && other.publicKey) {
        const myPr = localStorage.getItem('flype_private_key_' + state.currentUser.id);
        if (myPr) { const mp = await importPrivateKey(myPr); const tp = await importPublicKey(other.publicKey); const sk = await deriveSharedSecret(mp, tp); displayText = await decryptMessage(msg.text, sk); }
        else { displayText = '🔒 Ключ не найден'; }
      }
    } catch (err) { displayText = '🔒 Не удалось расшифровать'; }
  }
  let content = '';
  if (msg.type === 'image') content = `<div>${escapeHtml(msg.text || '')}</div><img class="msg-image" src="${msg.imageUrl}">`;
  else if (msg.type === 'file') content = `<div class="file-attach"><i class="fas fa-file"></i><div style="flex:1;min-width:0;"><div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(msg.fileName)}</div><div style="font-size:11px;opacity:0.7;">${formatFileSize(msg.fileSize || 0)}</div></div></div>`;
  else if (msg.type === 'report') { content = `<div style="white-space:pre-wrap;">${escapeHtml(msg.text || '')}</div>`; if (msg.evidence) content += `<div class="file-attach" style="margin-top:8px;"><i class="fas fa-paperclip"></i><div style="flex:1;min-width:0;"><div style="font-weight:500;">${escapeHtml(msg.evidence.name)}</div></div></div>`; }
  else content = `<div style="white-space:pre-wrap;">${escapeHtml(displayText || '')}</div>`;
  let checks = ''; if (isOut) checks = msg.read ? '<span class="checks"><i class="fas fa-check-double" style="color:var(--accent);"></i></span>' : '<span class="checks"><i class="fas fa-check" style="color:var(--text-muted);"></i></span>';
  let senderHtml = ''; if (chat && chat.type === 'group' && !isOut) { const cc = senderColor(msg.senderId); senderHtml = `<div class="sender-name ${cc}">${escapeHtml(senderName)}${sender && sender.isAdmin ? ' <i class="fas fa-shield-alt" style="font-size:9px;"></i>' : ''}</div>`; }
  const lockIcon = msg.encrypted ? '<span class="encrypted-badge" title="E2E"><i class="fas fa-lock"></i></span>' : '';
  let reactionsHtml = '';
  if (msg.reactions && Object.keys(msg.reactions).length > 0) {
    const grouped = {};
    Object.entries(msg.reactions).forEach(([uid, emoji]) => { if (!grouped[emoji]) grouped[emoji] = []; grouped[emoji].push(uid); });
    reactionsHtml = '<div class="reactions">' + Object.entries(grouped).map(([emoji, users]) => { const mine = users.includes(state.currentUser.id); return `<span class="reaction-badge ${mine ? 'mine' : ''}" data-reaction="${emoji}" data-msg-id="${msg.id}" data-chat-id="${chatId}">${emoji} <span class="count">${users.length}</span></span>`; }).join('') + '</div>';
  }
  let adminButtons = '';
  if (msg.type === 'report' && state.currentUser.isAdmin === true) { adminButtons = `<div class="admin-actions-row"><button class="admin-action-btn warn" data-report-id="${msg.reportId}" data-action="warn"><i class="fas fa-exclamation-triangle"></i> Предупр.</button><button class="admin-action-btn temp-ban" data-report-id="${msg.reportId}" data-action="temp-ban"><i class="fas fa-clock"></i> Забанить</button><button class="admin-action-btn perm-ban" data-report-id="${msg.reportId}" data-action="perm-ban"><i class="fas fa-user-times"></i> Удалить</button></div>`; }
  let bc = 'message-bubble';
  if (msg.type === 'report') bc += ' report-message';
  if (msg.type === 'emergency') bc += ' emergency-bubble';
  if (msg.type === 'tax') bc += ' tax-bubble';
  if (msg.type === 'election') bc += ' election-bubble';
  if (msg.type === 'announcement') bc += ' announce-bubble';
  let govButtons = '';
  if (msg.type === 'tax' && msg.meta && msg.meta.taxId) govButtons = `<button class="gov-action-btn pay pay-tax-btn" data-tax-id="${msg.meta.taxId}">💳 Оплатить</button>`;
  if (msg.type === 'election' && msg.meta && msg.meta.candidates) govButtons = '<div style="margin-top:8px;">' + msg.meta.candidates.map(c => `<button class="gov-action-btn vote vote-btn" data-election="${msg.meta.electionId}" data-candidate="${c.id}">🗳️ ${escapeHtml(c.name)}</button>`).join('') + '</div>';
  const editedMark = msg.editedAt ? '<span class="msg-edited">(изменено)</span>' : '';
  return `<div class="message-row ${isOut ? 'out' : 'in'}"><div class="${bc}">${senderHtml}${content}${govButtons}${reactionsHtml}${adminButtons}<div class="msg-time">${lockIcon}${formatTime(msg.timestamp)}${editedMark} ${checks}</div></div></div>`;
}

function showMessageMenu(x, y, msg, chatId) {
  const old = document.getElementById('msgMenu'); if (old) old.remove();
  const menu = document.createElement('div'); menu.id = 'msgMenu';
  menu.style.cssText = 'position:fixed;background:var(--white);border-radius:var(--radius);box-shadow:var(--shadow-lg);padding:4px 0;z-index:1500;min-width:190px;border:1px solid var(--border);';
  menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 320) + 'px';
  const isMine = msg.senderId === state.currentUser.id;
  const reactionsHtml = ['❤️','👍','😂','😮','😢','🔥'].map(e => `<button data-reaction="${e}" style="font-size:18px;padding:4px 8px;border:none;background:transparent;cursor:pointer;">${e}</button>`).join('');
  menu.innerHTML = `<div style="display:flex;gap:2px;padding:6px 8px;border-bottom:1px solid var(--border-light);">${reactionsHtml}</div>
    <button data-action="copy" style="display:flex;align-items:center;gap:10px;width:100%;padding:9px 16px;border:none;background:transparent;font-family:var(--font);font-size:13px;color:var(--text);cursor:pointer;text-align:left;"><i class="fas fa-copy"></i> Копировать</button>
    ${isMine && msg.type === 'text' && !msg.encrypted ? `<button data-action="edit" style="display:flex;align-items:center;gap:10px;width:100%;padding:9px 16px;border:none;background:transparent;font-family:var(--font);font-size:13px;color:var(--text);cursor:pointer;text-align:left;"><i class="fas fa-pencil-alt"></i> Редактировать</button>` : ''}
    ${isMine ? `<button data-action="delete-all" style="display:flex;align-items:center;gap:10px;width:100%;padding:9px 16px;border:none;background:transparent;font-family:var(--font);font-size:13px;color:var(--danger);cursor:pointer;text-align:left;"><i class="fas fa-trash-alt" style="color:var(--danger);"></i> Удалить у всех</button>` : ''}
    <button data-action="delete-me" style="display:flex;align-items:center;gap:10px;width:100%;padding:9px 16px;border:none;background:transparent;font-family:var(--font);font-size:13px;color:var(--danger);cursor:pointer;text-align:left;"><i class="fas fa-eye-slash" style="color:var(--danger);"></i> Удалить у себя</button>
    <button data-action="close" style="display:flex;align-items:center;gap:10px;width:100%;padding:9px 16px;border:none;background:transparent;font-family:var(--font);font-size:13px;color:var(--text);cursor:pointer;text-align:left;"><i class="fas fa-times"></i> Отмена</button>`;
  document.body.appendChild(menu);
  menu.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const reaction = btn.dataset.reaction; const action = btn.dataset.action; menu.remove();
      if (reaction) { await toggleReaction(msg.id, chatId, reaction); return; }
      if (action === 'copy') { const text = msg.encrypted ? '🔒 Зашифрованное' : (msg.text || ''); if (text) navigator.clipboard?.writeText(text).then(() => showToast('Скопировано', '', 'fa-copy', 1500)).catch(() => {}); }
      else if (action === 'edit') { openEditMessage(msg, chatId); }
      else if (action === 'delete-all') { await deleteMessageForAll(msg.id, chatId); }
      else if (action === 'delete-me') { hideMessageForMe(msg.id, chatId); }
    });
  });
  setTimeout(() => { const ch = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', ch); } }; document.addEventListener('click', ch); }, 50);
}
async function toggleReaction(msgId, chatId, emoji) {
  if (!window.flypeFirebase) return;
  const { database, ref, get, update } = window.flypeFirebase;
  try {
    const snap = await get(ref(database, 'messages/' + msgId));
    if (!snap.exists()) return;
    const msg = snap.val(); const reactions = msg.reactions || {}; const myId = state.currentUser.id;
    if (reactions[myId] === emoji) delete reactions[myId]; else reactions[myId] = emoji;
    await update(ref(database, 'messages/' + msgId), { reactions });
    const local = state.messages.find(m => m.id === msgId); if (local) local.reactions = reactions;
    Sound.send(); renderMessages(chatId);
  } catch (err) {}
}
let editingMsgId = null, editingChatId = null;
function openEditMessage(msg, chatId) {
  if (msg.encrypted) { showToast('Недоступно', '', 'fa-lock', 3000); return; }
  editingMsgId = msg.id; editingChatId = chatId;
  document.getElementById('editMessageText').value = msg.text || '';
  document.getElementById('editMessageOverlay').classList.add('open');
  setTimeout(() => document.getElementById('editMessageText').focus(), 100);
}
function hideMessageForMe(msgId, chatId) {
  const hk = 'flype_hidden_msgs_' + state.currentUser.id;
  const h = loadData(hk, []); if (!h.includes(msgId)) { h.push(msgId); saveData(hk, h); }
  renderMessages(chatId); renderChatList(); Sound.send(); showToast('Удалено', 'Скрыто у вас', 'fa-eye-slash', 2000);
}
async function deleteMessageForAll(msgId, chatId) {
  if (!confirm('Удалить это сообщение у всех?')) return;
  try {
    if (window.flypeFirebase) {
      const { database, ref, remove, get, update } = window.flypeFirebase;
      await remove(ref(database, 'messages/' + msgId));
      const snap = await get(ref(database, 'messages')); const all = snap.val() || {};
      const cm = Object.entries(all).map(([id, m]) => ({ id, ...m })).filter(m => m.chatId === chatId).sort((a, b) => a.timestamp - b.timestamp);
      const last = cm[cm.length - 1];
      const cu = last ? { lastMessageAt: last.timestamp, lastMessage: getMessagePreview(last) } : { lastMessageAt: 0, lastMessage: '' };
      await update(ref(database, 'chats/' + chatId), cu);
    }
    state.messages = state.messages.filter(m => m.id !== msgId);
    persistMessages(); renderMessages(chatId); renderChatList();
    Sound.send(); showToast('Удалено', 'Удалено у всех', 'fa-trash-alt', 2500);
  } catch (err) { Sound.error(); }
}

async function exportChat(chatId) {
  const chat = state.chats.find(c => c.id === chatId); if (!chat) return;
  const info = getChatInfo(chat);
  const msgs = state.messages.filter(m => m.chatId === chatId).sort((a, b) => a.timestamp - b.timestamp);
  let text = `=== Экспорт чата Flype ===\nЧат: ${info.name}\nДата: ${new Date().toLocaleString('ru-RU')}\nСообщений: ${msgs.length}\n=========================\n\n`;
  for (const m of msgs) {
    const sender = state.users.find(u => u.id === m.senderId);
    const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() : 'Неизвестный';
    const time = new Date(m.timestamp).toLocaleString('ru-RU');
    let msgText = m.text;
    if (m.encrypted && m.type === 'text') msgText = '[Зашифрованное]';
    else if (m.type === 'image') msgText = `[Фото]`;
    else if (m.type === 'file') msgText = `[Файл] ${m.fileName || ''}`;
    text += `[${time}] ${senderName}:\n${msgText}\n\n`;
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `flype-chat-${info.name.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.txt`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  Sound.send(); showToast('Экспортировано', 'Файл скачан', 'fa-download', 3000);
}

function renderStatusList() {
  const c = document.getElementById('statusList'); if (!c) return;
  const now = Date.now(); const day = 86400000;
  let statuses = state.statuses.filter(s => now - s.timestamp < day);
  const byUser = {}; statuses.forEach(s => { if (!byUser[s.userId] || s.timestamp > byUser[s.userId].timestamp) byUser[s.userId] = s; });
  statuses = Object.values(byUser).sort((a, b) => b.timestamp - a.timestamp);
  if (statuses.length === 0) { c.innerHTML = `<div style="padding:20px 16px;text-align:center;color:var(--text-secondary);font-size:12.5px;">Нет статусов за 24 часа</div>`; return; }
  c.innerHTML = statuses.map(s => {
    const u = state.users.find(x => x.id === s.userId);
    const name = u ? `${u.firstName} ${u.lastName}`.trim() : (s.userName || 'Неизвестный');
    const avatar = u ? u.avatar : (s.avatar || '');
    const viewed = s.viewedBy && s.viewedBy.includes(state.currentUser.id);
    return `<div class="status-item" data-status-id="${s.id}"><div class="status-avatar ${viewed ? 'viewed' : ''}"><div class="inner">${avatar ? `<img src="${escapeHtml(avatar)}">` : initial(name)}</div></div><div class="status-info"><div class="name">${escapeHtml(name)}</div><div class="time">${getTimeAgo(s.timestamp)}</div></div></div>`;
  }).join('');
  c.querySelectorAll('.status-item').forEach(el => el.addEventListener('click', () => openStatusView(el.dataset.statusId)));
}
function openStatusView(id) {
  const s = state.statuses.find(x => x.id === id); if (!s) return;
  const u = state.users.find(x => x.id === s.userId);
  const name = u ? `${u.firstName} ${u.lastName}`.trim() : (s.userName || 'Неизвестный');
  document.getElementById('svName').textContent = name;
  document.getElementById('svTime').textContent = getTimeAgo(s.timestamp);
  const av = document.getElementById('svAvatar');
  if (u && u.avatar) av.innerHTML = `<img src="${escapeHtml(u.avatar)}">`;
  else if (s.avatar) av.innerHTML = `<img src="${escapeHtml(s.avatar)}">`;
  else av.textContent = initial(name);
  const body = document.getElementById('svBody');
  if (s.imageUrl) body.innerHTML = `<img src="${s.imageUrl}">`; else body.innerHTML = escapeHtml(s.text || '');
  if (!s.viewedBy) s.viewedBy = [];
  if (!s.viewedBy.includes(state.currentUser.id)) {
    s.viewedBy.push(state.currentUser.id); persistStatuses(); renderStatusList();
    if (window.flypeFirebase) { const { database, ref, update } = window.flypeFirebase; update(ref(database, 'statuses/' + s.id), { viewedBy: s.viewedBy }).catch(() => {}); }
  }
  document.getElementById('statusViewOverlay').classList.add('open');
}

async function deleteContact() {
  if (!state.activeChatId) return;
  const chat = state.chats.find(c => c.id === state.activeChatId); if (!chat) return;
  if (chat.isGovChat) { Sound.error(); showToast('Недоступно', '', 'fa-landmark', 3000); return; }
  if (chat.type === 'private') {
    const oid = chat.participants.find(p => p !== state.currentUser.id);
    const other = state.users.find(u => u.id === oid);
    if (other && (other.isAdmin || other.isOfficial)) { Sound.error(); showToast('Недоступно', '', 'fa-shield-alt', 3000); return; }
  }
  let message, label;
  if (chat.type === 'group') { message = `Удалить группу «${chat.name}» У ВСЕХ?`; label = 'Группа удалена у всех'; }
  else { const info = getChatInfo(chat); message = `Удалить контакт «${info.name}» У ВСЕХ?`; label = 'Контакт удалён у всех'; }
  if (!confirm(message)) return;
  try {
    const cid = chat.id;
    if (window.flypeFirebase) {
      const { database, ref, remove, get } = window.flypeFirebase;
      await remove(ref(database, 'chats/' + cid));
      const ms = await get(ref(database, 'messages')); const data = ms.val() || {};
      const td = []; Object.entries(data).forEach(([id, m]) => { if (m.chatId === cid) td.push(remove(ref(database, 'messages/' + id))); });
      await Promise.all(td);
    }
    state.chats = state.chats.filter(c => c.id !== cid);
    state.messages = state.messages.filter(m => m.chatId !== cid);
    persistChats(); persistMessages(); state.activeChatId = null;
    document.getElementById('profilePanel').classList.remove('open');
    renderAll(); Sound.send(); showToast(label, '', 'fa-trash-alt', 3000);
  } catch (err) { Sound.error(); }
}
async function toggleBlockContact() {
  if (!state.activeChatId) return;
  const chat = state.chats.find(c => c.id === state.activeChatId); if (!chat || chat.type !== 'private') return;
  const oid = chat.participants.find(p => p !== state.currentUser.id);
  const other = state.users.find(u => u.id === oid); if (!other) return;
  if (other.isAdmin === true || other.isOfficial === true) { Sound.error(); showToast('Недоступно', '', 'fa-shield-alt', 3000); return; }
  if (!state.currentUser.blocked) state.currentUser.blocked = [];
  const isB = state.currentUser.blocked.includes(oid);
  if (isB) { state.currentUser.blocked = state.currentUser.blocked.filter(id => id !== oid); showToast('Разблокирован', '', 'fa-unlock', 2500); }
  else { if (!confirm(`Заблокировать ${other.firstName}?`)) return; state.currentUser.blocked.push(oid); showToast('Заблокирован', '', 'fa-ban', 3000); }
  try { if (window.flypeFirebase) { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'users/' + state.currentUser.id), state.currentUser); } persistUsers(); } catch (err) {}
  updateBlockButton(); renderChatList(); renderMessages(state.activeChatId);
}
function updateBlockButton() {
  if (!state.activeChatId) return;
  const chat = state.chats.find(c => c.id === state.activeChatId);
  if (!chat || chat.type !== 'private') return;
  const oid = chat.participants.find(p => p !== state.currentUser.id);
  const isB = state.currentUser.blocked && state.currentUser.blocked.includes(oid);
  const btn = document.getElementById('blockContactBtn'); if (!btn) return;
  btn.innerHTML = isB ? '<i class="fas fa-unlock"></i> Разблокировать' : '<i class="fas fa-ban"></i> Заблокировать';
}

async function sendMessage(text, type = 'text', extra = {}) {
  if (!state.activeChatId) return;
  if (type === 'text' && !text.trim()) return;
  const chat = state.chats.find(c => c.id === state.activeChatId); if (!chat) return;
  if (chat.isGovChat && !state.currentUser.isAdmin) { Sound.error(); showToast('Только для чтения', '', 'fa-landmark', 3000); return; }
  if (chat.type === 'private') {
    const oid = chat.participants.find(p => p !== state.currentUser.id);
    if (state.currentUser.blocked && state.currentUser.blocked.includes(oid)) { Sound.error(); showToast('Заблокирован', '', 'fa-ban'); return; }
  }
  let encText = text.trim(); let isEnc = false;
  if (chat.type === 'private' && type === 'text' && text.trim() && !chat.isGovChat) {
    try {
      const oid = chat.participants.find(p => p !== state.currentUser.id);
      const other = state.users.find(u => u.id === oid);
      if (other && other.publicKey) {
        const myPr = localStorage.getItem('flype_private_key_' + state.currentUser.id);
        if (myPr) { const mp = await importPrivateKey(myPr); const tp = await importPublicKey(other.publicKey); const sk = await deriveSharedSecret(mp, tp); encText = await encryptMessage(text.trim(), sk); isEnc = true; }
      }
    } catch (err) {}
  }
  const msg = { chatId: state.activeChatId, senderId: state.currentUser.id, text: encText, encrypted: isEnc, timestamp: Date.now(), read: false, type, ...extra };
  state.messages.push({ id: genId(), ...msg });
  if (chat) { chat.lastMessageAt = Date.now(); chat.lastMessage = type === 'text' ? (isEnc ? '🔒 Сообщение' : text) : getMessagePreview(msg); }
  persistMessages(); persistChats(); renderMessages(state.activeChatId); renderChatList();
  const sb = document.getElementById('sendBtn'); if (sb) { sb.classList.add('sending'); setTimeout(() => sb.classList.remove('sending'), 400); }
  if (type === 'image' || type === 'file') Sound.statusSent();
  const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight;
  try {
    if (window.flypeFirebase) {
      const { database, ref, push, set, update, get, remove } = window.flypeFirebase;
      const nm = push(ref(database, 'messages')); await set(nm, msg);
      if (chat) await update(ref(database, 'chats/' + chat.id), { lastMessageAt: msg.timestamp, lastMessage: chat.lastMessage });
      try {
        const snap = await get(ref(database, 'messages')); const all = snap.val() || {};
        const chatMsgs = Object.entries(all).map(([id, m]) => ({ id, ...m })).filter(m => m.chatId === chat.id).sort((a, b) => a.timestamp - b.timestamp);
        if (chatMsgs.length > MAX_MESSAGES_PER_CHAT) { const toDelete = chatMsgs.slice(0, chatMsgs.length - MAX_MESSAGES_PER_CHAT); for (const m of toDelete) { await remove(ref(database, 'messages/' + m.id)); } }
      } catch (e) {}
    }
  } catch (err) { Sound.statusFailed(); showToast('Ошибка', 'Не удалось отправить', 'fa-exclamation-circle'); }
}

let pendingReportTargetId = null, pendingReportEvidence = null, adminActionReportId = null;
async function openReportModal(targetUser) {
  if (targetUser && (targetUser.isOfficial || targetUser.isAdmin)) { Sound.error(); showToast('Недоступно', '', 'fa-landmark', 3000); return; }
  pendingReportTargetId = targetUser.id; pendingReportEvidence = null;
  document.getElementById('reportReason').value = ''; document.getElementById('reportDescription').value = ''; document.getElementById('reportDescCounter').textContent = '0';
  document.getElementById('reportEvidenceFile').value = ''; document.getElementById('reportEvidencePreview').innerHTML = '';
  const name = `${targetUser.firstName} ${targetUser.lastName}`.trim();
  document.getElementById('reportTargetInfo').textContent = `Жалоба на: ${name}`;
  const li = document.getElementById('reportLimitInfo');
  const used = await getReportsCountThisMonth(state.currentUser.id, targetUser.id);
  const left = REPORTS_LIMIT_PER_MONTH - used;
  if (left <= 0) { li.innerHTML = `<i class="fas fa-exclamation-triangle" style="color:var(--danger);"></i> Вы уже отправляли жалобу 2 раза в этом месяце.`; document.getElementById('reportSubmitBtn').disabled = true; }
  else { li.innerHTML = `Осталось жалоб: <b>${left}</b> из ${REPORTS_LIMIT_PER_MONTH}.`; document.getElementById('reportSubmitBtn').disabled = false; }
  document.getElementById('reportOverlay').classList.add('open');
}
async function getReportsCountThisMonth(fromId, toId) {
  const now = new Date(); const ms = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let count = 0; if (!window.flypeFirebase) return 0;
  try {
    const { database, ref, get } = window.flypeFirebase;
    const snap = await get(ref(database, 'reports')); const all = snap.val() || {};
    Object.values(all).forEach(r => { if (r.fromId === fromId && r.toId === toId && r.timestamp >= ms) count++; });
  } catch (e) {}
  return count;
}
async function sendReportToAdmin(report, reportId) {
  const { database, ref, get, set, push, update } = window.flypeFirebase;
  const cs = await get(ref(database, 'chats')); const all = cs.val() || {};
  let ac = Object.values(all).find(c => c.type === 'private' && c.participants && c.participants.includes(state.currentUser.id) && c.participants.includes(ADMIN_UID));
  if (!ac) { ac = { id: genId(), type: 'private', participants: [state.currentUser.id, ADMIN_UID], createdAt: Date.now(), lastMessageAt: Date.now(), createdBy: state.currentUser.id }; await set(ref(database, 'chats/' + ac.id), ac); }
  const ds = new Date(report.timestamp).toLocaleString('ru-RU');
  const mt = `🚩 ${report.fromName} пожаловался на ${report.toName}.\n\nПричина: ${report.reasonLabel}\nОписание: ${report.description}\n\nДата: ${ds}`;
  const md = { chatId: ac.id, senderId: state.currentUser.id, text: mt, timestamp: Date.now(), read: false, type: 'report', reportId, targetId: report.toId, targetName: report.toName, reporterName: report.fromName, reportReason: report.reasonLabel, reportDescription: report.description, evidence: report.evidence };
  const nm = push(ref(database, 'messages')); await set(nm, md);
  await update(ref(database, 'chats/' + ac.id), { lastMessageAt: Date.now() });
}
window.openAdminActionsByReport = function(reportId, action) {
  if (!state.currentUser.isAdmin) return;
  const msg = state.messages.find(m => m.type === 'report' && m.reportId === reportId); if (!msg) return;
  adminActionReportId = reportId;
  document.getElementById('adminActionTarget').textContent = `Пользователь: ${msg.targetName}`;
  document.getElementById('adminActionComment').value = '';
  document.getElementById('adminActionOverlay').classList.add('open');
};
function getTargetFromReport(reportId) {
  const msgs = state.messages.filter(m => m.type === 'report' && m.reportId === reportId);
  if (msgs.length === 0) return null;
  const m = msgs[msgs.length - 1];
  return { id: m.targetId, name: m.targetName };
}
async function banUserForDays(userId, userName, days) {
  const { database, ref, update } = window.flypeFirebase;
  const until = Date.now() + days*24*60*60*1000;
  await update(ref(database, 'users/' + userId), { banned: true, bannedUntil: until, banReason: `Блокировка на ${days} дней`, bannedBy: state.currentUser.id, bannedAt: Date.now() });
  showToast('Заблокирован', `${userName} — на ${days} дней`, 'fa-ban', 4000);
}
async function autoBanUser(userId, userName, reason) {
  const { database, ref, update } = window.flypeFirebase;
  const until = Date.now() + AUTOBAN_DAYS*24*60*60*1000;
  await update(ref(database, 'users/' + userId), { banned: true, bannedUntil: until, banReason: `Автоблокировка: ${reason}`, bannedAt: Date.now() });
}
async function deleteUserForever(userId, userName) {
  if (!window.flypeFirebase) { Sound.error(); return; }
  const { database, ref, remove, get, update } = window.flypeFirebase;
  try {
    const cs = await get(ref(database, 'chats')); const all = cs.val() || {};
    const myChatIds = [];
    Object.entries(all).forEach(([cid, chat]) => { if (chat.participants && chat.participants.includes(userId)) myChatIds.push(cid); });
    for (const cid of myChatIds) {
      const chat = all[cid];
      if (chat.type === 'group' && chat.participants.length > 2) { const np = chat.participants.filter(p => p !== userId); const na = (chat.admins || []).filter(a => a !== userId); await update(ref(database, 'chats/' + cid), { participants: np, admins: na }); }
      else await remove(ref(database, 'chats/' + cid));
    }
    const ms = await get(ref(database, 'messages')); const allM = ms.val() || {};
    const dp = []; Object.entries(allM).forEach(([mid, m]) => { if (myChatIds.includes(m.chatId) || m.senderId === userId) dp.push(remove(ref(database, 'messages/' + mid))); });
    await Promise.all(dp);
    await remove(ref(database, 'users/' + userId));
    state.users = state.users.filter(u => u.id !== userId);
    state.chats = state.chats.filter(c => !c.participants.includes(userId));
    state.messages = state.messages.filter(m => !myChatIds.includes(m.chatId) && m.senderId !== userId);
    saveData(STORAGE_KEYS.users, state.users); saveData(STORAGE_KEYS.chats, state.chats); saveData(STORAGE_KEYS.messages, state.messages);
    renderChatList(); renderActiveChat(); renderStatusList(); updateSidebarProfile();
    Sound.send(); showToast('Удалён', `${userName} полностью удалён`, 'fa-user-times', 5000);
  } catch (err) { Sound.error(); }
}
async function deleteAuthUser(password) {
  try {
    if (!window.flypeFirebase || !window.flypeFirebase.deleteUser) return false;
    const auth = window.flypeFirebase.auth; const user = auth.currentUser; if (!user) return false;
    try { const { EmailAuthProvider, reauthenticateWithCredential } = window.flypeFirebase; if (EmailAuthProvider && reauthenticateWithCredential && user.email) { const cred = EmailAuthProvider.credential(user.email, password); await reauthenticateWithCredential(user, cred); } } catch (e) {}
    await window.flypeFirebase.deleteUser(user); return true;
  } catch (err) { return false; }
}

let newGroupAvatarData = null;
let selectedGroupContacts = new Set();
function renderNewGroupContacts() {
  const c = document.getElementById('newGroupContacts');
  const users = state.users.filter(u => u.id !== state.currentUser.id && u.id !== 'flype_bot' && u.id !== 'gosbot' && u.id !== ADMIN_UID);
  if (users.length === 0) { c.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12.5px;">Нет других</div>`; return; }
  c.innerHTML = users.map(u => { const name = `${u.firstName} ${u.lastName}`.trim(); const checked = selectedGroupContacts.has(u.id); return `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border-light);"><input type="checkbox" data-uid="${u.id}" ${checked ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;"><div class="avatar sm">${u.avatar ? `<img src="${escapeHtml(u.avatar)}">` : initial(name)}</div><div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)}</div><div style="font-size:10.5px;font-family:monospace;color:var(--text-muted);">@${escapeHtml(u.flypeId || '')}</div></div></label>`; }).join('');
  c.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.addEventListener('change', (e) => { if (e.target.checked) selectedGroupContacts.add(e.target.dataset.uid); else selectedGroupContacts.delete(e.target.dataset.uid); }); });
}
async function addGroupMember(uid) { const chat = state.chats.find(c => c.id === state.activeChatId); if (!chat) return; if (chat.participants.includes(uid)) return; chat.participants.push(uid); persistChats(); try { if (window.flypeFirebase) { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'chats/' + chat.id), chat); } } catch (err) {} document.getElementById('addMemberOverlay').classList.remove('open'); renderAll(); document.getElementById('infoBtn').click(); Sound.send(); showToast('Добавлен', '', 'fa-user-plus'); }
async function removeGroupMember(chatId, uid) { const chat = state.chats.find(c => c.id === chatId); if (!chat) return; if (!confirm('Исключить?')) return; chat.participants = chat.participants.filter(p => p !== uid); if (chat.admins) chat.admins = chat.admins.filter(a => a !== uid); persistChats(); try { if (window.flypeFirebase) { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'chats/' + chatId), chat); } } catch (err) {} renderAll(); document.getElementById('infoBtn').click(); showToast('Исключён', '', 'fa-user-minus'); }
function renderAddMemberResults(query) {
  const chat = state.chats.find(c => c.id === state.activeChatId); if (!chat) return;
  const c = document.getElementById('addMemberResults'); const q = query.trim().toLowerCase();
  let users = state.users.filter(u => u.id !== state.currentUser.id && u.id !== 'flype_bot' && u.id !== 'gosbot' && !chat.participants.includes(u.id));
  users = users.filter(u => u.id && (u.email || u.flypeId)); users = users.filter(u => !u.banned || u.bannedUntil > Date.now());
  if (q) users = users.filter(u => { const n = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase(); const fid = (u.flypeId || '').toLowerCase(); return n.includes(q) || fid.includes(q); });
  if (users.length === 0) { c.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12.5px;">Не найдено</div>`; return; }
  c.innerHTML = users.map(u => { const n = `${u.firstName} ${u.lastName}`.trim(); return `<div class="chat-item" data-add-uid="${u.id}" style="cursor:pointer;border-left:none;"><div class="avatar sm">${u.avatar ? `<img src="${escapeHtml(u.avatar)}">` : initial(n)}</div><div class="chat-info"><div class="name">${escapeHtml(n)}</div><div class="last-msg" style="font-family:monospace;font-size:10.5px;">@${escapeHtml(u.flypeId || '')}</div></div></div>`; }).join('');
  c.querySelectorAll('[data-add-uid]').forEach(el => el.addEventListener('click', () => addGroupMember(el.dataset.addUid)));
}

/* === ЧАСТЬ 1 ЗАВЕРШЕНА === */
/* ============================================================
   FLYPE · СУПЕР-АПП
   app.js — Часть 2: Госуслуги ФРС, обучение, модули, init
   ============================================================ */

/* ============================================================
   ГОСУСЛУГИ ФРС — БОТ
   ============================================================ */
const GOSBOT_USER = {
  id: 'gosbot', flypeId: 'gosbot',
  firstName: 'Бот Госуслуг', lastName: 'ФРС',
  avatar: '', about: 'Официальный бот государственных услуг',
  isOfficial: true, isBot: true, verified: true,
  online: true, lastSeen: Date.now(), createdAt: Date.now(),
  banned: false, bannedUntil: 0, blocked: []
};
async function ensureGosBot() {
  if (!window.flypeFirebase) { setTimeout(ensureGosBot, 500); return; }
  try {
    const { database, ref, get, set } = window.flypeFirebase;
    const snap = await get(ref(database, 'users/gosbot'));
    if (!snap.exists()) { await set(ref(database, 'users/gosbot'), GOSBOT_USER); }
    const lu = loadData(STORAGE_KEYS.users, []);
    if (!lu.find(u => u.id === 'gosbot')) { lu.push(GOSBOT_USER); saveData(STORAGE_KEYS.users, lu); }
  } catch (e) {}
}
function createGosBotChat(user) {
  if (!user.isCitizenFRC) return;
  const chatId = 'chat_gosbot_' + user.id;
  const chats = loadData(STORAGE_KEYS.chats, []);
  if (!chats.find(c => c.id === chatId)) {
    chats.push({ id: chatId, type: 'private', participants: [user.id, 'gosbot'], createdAt: Date.now(), lastMessageAt: Date.now(), isGovChat: true });
    saveData(STORAGE_KEYS.chats, chats);
  }
  const messages = loadData(STORAGE_KEYS.messages, []);
  if (!messages.find(m => m.chatId === chatId)) {
    messages.push({
      id: genId(), chatId, senderId: 'gosbot',
      text: `🏛️ Добро пожаловать в Бот Госуслуг ФРС!\n\nЗдесь вы будете получать:\n🚨 Уведомления о ЧС\n🗳️ Приглашения на выборы\n💰 Налоговые уведомления\n📢 Официальные объявления\n\nВаш регион: ${user.region || 'не указан'}\nВалюта: талер (₮)`,
      timestamp: Date.now(), read: false, type: 'text'
    });
    saveData(STORAGE_KEYS.messages, messages);
  }
  state.chats = loadData(STORAGE_KEYS.chats, []).filter(c => c.participants.includes(user.id));
  state.messages = loadData(STORAGE_KEYS.messages, []);
  renderChatList();
}
async function broadcastFromGosBot({ audience, messageType, text, meta = {}, priority = 'normal' }) {
  if (!window.flypeFirebase) { showToast('Ошибка', 'Firebase не подключён', 'fa-exclamation-circle'); return 0; }
  const { database, ref, get, push, set, update } = window.flypeFirebase;
  const usersSnap = await get(ref(database, 'users'));
  const allUsers = Object.values(usersSnap.val() || {});
  let recipients = allUsers.filter(u => !u.isOfficial && !u.isBot && u.id !== 'flype_bot' && u.isCitizenFRC === true);
  if (audience.type === 'region') recipients = recipients.filter(u => u.region === audience.region);
  if (recipients.length === 0) { showToast('Нет получателей', '', 'fa-info-circle'); return 0; }
  let sent = 0;
  for (const recipient of recipients) {
    try {
      const chatId = 'chat_gosbot_' + recipient.id;
      const chatSnap = await get(ref(database, 'chats/' + chatId));
      if (!chatSnap.exists()) { await set(ref(database, 'chats/' + chatId), { id: chatId, type: 'private', participants: [recipient.id, 'gosbot'], createdAt: Date.now(), lastMessageAt: Date.now(), isGovChat: true }); }
      const msgRef = push(ref(database, 'messages'));
      await set(msgRef, { chatId, senderId: 'gosbot', text, timestamp: Date.now(), read: false, type: messageType, priority, meta, fromAdmin: state.currentUser.id });
      await update(ref(database, 'chats/' + chatId), { lastMessageAt: Date.now(), lastMessage: text.slice(0, 60) });
      sent++;
    } catch (e) {}
  }
  return sent;
}
function renderGosBotAdminPanel(chatId) {
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat || !chat.isGovChat) return '';
  if (!state.currentUser || !state.currentUser.isAdmin) return '';
  return `<div class="gosbot-admin-panel" style="display:flex;gap:6px;padding:8px 16px;background:var(--bg);border-top:1px solid var(--border-light);flex-wrap:wrap;flex-shrink:0;">
    <button class="gos-panel-btn danger" data-action="emergency" style="padding:6px 12px;border-radius:16px;border:1px solid #FFB3B3;background:#FFEBEE;color:#D93025;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;font-family:var(--font);"><i class="fas fa-exclamation-triangle"></i> 🚨 ЧС</button>
    <button class="gos-panel-btn" data-action="election" style="padding:6px 12px;border-radius:16px;border:1px solid var(--accent-border);background:var(--accent-light);color:var(--accent-darker);font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;font-family:var(--font);"><i class="fas fa-vote-yea"></i> 🗳️ Выборы</button>
    <button class="gos-panel-btn warn" data-action="tax" style="padding:6px 12px;border-radius:16px;border:1px solid #FFE082;background:#FFF8E1;color:#B8860B;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;font-family:var(--font);"><i class="fas fa-coins"></i> 💰 Налог</button>
    <button class="gos-panel-btn" data-action="announcement" style="padding:6px 12px;border-radius:16px;border:1px solid var(--accent-border);background:var(--accent-light);color:var(--accent-darker);font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;font-family:var(--font);"><i class="fas fa-bullhorn"></i> 📢 Объявление</button>
  </div>`;
}
let elCandidateList = [];
function renderElectionCandidates(list) {
  elCandidateList = list || [];
  const c = document.getElementById('elCandidates'); if (!c) return;
  if (elCandidateList.length === 0) { c.innerHTML = '<div style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">Пока нет кандидатов</div>'; return; }
  c.innerHTML = elCandidateList.map((cand, i) => `<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;"><input type="text" value="${escapeHtml(cand.name)}" data-idx="${i}" placeholder="Имя кандидата" class="el-cand-input" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--white);color:var(--text);font-size:13px;"><button data-remove="${i}" style="padding:6px 10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--white);color:var(--text);cursor:pointer;font-size:12px;"><i class="fas fa-times"></i></button></div>`).join('');
  c.querySelectorAll('.el-cand-input').forEach(inp => { inp.addEventListener('input', (e) => { elCandidateList[parseInt(e.target.dataset.idx)].name = e.target.value; }); });
  c.querySelectorAll('[data-remove]').forEach(btn => { btn.addEventListener('click', () => { elCandidateList.splice(parseInt(btn.dataset.remove), 1); renderElectionCandidates(elCandidateList); }); });
}

/* ============================================================
   ГОСУСЛУГИ ФРС — РЕНДЕР РАЗДЕЛОВ
   ============================================================ */
const GOS_SECTIONS = {
  dashboard: renderGosDashboard,
  passport: renderGosPassport,
  address: renderGosAddress,
  doctors: renderGosDoctors,
  school: renderGosSchool,
  children: renderGosChildren,
  diary: renderGosDiary,
  taxes: renderGosTaxes,
  settings: renderGosSettings,
  help: renderGosHelp
};

function renderGosSection(section) {
  state.gosSection = section;
  document.querySelectorAll('.gos-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.gosSection === section));
  const cont = document.getElementById('gosContent'); if (!cont) return;
  const fn = GOS_SECTIONS[section] || renderGosDashboard;
  cont.innerHTML = fn();
  bindGosEvents(section);
}

function renderGosDashboard() {
  const u = state.currentUser;
  const gos = getGosData();
  const fullName = `${u.firstName} ${u.lastName}`.trim();
  return `
    <div class="gos-page-title">Добро пожаловать, ${escapeHtml(u.firstName)}!</div>
    <div class="gos-page-sub">Личный кабинет гражданина Федеративной Республики Славия</div>
    <div class="gos-grid">
      <div class="gos-tile" data-gos-open="passport">
        <div class="gos-tile-icon"><i class="fas fa-id-card"></i></div>
        <h3>Паспорт ФРС</h3>
        <p>${gos.passport ? '✅ Паспорт создан' : 'Создайте паспорт гражданина'}</p>
      </div>
      <div class="gos-tile" data-gos-open="address">
        <div class="gos-tile-icon"><i class="fas fa-map-marker-alt"></i></div>
        <h3>Место жительства</h3>
        <p>${gos.address && gos.address.city ? `📍 ${escapeHtml(gos.address.city)}` : 'Укажите адрес проживания'}</p>
      </div>
      <div class="gos-tile" data-gos-open="doctors">
        <div class="gos-tile-icon"><i class="fas fa-user-md"></i></div>
        <h3>Запись к врачу</h3>
        <p>${(gos.doctorAppointments && gos.doctorAppointments.length) ? `📋 ${gos.doctorAppointments.length} записей` : 'Запишитесь на приём'}</p>
      </div>
      <div class="gos-tile" data-gos-open="school">
        <div class="gos-tile-icon"><i class="fas fa-school"></i></div>
        <h3>Детсад / Школа</h3>
        <p>Запись в учебное заведение</p>
      </div>
      <div class="gos-tile" data-gos-open="children">
        <div class="gos-tile-icon"><i class="fas fa-child"></i></div>
        <h3>Детские аккаунты</h3>
        <p>${(gos.children && gos.children.length) ? `👶 ${gos.children.length} аккаунтов` : 'Создайте аккаунт ребёнку'}</p>
      </div>
      <div class="gos-tile" data-gos-open="diary">
        <div class="gos-tile-icon"><i class="fas fa-book"></i></div>
        <h3>Дневник / Журнал</h3>
        <p>Электронный дневник и журнал</p>
      </div>
    </div>
    <div class="gos-card" style="margin-top:24px;">
      <h3><i class="fas fa-user-circle"></i> Основные данные</h3>
      <div class="gos-info-row"><span class="label">Имя и фамилия</span><span class="value">${escapeHtml(fullName)}</span></div>
      <div class="gos-info-row"><span class="label">Flype ID</span><span class="value">@${escapeHtml(u.flypeId || '')}</span></div>
      <div class="gos-info-row"><span class="label">Дата рождения</span><span class="value">${u.birthDate ? new Date(u.birthDate).toLocaleDateString('ru-RU') : '— не указана'}</span></div>
      <div class="gos-info-row"><span class="label">СНИЛС</span><span class="value">${gos.snils || '— не указан'}</span></div>
      <div class="gos-info-row"><span class="label">Республика</span><span class="value">${escapeHtml(u.region || '—')}</span></div>
    </div>
  `;
}

function renderGosPassport() {
  const u = state.currentUser;
  const gos = getGosData();
  const p = gos.passport;
  if (p) {
    const fullName = `${p.lastName} ${p.firstName} ${p.middleName || ''}`.trim().toUpperCase();
    return `
      <div class="gos-page-title">Паспорт ФРС</div>
      <div class="gos-page-sub">Официальный документ гражданина Федеративной Республики Славия</div>
      <div class="gos-passport">
        <div class="pass-header"><span class="title">ФЕДЕРАТИВНАЯ РЕСПУБЛИКА СЛАВИЯ</span><span class="flag">🏛️</span></div>
        <div class="pass-body">
          <div class="pass-photo">${p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;">` : '<i class="fas fa-user"></i>'}</div>
          <div class="pass-fields">
            <div class="pass-field"><span class="k">Фамилия</span><span class="v">${escapeHtml(p.lastName || '')}</span></div>
            <div class="pass-field"><span class="k">Имя, Отчество</span><span class="v">${escapeHtml(p.firstName || '')} ${escapeHtml(p.middleName || '')}</span></div>
            <div class="pass-field"><span class="k">Дата рождения</span><span class="v">${p.birthDate ? new Date(p.birthDate).toLocaleDateString('ru-RU') : '—'}</span></div>
            <div class="pass-field"><span class="k">Место рождения</span><span class="v">${escapeHtml(p.birthPlace || '—')}</span></div>
          </div>
        </div>
        <div class="pass-footer">
          <div>Серия ${escapeHtml(p.series || '—')} № ${escapeHtml(p.number || '—')}</div>
          <div>Выдан: ${escapeHtml(p.issuedBy || '—')} · ${p.issuedAt ? new Date(p.issuedAt).toLocaleDateString('ru-RU') : '—'}</div>
        </div>
      </div>
      <div class="gos-actions">
        <button class="btn btn-secondary" data-gos-action="passport-edit"><i class="fas fa-edit"></i> Изменить данные</button>
        <button class="btn btn-secondary" data-gos-action="passport-delete" style="color:var(--danger);"><i class="fas fa-trash-alt"></i> Удалить паспорт</button>
      </div>
    `;
  }
  return `
    <div class="gos-page-title">Паспорт ФРС</div>
    <div class="gos-page-sub">Создайте паспорт гражданина Федеративной Республики Славия</div>
    <div class="gos-card">
      <h3><i class="fas fa-id-card"></i> Данные для паспорта</h3>
      <div class="gos-form-row">
        <div class="input-group"><label>Фамилия</label><input type="text" id="passLast" value="${escapeHtml(u.lastName || '')}"></div>
        <div class="input-group"><label>Имя</label><input type="text" id="passFirst" value="${escapeHtml(u.firstName || '')}"></div>
      </div>
      <div class="gos-form-row">
        <div class="input-group"><label>Отчество</label><input type="text" id="passMiddle" placeholder="Иванович"></div>
        <div class="input-group"><label>Дата рождения</label><input type="date" id="passBirth" value="${u.birthDate || ''}"></div>
      </div>
      <div class="gos-form-row full">
        <div class="input-group"><label>Место рождения</label><input type="text" id="passBirthPlace" placeholder="г. Киев"></div>
      </div>
      <div class="gos-form-row">
        <div class="input-group"><label>Серия</label><input type="text" id="passSeries" placeholder="12 34" maxlength="5"></div>
        <div class="input-group"><label>Номер</label><input type="text" id="passNumber" placeholder="567890" maxlength="6"></div>
      </div>
      <div class="gos-form-row">
        <div class="input-group"><label>Кем выдан</label><input type="text" id="passIssuedBy" placeholder="ОВД г. Киев"></div>
        <div class="input-group"><label>Дата выдачи</label><input type="date" id="passIssuedAt" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="gos-actions">
        <button class="btn" data-gos-action="passport-create"><i class="fas fa-plus"></i> Создать паспорт</button>
      </div>
    </div>
  `;
}

function renderGosAddress() {
  const gos = getGosData();
  const a = gos.address || {};
  const u = state.currentUser;
  const regions = SLASTVIA_REGIONS[u.region] || Object.keys(SLASTVIA_REGIONS).reduce((acc, k) => acc.concat(SLASTVIA_REGIONS[k]), []);
  return `
    <div class="gos-page-title">Место жительства</div>
    <div class="gos-page-sub">Укажите адрес вашего проживания</div>
    <div class="gos-card">
      <h3><i class="fas fa-map-marker-alt"></i> Адрес</h3>
      <div class="gos-form-row">
        <div class="input-group"><label>Республика</label>
          <select id="addrRepublic">
            <option value="">— Выберите —</option>
            ${Object.keys(SLASTVIA_REGIONS).map(r => `<option value="${r}" ${a.republic === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
        <div class="input-group"><label>Область</label>
          <select id="addrRegion">
            <option value="">— Сначала республика —</option>
            ${(SLASTVIA_REGIONS[a.republic] || []).map(r => `<option value="${r}" ${a.region === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="gos-form-row">
        <div class="input-group"><label>Город / населённый пункт</label><input type="text" id="addrCity" value="${escapeHtml(a.city || '')}" placeholder="Киев"></div>
        <div class="input-group"><label>Улица</label><input type="text" id="addrStreet" value="${escapeHtml(a.street || '')}" placeholder="ул. Крещатик"></div>
      </div>
      <div class="gos-form-row">
        <div class="input-group"><label>Дом</label><input type="text" id="addrHouse" value="${escapeHtml(a.house || '')}" placeholder="1"></div>
        <div class="input-group"><label>Квартира</label><input type="text" id="addrFlat" value="${escapeHtml(a.flat || '')}" placeholder="42"></div>
      </div>
      <div class="gos-form-row full">
        <div class="input-group"><label>Почтовый индекс</label><input type="text" id="addrIndex" value="${escapeHtml(a.index || '')}" placeholder="01001"></div>
      </div>
      <div class="gos-actions"><button class="btn" data-gos-action="address-save"><i class="fas fa-save"></i> Сохранить адрес</button></div>
    </div>
  `;
}

const DOCTORS = [
  { spec: 'Терапевт', icon: '🩺' },
  { spec: 'Стоматолог', icon: '🦷' },
  { spec: 'Окулист', icon: '👁️' },
  { spec: 'Хирург', icon: '🔪' },
  { spec: 'Кардиолог', icon: '❤️' },
  { spec: 'Невролог', icon: '🧠' },
  { spec: 'ЛОР', icon: '👂' },
  { spec: 'Педиатр', icon: '👶' },
  { spec: 'Дерматолог', icon: '🧴' },
  { spec: 'Эндокринолог', icon: '⚗️' },
  { spec: 'Гинеколог', icon: '♀️' },
  { spec: 'Уролог', icon: '♂️' }
];

function renderGosDoctors() {
  const gos = getGosData();
  const appointments = gos.doctorAppointments || [];
  return `
    <div class="gos-page-title">Запись к врачу</div>
    <div class="gos-page-sub">Выберите специалиста для записи на приём</div>
    <div class="gos-card">
      <h3><i class="fas fa-user-md"></i> Специалисты</h3>
      <div class="gos-doctors-list">
        ${DOCTORS.map(d => `<div class="gos-doctor-card" data-gos-doctor="${d.spec}"><div class="doc-name">${d.icon} ${d.spec}</div><div class="doc-spec">Свободные слоты: сегодня</div><div class="doc-time">Нажмите для записи</div></div>`).join('')}
      </div>
    </div>
    ${appointments.length > 0 ? `
      <div class="gos-card">
        <h3><i class="fas fa-calendar-check"></i> Мои записи</h3>
        ${appointments.map((a, i) => `<div class="gos-info-row"><span class="label">${escapeHtml(a.spec)} — ${new Date(a.date).toLocaleString('ru-RU')}</span><span class="value">${a.status === 'active' ? '✅ Активна' : '✔️ Завершена'}</span></div>`).join('')}
      </div>
    ` : ''}
  `;
}

function renderGosSchool() {
  const u = state.currentUser;
  const gos = getGosData();
  const inst = gos.school;
  const schoolList = (SLASTVIA_REGIONS[u.region] || []).map((r, i) => `Школа №${i + 1} г. ${r}`).concat([`Школа №1 г. Киев`, `Гимназия №5 г. Киев`, `Лицей №10`]).slice(0, 15);
  const kinderList = (SLASTVIA_REGIONS[u.region] || []).map((r, i) => `Детсад №${i + 1} г. ${r}`).concat([`Детсад «Солнышко»`, `Детсад «Радуга»`]).slice(0, 10);
  return `
    <div class="gos-page-title">Детсад / Школа</div>
    <div class="gos-page-sub">Запись в образовательное учреждение</div>
    ${inst ? `<div class="gos-card"><h3><i class="fas fa-check-circle" style="color:var(--success);"></i> Ваша запись</h3><div class="gos-info-row"><span class="label">Учреждение</span><span class="value">${escapeHtml(inst.name)}</span></div><div class="gos-info-row"><span class="label">Тип</span><span class="value">${inst.type === 'school' ? 'Школа' : 'Детсад'}</span></div><div class="gos-info-row"><span class="label">Дата подачи</span><span class="value">${new Date(inst.date).toLocaleDateString('ru-RU')}</span></div><button class="btn btn-secondary" data-gos-action="school-cancel" style="margin-top:12px;color:var(--danger);"><i class="fas fa-times"></i> Отменить запись</button></div>` : ''}
    <div class="gos-card">
      <h3><i class="fas fa-school"></i> Школы</h3>
      <div class="gos-inst-list">
        ${schoolList.map(name => `<div class="gos-inst-card" data-gos-school="school|${escapeHtml(name)}"><div class="inst-name">🏫 ${escapeHtml(name)}</div><div class="inst-addr">Приём заявлений открыт</div></div>`).join('')}
      </div>
    </div>
    <div class="gos-card">
      <h3><i class="fas fa-baby"></i> Детские сады</h3>
      <div class="gos-inst-list">
        ${kinderList.map(name => `<div class="gos-inst-card" data-gos-school="kinder|${escapeHtml(name)}"><div class="inst-name">🧸 ${escapeHtml(name)}</div><div class="inst-addr">Приём заявлений открыт</div></div>`).join('')}
      </div>
    </div>
  `;
}

function renderGosChildren() {
  const gos = getGosData();
  const children = gos.children || [];
  return `
    <div class="gos-page-title">Детские аккаунты</div>
    <div class="gos-page-sub">Создавайте аккаунты для своих детей</div>
    ${children.length > 0 ? children.map((c, i) => `<div class="gos-child-card"><div class="avatar">${c.avatar ? `<img src="${c.avatar}">` : initial(c.firstName)}</div><div class="child-info"><div class="n">${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</div><div class="d">Дата рождения: ${new Date(c.birthDate).toLocaleDateString('ru-RU')} · Логин: @${escapeHtml(c.login)}</div></div><button class="btn btn-secondary" data-gos-action="child-delete" data-child-idx="${i}" style="color:var(--danger);"><i class="fas fa-trash-alt"></i></button></div>`).join('') : '<div class="gos-empty"><i class="fas fa-child"></i>Пока нет детских аккаунтов</div>'}
    <div class="gos-card" style="margin-top:16px;">
      <h3><i class="fas fa-plus"></i> Создать детский аккаунт</h3>
      <div class="gos-form-row">
        <div class="input-group"><label>Имя ребёнка</label><input type="text" id="childFirst" placeholder="Мария"></div>
        <div class="input-group"><label>Фамилия</label><input type="text" id="childLast" placeholder="Иванова"></div>
      </div>
      <div class="gos-form-row">
        <div class="input-group"><label>Дата рождения</label><input type="date" id="childBirth" max="${new Date().toISOString().slice(0,10)}"></div>
        <div class="input-group"><label>Логин (латиница)</label><input type="text" id="childLogin" placeholder="masha2015" maxlength="20"></div>
      </div>
      <div class="gos-actions"><button class="btn" data-gos-action="child-create"><i class="fas fa-plus"></i> Создать аккаунт</button></div>
    </div>
  `;
}

function renderGosDiary() {
  return `
    <div class="gos-page-title">Дневник / Журнал</div>
    <div class="gos-page-sub">Электронный дневник для родителей и учеников · Журнал для учителей</div>
    <div class="gos-wip">
      <i class="fas fa-tools"></i>
      <h3>Функция в разработке</h3>
      <p>Электронный дневник и журнал появятся в ближайших обновлениях. Сейчас вы можете создавать детские аккаунты и записывать детей в школы и детсады.</p>
    </div>
  `;
}

function renderGosTaxes() {
  return `
    <div class="gos-page-title">Налоги и платежи</div>
    <div class="gos-page-sub">Ваши налоговые уведомления (валюта: ₮ талер)</div>
    <div class="gos-wip">
      <i class="fas fa-coins"></i>
      <h3>Здесь появятся ваши налоги</h3>
      <p>Когда администрация ФРС выпишет вам налог — уведомление придёт в чат с Ботом Госуслуг. Оплатить можно там же.</p>
    </div>
  `;
}

function renderGosSettings() {
  const u = state.currentUser;
  const isDark = state.settings.darkTheme;
  return `
    <div class="gos-page-title">Настройки</div>
    <div class="gos-page-sub">Управление аккаунтом и оформлением</div>
    <div class="gos-card">
      <h3><i class="fas fa-palette"></i> Тема оформления</h3>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:14px;">Тёмная тема</span>
        <label class="switch"><input type="checkbox" id="gosDarkToggle" ${isDark ? 'checked' : ''}><span class="slider"></span></label>
      </div>
    </div>
    <div class="gos-card">
      <h3><i class="fas fa-user-circle"></i> Личные данные</h3>
      <div class="gos-info-row"><span class="label">Имя и фамилия</span><span class="value">${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</span></div>
      <div class="gos-info-row"><span class="label">Дата рождения</span><span class="value">${u.birthDate ? new Date(u.birthDate).toLocaleDateString('ru-RU') : '—'}</span></div>
      <div class="gos-info-row"><span class="label">СНИЛС</span><span class="value">${getGosData().snils || '— не указан'}</span></div>
    </div>
    <div class="gos-card">
      <h3><i class="fas fa-fingerprint"></i> СНИЛС</h3>
      <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px;">СНИЛС — страховой номер индивидуального лицевого счёта. Формат: XXX-XXX-XXX YY.</p>
      <div class="gos-form-row full">
        <div class="input-group"><label>СНИЛС</label><input type="text" id="gosSnilsInput" placeholder="123-456-789 00" value="${getGosData().snils || ''}" maxlength="15"></div>
      </div>
      <div class="gos-actions"><button class="btn" data-gos-action="snils-save"><i class="fas fa-save"></i> Сохранить СНИЛС</button></div>
    </div>
  `;
}

function renderGosHelp() {
  return `
    <div class="gos-page-title">Задать вопрос</div>
    <div class="gos-page-sub">Связь с администрацией ФРС</div>
    <div class="gos-wip">
      <i class="fas fa-question-circle"></i>
      <h3>Задайте вопрос администрации</h3>
      <p>Нажмите кнопку ниже — откроется чат с администратором @admin001 в мессенджере Flype.</p>
      <button class="btn" data-gos-action="ask-admin" style="margin-top:16px;"><i class="fas fa-comments"></i> Открыть чат с @admin001</button>
    </div>
  `;
}

function bindGosEvents(section) {
  document.querySelectorAll('[data-gos-open]').forEach(el => el.addEventListener('click', () => renderGosSection(el.dataset.gosOpen)));
  document.querySelectorAll('[data-gos-doctor]').forEach(el => el.addEventListener('click', () => bookDoctor(el.dataset.gosDoctor)));
  document.querySelectorAll('[data-gos-school]').forEach(el => el.addEventListener('click', () => bookSchool(el.dataset.gosSchool)));
  document.querySelectorAll('[data-gos-action]').forEach(el => el.addEventListener('click', () => handleGosAction(el.dataset.gosAction, el)));

  const addrRep = document.getElementById('addrRepublic');
  if (addrRep) addrRep.addEventListener('change', () => {
    const regionSel = document.getElementById('addrRegion');
    if (!regionSel) return;
    const list = SLASTVIA_REGIONS[addrRep.value] || [];
    regionSel.innerHTML = '<option value="">— Выберите область —</option>' + list.map(r => `<option value="${r}">${r}</option>`).join('');
  });

  const gdt = document.getElementById('gosDarkToggle');
  if (gdt) gdt.addEventListener('change', (e) => {
    state.settings.darkTheme = e.target.checked;
    persistSettings(); applyTheme();
    const dt = document.getElementById('darkThemeToggle'); if (dt) dt.checked = e.target.checked;
  });

  const snilsInput = document.getElementById('gosSnilsInput');
  if (snilsInput) snilsInput.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
    let out = '';
    if (v.length > 0) out += v.slice(0, 3);
    if (v.length > 3) out += '-' + v.slice(3, 6);
    if (v.length > 6) out += '-' + v.slice(6, 9);
    if (v.length > 9) out += ' ' + v.slice(9, 11);
    e.target.value = out;
  });
}

async function handleGosAction(action, el) {
  const gos = getGosData();
  if (action === 'passport-create') {
    const data = {
      lastName: document.getElementById('passLast').value.trim(),
      firstName: document.getElementById('passFirst').value.trim(),
      middleName: document.getElementById('passMiddle').value.trim(),
      birthDate: document.getElementById('passBirth').value,
      birthPlace: document.getElementById('passBirthPlace').value.trim(),
      series: document.getElementById('passSeries').value.trim(),
      number: document.getElementById('passNumber').value.trim(),
      issuedBy: document.getElementById('passIssuedBy').value.trim(),
      issuedAt: document.getElementById('passIssuedAt').value,
      photo: ''
    };
    if (!data.lastName || !data.firstName || !data.series || !data.number) { Sound.error(); showToast('Ошибка', 'Заполните ФИО, серию и номер', 'fa-exclamation-circle'); return; }
    gos.passport = data; saveGosData(gos);
    Sound.send(); showToast('Паспорт создан!', '', 'fa-id-card', 3000);
    renderGosSection('passport');
  }
  else if (action === 'passport-edit') { gos.passport = null; saveGosData(gos); renderGosSection('passport'); }
  else if (action === 'passport-delete') { if (!confirm('Удалить паспорт?')) return; gos.passport = null; saveGosData(gos); renderGosSection('passport'); }
  else if (action === 'address-save') {
    const data = {
      republic: document.getElementById('addrRepublic').value,
      region: document.getElementById('addrRegion').value,
      city: document.getElementById('addrCity').value.trim(),
      street: document.getElementById('addrStreet').value.trim(),
      house: document.getElementById('addrHouse').value.trim(),
      flat: document.getElementById('addrFlat').value.trim(),
      index: document.getElementById('addrIndex').value.trim()
    };
    if (!data.city) { Sound.error(); showToast('Ошибка', 'Укажите город', 'fa-exclamation-circle'); return; }
    gos.address = data; saveGosData(gos);
    Sound.send(); showToast('Адрес сохранён', '', 'fa-check-circle', 3000);
    renderGosSection('address');
  }
  else if (action === 'child-create') {
    const data = {
      firstName: document.getElementById('childFirst').value.trim(),
      lastName: document.getElementById('childLast').value.trim(),
      birthDate: document.getElementById('childBirth').value,
      login: document.getElementById('childLogin').value.trim().toLowerCase(),
      avatar: ''
    };
    if (!data.firstName || !data.lastName || !data.birthDate || !data.login) { Sound.error(); showToast('Ошибка', 'Заполните все поля', 'fa-exclamation-circle'); return; }
    if (!/^[a-zA-Z][a-zA-Z0-9_]{3,19}$/.test(data.login)) { Sound.error(); showToast('Ошибка', 'Логин: 4–20 символов, латиница', 'fa-exclamation-circle'); return; }
    if (!gos.children) gos.children = [];
    if (gos.children.find(c => c.login === data.login)) { Sound.error(); showToast('Ошибка', 'Такой логин уже занят', 'fa-exclamation-circle'); return; }
    gos.children.push(data); saveGosData(gos);
    Sound.send(); showToast('Детский аккаунт создан', data.firstName, 'fa-child', 3500);
    renderGosSection('children');
  }
  else if (action === 'child-delete') {
    const idx = parseInt(el.dataset.childIdx);
    if (!confirm('Удалить детский аккаунт?')) return;
    gos.children.splice(idx, 1); saveGosData(gos); renderGosSection('children');
    Sound.send(); showToast('Удалено', '', 'fa-trash-alt', 2000);
  }
  else if (action === 'school-cancel') { if (!confirm('Отменить запись?')) return; gos.school = null; saveGosData(gos); renderGosSection('school'); }
  else if (action === 'snils-save') {
    const v = document.getElementById('gosSnilsInput').value.trim();
    if (!/^\d{3}-\d{3}-\d{3}\s\d{2}$/.test(v)) { Sound.error(); showToast('Ошибка', 'Формат: XXX-XXX-XXX YY', 'fa-exclamation-circle'); return; }
    gos.snils = v; saveGosData(gos);
    Sound.send(); showToast('СНИЛС сохранён', '', 'fa-check-circle', 3000);
    renderGosSection('settings');
  }
  else if (action === 'ask-admin') {
    openChatWithAdmin();
    if (window.FlypeShell && window.FlypeShell.switchApp) window.FlypeShell.switchApp('messenger');
  }
}

async function bookDoctor(spec) {
  const date = new Date(Date.now() + 24*60*60*1000);
  const timeStr = prompt(`Запись к врачу: ${spec}\n\nВведите желаемую дату и время (формат: ГГГГ-ММ-ДД ЧЧ:ММ)`, `${date.toISOString().slice(0,10)} 10:00`);
  if (!timeStr) return;
  const dt = new Date(timeStr.replace(' ', 'T'));
  if (isNaN(dt.getTime())) { Sound.error(); showToast('Ошибка', 'Неверный формат', 'fa-exclamation-circle'); return; }
  const gos = getGosData();
  if (!gos.doctorAppointments) gos.doctorAppointments = [];
  gos.doctorAppointments.push({ spec, date: dt.getTime(), status: 'active' });
  saveGosData(gos);
  Sound.send(); showToast('Запись создана', `${spec} — ${dt.toLocaleString('ru-RU')}`, 'fa-check-circle', 4000);
  renderGosSection('doctors');
}

async function bookSchool(payload) {
  const [type, name] = payload.split('|');
  if (!confirm(`Записаться в «${name}»?`)) return;
  const gos = getGosData();
  gos.school = { type, name, date: Date.now() };
  saveGosData(gos);
  Sound.send(); showToast('Заявка подана', name, 'fa-check-circle', 4000);
  renderGosSection('school');
}

function openChatWithAdmin() {
  if (!window.flypeFirebase) { Sound.error(); return; }
  const adminUid = ADMIN_UID;
  if (!adminUid) { showToast('Ошибка', 'ADMIN_UID не задан', 'fa-exclamation-circle'); return; }
  openChatWithUser(adminUid);
}

/* ============================================================
   ОБУЧЕНИЕ
   ============================================================ */
const TUTORIAL_STEPS = [
  { icon: 'fa-hand-wave', title: 'Добро пожаловать в Flype!', text: 'Это супер-апп — мессенджер, браузер, новости, видео, музыка. За 6 шагов покажем, как всё устроено.' },
  { icon: 'fa-comment-dots', title: '💬 Мессенджер', text: 'Слева — список чатов. Нажмите «Новый», чтобы начать переписку. Справа в чате — кнопки звонка, видео и информации.' },
  { icon: 'fa-globe', title: '🌐 Браузер, 📰 Новости, 🎬 Видео', text: 'Встроенный браузер, новости из русских и мировых RSS с автопереводом, видеоплеер — YouTube, VK, Rutube, mp4.' },
  { icon: 'fa-music', title: '🎵 Музыка', text: 'Добавляйте свои mp3-ссылки или загружайте файлы. Плейлист хранится локально.' },
  { icon: 'fa-landmark', title: '🏛️ Гражданин ФРС?', text: 'В настройках можно включить режим «Гражданин ФРС» — откроется модуль Госуслуг и чат с Ботом Госуслуг ФРС.' },
  { icon: 'fa-cog', title: '⚙️ Настройки', text: 'Клик на аватарку слева сверху — откроет настройки: тема, звуки, ник, аватарка. Frutiger Aero — отдельный тумблер!' }
];
let tutorialIndex = 0;
function startTutorial() { tutorialIndex = 0; renderTutorialStep(); document.getElementById('tutorialOverlay').classList.add('open'); }
function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialIndex];
  const icon = document.getElementById('tutorialIcon');
  const title = document.getElementById('tutorialTitle');
  const text = document.getElementById('tutorialText');
  const progress = document.getElementById('tutorialProgress');
  const next = document.getElementById('tutorialNext');
  icon.innerHTML = `<i class="fas ${step.icon}"></i>`;
  title.textContent = step.title;
  text.textContent = step.text;
  progress.innerHTML = TUTORIAL_STEPS.map((_, i) => { const cls = i === tutorialIndex ? 'active' : (i < tutorialIndex ? 'done' : ''); return `<div class="tutorial-dot ${cls}"></div>`; }).join('');
  next.innerHTML = tutorialIndex === TUTORIAL_STEPS.length - 1 ? 'Понятно! <i class="fas fa-check"></i>' : 'Далее <i class="fas fa-arrow-right"></i>';
}
function nextTutorialStep() { tutorialIndex++; if (tutorialIndex >= TUTORIAL_STEPS.length) { closeTutorial(true); return; } renderTutorialStep(); }
function closeTutorial(done) { document.getElementById('tutorialOverlay').classList.remove('open'); if (done && state.currentUser) localStorage.setItem(STORAGE_KEYS.tutorialDone + '_' + state.currentUser.id, '1'); }

/* ============================================================
   INIT + ОБРАБОТЧИКИ
   ============================================================ */
let selectedTaxCitizen = null;
let pendingStatusImageData = null;
let pendingAvatarData = null;

document.addEventListener('DOMContentLoaded', () => {

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      document.getElementById(target === 'login' ? 'loginForm' : 'registerForm').classList.add('active');
      document.querySelectorAll('.error-text').forEach(e => e.classList.remove('visible'));
      document.querySelectorAll('.input-group input').forEach(i => i.classList.remove('error'));
    });
  });
  const regU = document.getElementById('regUsername');
  if (regU) regU.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20); });
  const newId = document.getElementById('newIdDigits');
  if (newId) newId.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20); });
  const setA = document.getElementById('settingsAbout');
  if (setA) setA.addEventListener('input', (e) => { document.getElementById('aboutCounter').textContent = e.target.value.length; });

  const regCitizen = document.getElementById('regCitizenFRC');
  if (regCitizen) {
    regCitizen.addEventListener('change', () => {
      const grp = document.getElementById('regRegionGroup');
      const bgrp = document.getElementById('regBirthGroup');
      if (grp) grp.classList.toggle('hidden', !regCitizen.checked);
      if (bgrp) bgrp.classList.toggle('hidden', !regCitizen.checked);
    });
  }

  document.getElementById('registerForm').addEventListener('submit', handleRegister);
  document.getElementById('loginForm').addEventListener('submit', handleLogin);

  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.stab;
      state.activeTab = target;
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(target === 'chats' ? 'tabChats' : 'tabStatuses').classList.add('active');
    });
  });
  const gs = document.getElementById('globalSearch');
  if (gs) gs.addEventListener('input', e => { state.searchQuery = e.target.value; renderChatList(); });

  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) sendBtn.addEventListener('click', () => { const input = document.getElementById('messageInput'); if (input.value.trim()) { sendMessage(input.value); input.value = ''; input.style.height = 'auto'; } });
  const msgInput = document.getElementById('messageInput');
  if (msgInput) {
    msgInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('sendBtn').click(); } });
    msgInput.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 110) + 'px'; });
  }
  const attachBtn = document.getElementById('attachBtn');
  if (attachBtn) attachBtn.addEventListener('click', () => document.getElementById('fileInput').click());
  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5*1024*1024) { Sound.statusFailed(); showToast('Файл большой', 'Максимум 5 МБ', 'fa-exclamation-circle'); e.target.value = ''; return; }
    if (file.type.startsWith('image/')) {
      try { const compressed = await compressImage(file, 800, 0.7); sendMessage('', 'image', { imageUrl: compressed, fileName: file.name, fileSize: compressed.length }); }
      catch (err) { Sound.error(); }
    } else { sendMessage('', 'file', { fileName: file.name, fileSize: file.size }); }
    e.target.value = '';
  });

  const callBtn = document.getElementById('callBtn');
  if (callBtn) callBtn.addEventListener('click', () => { if (state.activeChatId) startCall(state.activeChatId, false); });
  const videoCallBtn = document.getElementById('videoCallBtn');
  if (videoCallBtn) videoCallBtn.addEventListener('click', () => { if (state.activeChatId) startCall(state.activeChatId, true); });
  const acceptCallBtn = document.getElementById('acceptCallBtn');
  if (acceptCallBtn) acceptCallBtn.addEventListener('click', acceptCall);
  const rejectCallBtn = document.getElementById('rejectCallBtn');
  if (rejectCallBtn) rejectCallBtn.addEventListener('click', rejectCall);
  const cancelCallBtn = document.getElementById('cancelCallBtn');
  if (cancelCallBtn) cancelCallBtn.addEventListener('click', cancelCall);
  const voiceBtn = document.getElementById('voiceBtn');
  if (voiceBtn) voiceBtn.addEventListener('click', () => { Sound.error(); showToast('Функция недоступна', 'Голосовые пока не работают.', 'fa-microphone-slash', 4000); });

  const searchInChatBtn = document.getElementById('searchInChatBtn');
  if (searchInChatBtn) searchInChatBtn.addEventListener('click', () => {
    const bar = document.getElementById('chatSearchBar');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) document.getElementById('chatSearchInput').focus();
    else { chatSearchQuery = ''; document.getElementById('chatSearchInput').value = ''; renderMessages(state.activeChatId); }
  });
  const chatSearchInput = document.getElementById('chatSearchInput');
  if (chatSearchInput) chatSearchInput.addEventListener('input', (e) => { chatSearchQuery = e.target.value.toLowerCase(); renderMessages(state.activeChatId); });

  const infoBtn = document.getElementById('infoBtn');
  if (infoBtn) infoBtn.addEventListener('click', () => {
    if (!state.activeChatId) return;
    const chat = state.chats.find(c => c.id === state.activeChatId); if (!chat) return;
    const info = getChatInfo(chat);
    document.getElementById('contactName').textContent = info.name;
    document.getElementById('contactStatus').textContent = chat.isGovChat ? 'Бот Госуслуг ФРС' : (info.online ? 'В сети' : 'Был(а) недавно');
    document.getElementById('contactFlypeId').textContent = chat.isGovChat ? '@gosbot' : (chat.type === 'group' ? `Группа · ${chat.participants.length}` : (info.flypeId ? '@' + info.flypeId : '—'));
    const otherUser = chat.type === 'private' ? state.users.find(u => u.id === chat.participants.find(p => p !== state.currentUser.id)) : null;
    document.getElementById('contactAbout').textContent = (otherUser && otherUser.about) ? `«${otherUser.about}»` : '';
    const av = document.getElementById('contactAvatar');
    if (info.avatar) av.innerHTML = `<img src="${escapeHtml(info.avatar)}">`;
    else if (chat.isGovChat) av.innerHTML = '<i class="fas fa-landmark"></i>';
    else av.textContent = initial(info.name);
    const ms = document.getElementById('groupMembersSection');
    const ml = document.getElementById('groupMembersList');
    const isAdmin = chat.type === 'group' && chat.admins && chat.admins.includes(state.currentUser.id);
    if (chat.type === 'group') {
      ms.style.display = 'block';
      ml.innerHTML = chat.participants.map(uid => { const u = state.users.find(x => x.id === uid); if (!u) return ''; const n = `${u.firstName} ${u.lastName}`.trim(); const isMe = uid === state.currentUser.id; const cr = isAdmin && !isMe; return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;"><div class="avatar sm">${u.avatar ? `<img src="${escapeHtml(u.avatar)}">` : initial(n)}</div><div style="flex:1;font-size:12.5px;">${escapeHtml(n)}${isMe ? ' (вы)' : ''}</div>${cr ? `<button data-remove-uid="${uid}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:13px;"><i class="fas fa-user-minus"></i></button>` : ''}</div>`; }).join('');
      ml.querySelectorAll('[data-remove-uid]').forEach(btn => btn.addEventListener('click', () => removeGroupMember(chat.id, btn.dataset.removeUid)));
      document.getElementById('addGroupMemberBtn').style.display = isAdmin ? 'flex' : 'none';
    } else ms.style.display = 'none';
    const delBtn = document.getElementById('deleteContactBtn');
    delBtn.innerHTML = chat.type === 'group' ? '<i class="fas fa-trash-alt"></i> Удалить группу у всех' : '<i class="fas fa-user-minus"></i> Удалить контакт у всех';
    const oia = otherUser && (otherUser.isAdmin === true || otherUser.isOfficial === true);
    document.getElementById('blockContactBtn').style.display = (chat.type === 'group' || oia || chat.isGovChat) ? 'none' : 'flex';
    delBtn.style.display = (oia || chat.isGovChat) ? 'none' : 'flex';
    const rb = document.getElementById('reportUserBtn'); if (rb) rb.style.display = (chat.type === 'group' || oia || chat.isGovChat) ? 'none' : 'flex';
    const hcb = document.getElementById('hideChatBtn'); if (hcb) hcb.style.display = chat.isGovChat ? 'none' : 'flex';
    document.getElementById('contactProfile').classList.remove('hidden');
    document.getElementById('profilePanel').classList.add('open');
    updateBlockButton();
  });
  const closeProfileBtn = document.getElementById('closeProfileBtn');
  if (closeProfileBtn) closeProfileBtn.addEventListener('click', () => document.getElementById('profilePanel').classList.remove('open'));
  const delContactBtn = document.getElementById('deleteContactBtn');
  if (delContactBtn) delContactBtn.addEventListener('click', deleteContact);
  const blockBtn = document.getElementById('blockContactBtn');
  if (blockBtn) blockBtn.addEventListener('click', toggleBlockContact);

  const hideChatBtn = document.getElementById('hideChatBtn');
  if (hideChatBtn) hideChatBtn.addEventListener('click', () => document.getElementById('hideChatOverlay').classList.add('open'));
  const hcc = document.getElementById('hideChatCancel');
  if (hcc) hcc.addEventListener('click', () => document.getElementById('hideChatOverlay').classList.remove('open'));
  const hccf = document.getElementById('hideChatConfirm');
  if (hccf) hccf.addEventListener('click', () => { if (state.activeChatId) hideChatForMe(state.activeChatId); document.getElementById('hideChatOverlay').classList.remove('open'); });

  const exportBtn = document.getElementById('exportChatBtn');
  if (exportBtn) exportBtn.addEventListener('click', () => { if (state.activeChatId) exportChat(state.activeChatId); });

  const sidebarProfileBtn = document.getElementById('sidebarProfileBtn');
  if (sidebarProfileBtn) sidebarProfileBtn.addEventListener('click', openSettings);
  const railLogoutBtn = document.getElementById('railLogoutBtn');
  if (railLogoutBtn) railLogoutBtn.addEventListener('click', handleLogout);

  const settingsCancel = document.getElementById('settingsCancel');
  if (settingsCancel) settingsCancel.addEventListener('click', () => document.getElementById('settingsOverlay').classList.remove('open'));
  const settingsSave = document.getElementById('settingsSave');
  if (settingsSave) settingsSave.addEventListener('click', async () => {
    const fn = document.getElementById('settingsFirstName').value.trim();
    const ln = document.getElementById('settingsLastName').value.trim();
    const region = document.getElementById('settingsRegion').value;
    const about = document.getElementById('settingsAbout').value.trim();
    const av = pendingAvatarData || '';
    const dt = document.getElementById('darkThemeToggle').checked;
    const sd = document.getElementById('soundToggle').checked;
    const rt = document.getElementById('ringtoneSelect');
    if (!fn || !ln) { Sound.error(); showToast('Ошибка', 'Имя и фамилия пусты', 'fa-exclamation-circle'); return; }
    state.currentUser.firstName = fn;
    state.currentUser.lastName = ln;
    state.currentUser.about = about;
    state.currentUser.avatar = av;
    const newCitizenState = document.getElementById('citizenFRCToggle').checked === true;
    const wasCitizen = state.currentUser.isCitizenFRC === true;
    state.currentUser.isCitizenFRC = newCitizenState;
    state.currentUser.region = newCitizenState ? region : '';
    if (rt) state.settings.ringtone = rt.value;
    const idx = state.users.findIndex(u => u.id === state.currentUser.id);
    if (idx !== -1) state.users[idx] = state.currentUser;
    state.settings.darkTheme = dt; state.settings.sounds = sd;
    persistUsers(); persistSettings(); applySettings(); renderAll(); updateSidebarProfile();
    try { if (window.flypeFirebase) { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'users/' + state.currentUser.id), state.currentUser); } } catch (err) {}
    pendingAvatarData = null;
    document.getElementById('settingsOverlay').classList.remove('open');
    if (wasCitizen && !newCitizenState) { await deleteGosBotChat(); showToast('Режим гражданина выключен', 'Госуслуги ФРС скрыты', 'fa-eye-slash', 3500); }
    else if (!wasCitizen && newCitizenState) { await ensureGosBot(); createGosBotChat(state.currentUser); showToast('Режим гражданина включён', 'Чат с Ботом Госуслуг создан', 'fa-landmark', 3500); }
    applyCitizenMode();
    Sound.send(); showToast('Сохранено', '', 'fa-check-circle');
  });
  document.querySelectorAll('.theme-swatch').forEach(sw => {
    sw.addEventListener('click', () => { state.settings.theme = sw.dataset.theme; persistSettings(); applyTheme(); document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('selected', s === sw)); Sound.send(); });
  });
  const dtt = document.getElementById('darkThemeToggle');
  if (dtt) dtt.addEventListener('change', (e) => { state.settings.darkTheme = e.target.checked; persistSettings(); applyTheme(); });
  const sdt = document.getElementById('soundToggle');
  if (sdt) sdt.addEventListener('change', (e) => { state.settings.sounds = e.target.checked; persistSettings(); });
  const oft = document.getElementById('oldFlypeToggle');
  if (oft) oft.addEventListener('change', (e) => { state.settings.oldFlype = e.target.checked; persistSettings(); applyTheme(); Sound.send(); });
  const rts = document.getElementById('ringtoneSelect');
  if (rts) rts.addEventListener('change', (e) => { state.settings.ringtone = e.target.value; persistSettings(); });

  const restartTutBtn = document.getElementById('restartTutorialBtn');
  if (restartTutBtn) restartTutBtn.addEventListener('click', () => { document.getElementById('settingsOverlay').classList.remove('open'); startTutorial(); });

  const avatarBtn = document.getElementById('settingsAvatarBtn');
  if (avatarBtn) avatarBtn.addEventListener('click', () => document.getElementById('settingsAvatarFile').click());
  const avatarFile = document.getElementById('settingsAvatarFile');
  if (avatarFile) avatarFile.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5*1024*1024) { Sound.statusFailed(); return; }
    try { const compressed = await compressImage(file, 256, 0.8); pendingAvatarData = compressed; document.getElementById('settingsAvatarPreview').innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`; Sound.statusSent(); } catch (err) { Sound.error(); }
    e.target.value = '';
  });
  const avatarRemoveBtn = document.getElementById('settingsAvatarRemoveBtn');
  if (avatarRemoveBtn) avatarRemoveBtn.addEventListener('click', () => { pendingAvatarData = ''; document.getElementById('settingsAvatarPreview').textContent = initial(`${state.currentUser.firstName} ${state.currentUser.lastName}`); Sound.send(); });

  const reqKey = document.getElementById('requestKeyBtn');
  if (reqKey) reqKey.addEventListener('click', requestKeyFromOtherDevice);
  const swc = document.getElementById('syncWaitingCancel');
  if (swc) swc.addEventListener('click', async () => { if (!window.flypeFirebase) return; try { const { database, ref, remove } = window.flypeFirebase; await remove(ref(database, 'sync_requests/' + state.currentUser.id)); } catch (e) {} if (syncKeysListener) { syncKeysListener(); syncKeysListener = null; } document.getElementById('syncWaitingOverlay').classList.remove('open'); });
  const scy = document.getElementById('syncConfirmYes');
  if (scy) scy.addEventListener('click', async () => {
    if (!window.flypeFirebase) return;
    const u = state.currentUser; const myPr = localStorage.getItem('flype_private_key_' + u.id); if (!myPr) { Sound.error(); return; }
    const code = generateSyncCode(); const encryptedKey = await encryptPrivateKeyWithCode(myPr, code);
    const { database, ref, set, remove } = window.flypeFirebase;
    await set(ref(database, 'sync_keys/' + u.id), { encryptedKey, createdAt: Date.now(), expiresAt: Date.now() + SYNC_CODE_TTL });
    await remove(ref(database, 'sync_requests/' + u.id));
    document.getElementById('syncConfirmOverlay').classList.remove('open');
    document.getElementById('syncCodeValue').textContent = code;
    document.getElementById('syncCodeOverlay').classList.add('open');
  });
  const scn = document.getElementById('syncConfirmNo');
  if (scn) scn.addEventListener('click', async () => { if (!window.flypeFirebase) return; try { const { database, ref, remove } = window.flypeFirebase; await remove(ref(database, 'sync_requests/' + state.currentUser.id)); } catch (e) {} document.getElementById('syncConfirmOverlay').classList.remove('open'); });

  const cu = document.getElementById('changeUsernameBtn');
  if (cu) cu.addEventListener('click', () => { if (!canChangeId()) { Sound.error(); showToast('Подождите', 'Ник можно менять раз в 30 дней', 'fa-clock'); return; } document.getElementById('newIdDigits').value = ''; document.getElementById('newIdError').classList.remove('visible'); document.getElementById('changeIdOverlay').classList.add('open'); });
  const cic = document.getElementById('changeIdCancel');
  if (cic) cic.addEventListener('click', () => document.getElementById('changeIdOverlay').classList.remove('open'));
  const cis = document.getElementById('changeIdSave');
  if (cis) cis.addEventListener('click', async () => {
    const uinp = document.getElementById('newIdDigits').value.trim();
    const errEl = document.getElementById('newIdError'); errEl.classList.remove('visible');
    if (!isValidUsername(uinp)) { errEl.textContent = 'Ник: 4–20 символов.'; errEl.classList.add('visible'); Sound.error(); return; }
    const nn = normalizeUsername(uinp);
    if (nn === normalizeUsername(state.currentUser.flypeId)) { errEl.textContent = 'Это ваш текущий ник.'; errEl.classList.add('visible'); Sound.error(); return; }
    const taken = await isUsernameTaken(nn);
    if (taken) { errEl.textContent = 'Уже занят.'; errEl.classList.add('visible'); Sound.error(); return; }
    state.currentUser.flypeId = nn; state.currentUser.idChangedAt = Date.now();
    const idx = state.users.findIndex(u => u.id === state.currentUser.id); if (idx !== -1) state.users[idx] = state.currentUser;
    persistUsers();
    try { if (window.flypeFirebase) { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'users/' + state.currentUser.id), state.currentUser); } } catch (err) {}
    document.getElementById('settingsUsername').textContent = '@' + nn;
    renderAll(); updateChangeIdButton(); document.getElementById('changeIdOverlay').classList.remove('open');
    Sound.send(); showToast('Ник изменён', '@' + nn, 'fa-check-circle', 5000);
  });

  const mOn = document.getElementById('maintenanceOnBtn');
  if (mOn) mOn.addEventListener('click', async () => { if (!state.currentUser || !state.currentUser.isAdmin) return; const msg = prompt('Сообщение:', 'Скоро вернёмся!'); if (msg === null) return; try { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'maintenance'), { active: true, message: msg || '', startedAt: Date.now() }); showToast('Включено', '', 'fa-tools', 3000); } catch (err) { Sound.error(); } });
  const mOff = document.getElementById('maintenanceOffBtn');
  if (mOff) mOff.addEventListener('click', async () => { if (!state.currentUser || !state.currentUser.isAdmin) return; try { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'maintenance'), { active: false, message: '', stoppedAt: Date.now() }); showToast('Выключено', '', 'fa-check-circle', 3000); } catch (err) { Sound.error(); } });

  const sdp = document.getElementById('settingsDeleteProfileBtn');
  if (sdp) sdp.addEventListener('click', () => { if (state.currentUser && state.currentUser.isAdmin) { Sound.error(); showToast('Недоступно', 'Нельзя удалить аккаунт админа', 'fa-shield-alt', 3000); return; } openConfirmDeleteProfile(); });
  const dpc = document.getElementById('deleteProfileCancelBtn');
  if (dpc) dpc.addEventListener('click', closeConfirmDeleteProfile);
  const dpCf = document.getElementById('deleteProfileConfirmBtn');
  if (dpCf) dpCf.addEventListener('click', async () => {
    const check = document.getElementById('deleteProfileCheck'); if (!check.checked) { Sound.error(); showToast('Подтвердите', '', 'fa-exclamation-circle'); return; }
    closeConfirmDeleteProfile(); document.getElementById('settingsOverlay').classList.remove('open');
    setTimeout(() => { document.getElementById('deleteAccountPassword').value = ''; document.getElementById('deleteAccountConfirm').value = ''; document.getElementById('deleteAccountOverlay').classList.add('open'); }, 200);
  });
  const cdp = document.getElementById('confirmDeleteProfileOverlay');
  if (cdp) cdp.addEventListener('click', (e) => { if (e.target === cdp) closeConfirmDeleteProfile(); });
  const dac = document.getElementById('deleteAccountCancel');
  if (dac) dac.addEventListener('click', () => document.getElementById('deleteAccountOverlay').classList.remove('open'));
  const dacb = document.getElementById('deleteAccountConfirmBtn');
  if (dacb) dacb.addEventListener('click', deleteAccount);

  const ncb = document.getElementById('newChatBtn');
  if (ncb) ncb.addEventListener('click', () => { document.getElementById('newChatSearch').value = ''; renderNewChatResults(''); document.getElementById('newChatOverlay').classList.add('open'); });
  const ncc = document.getElementById('newChatCancel');
  if (ncc) ncc.addEventListener('click', () => document.getElementById('newChatOverlay').classList.remove('open'));
  const ncs = document.getElementById('newChatSearch');
  if (ncs) ncs.addEventListener('input', e => renderNewChatResults(e.target.value));

  const ngab = document.getElementById('newGroupAvatarBtn');
  if (ngab) ngab.addEventListener('click', () => document.getElementById('newGroupAvatarFile').click());
  const ngaf = document.getElementById('newGroupAvatarFile');
  if (ngaf) ngaf.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5*1024*1024 || !file.type.startsWith('image/')) { Sound.statusFailed(); return; }
    try { const compressed = await compressImage(file, 256, 0.8); newGroupAvatarData = compressed; document.getElementById('newGroupAvatarPreview').innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`; Sound.statusSent(); } catch (err) { Sound.error(); }
    e.target.value = '';
  });
  const ngb = document.getElementById('newGroupBtn');
  if (ngb) ngb.addEventListener('click', () => { document.getElementById('groupName').value = ''; document.getElementById('groupDescription').value = ''; document.getElementById('newGroupAvatarPreview').textContent = '?'; newGroupAvatarData = null; selectedGroupContacts = new Set(); renderNewGroupContacts(); document.getElementById('newGroupOverlay').classList.add('open'); });
  const ngc = document.getElementById('newGroupCancel');
  if (ngc) ngc.addEventListener('click', () => document.getElementById('newGroupOverlay').classList.remove('open'));
  const ngCr = document.getElementById('newGroupCreate');
  if (ngCr) ngCr.addEventListener('click', async () => {
    const name = document.getElementById('groupName').value.trim();
    const description = document.getElementById('groupDescription').value.trim();
    if (!name) { Sound.error(); showToast('Ошибка', 'Введите название', 'fa-exclamation-circle'); return; }
    if (selectedGroupContacts.size === 0) { Sound.error(); showToast('Ошибка', 'Выберите участников', 'fa-exclamation-circle'); return; }
    const ids = [state.currentUser.id, ...selectedGroupContacts];
    const chat = { id: genId(), type: 'group', name, description, avatar: newGroupAvatarData || '', participants: ids, admins: [state.currentUser.id], createdAt: Date.now(), lastMessageAt: Date.now(), createdBy: state.currentUser.id };
    state.chats.push(chat); persistChats();
    try { if (window.flypeFirebase) { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'chats/' + chat.id), chat); } } catch (err) {}
    state.activeChatId = chat.id; renderAll(); listenToMessages(chat.id);
    document.getElementById('newGroupOverlay').classList.remove('open');
    Sound.send(); showToast('Группа создана', name, 'fa-users');
  });
  const agb = document.getElementById('addGroupMemberBtn');
  if (agb) agb.addEventListener('click', () => { if (!state.activeChatId) return; document.getElementById('addMemberSearch').value = ''; renderAddMemberResults(''); document.getElementById('addMemberOverlay').classList.add('open'); });
  const amc = document.getElementById('addMemberCancel');
  if (amc) amc.addEventListener('click', () => document.getElementById('addMemberOverlay').classList.remove('open'));
  const ams = document.getElementById('addMemberSearch');
  if (ams) ams.addEventListener('input', e => renderAddMemberResults(e.target.value));

  const asb = document.getElementById('addStatusBtn');
  if (asb) asb.addEventListener('click', () => { document.getElementById('statusText').value = ''; pendingStatusImageData = null; document.getElementById('statusImagePreview').innerHTML = '<i class="fas fa-image"></i>'; document.getElementById('addStatusOverlay').classList.add('open'); });
  const asImgBtn = document.getElementById('statusImageBtn');
  if (asImgBtn) asImgBtn.addEventListener('click', () => document.getElementById('statusImageFile').click());
  const asImgFile = document.getElementById('statusImageFile');
  if (asImgFile) asImgFile.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5*1024*1024) { Sound.statusFailed(); showToast('Файл большой', 'Максимум 5 МБ', 'fa-exclamation-circle'); return; }
    if (!file.type.startsWith('image/')) { Sound.statusFailed(); showToast('Не картинка', '', 'fa-exclamation-circle'); return; }
    try { const compressed = await compressImage(file, 800, 0.75); pendingStatusImageData = compressed; document.getElementById('statusImagePreview').innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`; Sound.statusSent(); } catch (err) { Sound.error(); }
    e.target.value = '';
  });
  const asImgRemove = document.getElementById('statusImageRemoveBtn');
  if (asImgRemove) asImgRemove.addEventListener('click', () => { pendingStatusImageData = null; document.getElementById('statusImagePreview').innerHTML = '<i class="fas fa-image"></i>'; });
  const asc = document.getElementById('addStatusCancel');
  if (asc) asc.addEventListener('click', () => document.getElementById('addStatusOverlay').classList.remove('open'));
  const ascr = document.getElementById('addStatusCreate');
  if (ascr) ascr.addEventListener('click', async () => {
    const text = document.getElementById('statusText').value.trim();
    const img = pendingStatusImageData;
    if (!text && !img) { Sound.statusFailed(); showToast('Ошибка', 'Введите текст или фото', 'fa-exclamation-circle'); return; }
    const status = { id: genId(), userId: state.currentUser.id, userName: `${state.currentUser.firstName} ${state.currentUser.lastName}`.trim(), avatar: state.currentUser.avatar || '', text, imageUrl: img || '', timestamp: Date.now(), viewedBy: [state.currentUser.id] };
    state.statuses.push(status); persistStatuses(); renderStatusList();
    document.getElementById('addStatusOverlay').classList.remove('open'); pendingStatusImageData = null;
    try { if (window.flypeFirebase) { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'statuses/' + status.id), status); Sound.statusSent(); showToast('Опубликован', '', 'fa-check-circle'); } } catch (err) { Sound.statusFailed(); }
  });

  const bts = document.getElementById('backToSidebar');
  if (bts) bts.addEventListener('click', () => document.getElementById('sidebar').classList.remove('hidden'));

  const lbc = document.getElementById('lightboxClose');
  if (lbc) lbc.addEventListener('click', () => document.getElementById('lightboxOverlay').classList.remove('open'));
  const lbo = document.getElementById('lightboxOverlay');
  if (lbo) lbo.addEventListener('click', (e) => { if (e.target === lbo) lbo.classList.remove('open'); });

  document.querySelectorAll('.modal-close-x').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); const oid = btn.dataset.close; if (oid === 'confirmDeleteProfileOverlay') { closeConfirmDeleteProfile(); return; } if (oid) document.getElementById(oid).classList.remove('open'); else btn.closest('.modal-overlay')?.classList.remove('open'); }); });
  document.querySelectorAll('.modal-overlay').forEach(overlay => { overlay.addEventListener('click', (e) => { if (e.target === overlay) { if (overlay.id === 'confirmDeleteProfileOverlay') { closeConfirmDeleteProfile(); return; } if (overlay.id === 'incomingCallOverlay' || overlay.id === 'outgoingCallOverlay' || overlay.id === 'syncConfirmOverlay' || overlay.id === 'tutorialOverlay') return; overlay.classList.remove('open'); } }); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay.open').forEach(o => { if (o.id === 'confirmDeleteProfileOverlay') closeConfirmDeleteProfile(); else if (o.id !== 'tutorialOverlay') o.classList.remove('open'); }); } });

  const emc = document.getElementById('editMessageCancel');
  if (emc) emc.addEventListener('click', () => { document.getElementById('editMessageOverlay').classList.remove('open'); editingMsgId = null; editingChatId = null; });
  const ems = document.getElementById('editMessageSave');
  if (ems) ems.addEventListener('click', async () => {
    if (!editingMsgId || !editingChatId) return;
    const newText = document.getElementById('editMessageText').value.trim(); if (!newText) { Sound.error(); return; }
    try {
      if (window.flypeFirebase) { const { database, ref, update } = window.flypeFirebase; await update(ref(database, 'messages/' + editingMsgId), { text: newText, editedAt: Date.now() }); }
      const local = state.messages.find(m => m.id === editingMsgId); if (local) { local.text = newText; local.editedAt = Date.now(); }
      persistMessages(); renderMessages(editingChatId); renderChatList();
      document.getElementById('editMessageOverlay').classList.remove('open'); Sound.send();
    } catch (err) { Sound.error(); }
    editingMsgId = null; editingChatId = null;
  });

  const rub = document.getElementById('reportUserBtn');
  if (rub) rub.addEventListener('click', () => { if (!state.activeChatId) return; const chat = state.chats.find(c => c.id === state.activeChatId); if (!chat || chat.type !== 'private') return; const oid = chat.participants.find(p => p !== state.currentUser.id); const other = state.users.find(u => u.id === oid); if (!other) return; if (other.isAdmin || other.isOfficial) { Sound.error(); showToast('Недоступно', '', 'fa-shield-alt', 3000); return; } openReportModal(other); });
  const rdesc = document.getElementById('reportDescription');
  if (rdesc) rdesc.addEventListener('input', (e) => { document.getElementById('reportDescCounter').textContent = e.target.value.length; });
  const revf = document.getElementById('reportEvidenceFile');
  if (revf) revf.addEventListener('change', (e) => { const file = e.target.files[0]; const preview = document.getElementById('reportEvidencePreview'); if (!file) { pendingReportEvidence = null; preview.innerHTML = ''; return; } if (file.size > 2*1024*1024) { Sound.error(); e.target.value = ''; return; } const r = new FileReader(); r.onload = (ev) => { pendingReportEvidence = { name: file.name, size: file.size, type: file.type, data: ev.target.result }; preview.innerHTML = `<i class="fas fa-paperclip"></i> ${escapeHtml(file.name)}`; }; r.readAsDataURL(file); });
  const rcb = document.getElementById('reportCancelBtn');
  if (rcb) rcb.addEventListener('click', () => { document.getElementById('reportOverlay').classList.remove('open'); });
  const rsb = document.getElementById('reportSubmitBtn');
  if (rsb) rsb.addEventListener('click', async () => {
    if (!pendingReportTargetId) return;
    const reason = document.getElementById('reportReason').value;
    const description = document.getElementById('reportDescription').value.trim();
    if (!reason || !description || !pendingReportEvidence) { Sound.error(); showToast('Заполните всё', '', 'fa-exclamation-circle'); return; }
    const target = state.users.find(u => u.id === pendingReportTargetId); if (!target) return;
    const used = await getReportsCountThisMonth(state.currentUser.id, target.id);
    if (used >= REPORTS_LIMIT_PER_MONTH) { Sound.error(); showToast('Лимит', '', 'fa-exclamation-circle'); return; }
    const rl = { spam: 'Спам', insult: 'Оскорбления', threat: 'Угрозы', fraud: 'Мошенничество', inappropriate: 'Неприемлемый контент', other: 'Другое' };
    const report = { fromId: state.currentUser.id, fromName: `${state.currentUser.firstName} ${state.currentUser.lastName}`.trim(), toId: target.id, toName: `${target.firstName} ${target.lastName}`.trim(), reason, reasonLabel: rl[reason] || reason, description, evidence: pendingReportEvidence, timestamp: Date.now(), status: 'pending' };
    try {
      if (window.flypeFirebase) { const { database, ref, push, set } = window.flypeFirebase; const rr = push(ref(database, 'reports')); await set(rr, report); await sendReportToAdmin(report, rr.key); }
      Sound.send(); showToast('Жалоба отправлена', '', 'fa-check-circle', 4000);
      document.getElementById('reportOverlay').classList.remove('open');
      pendingReportTargetId = null; pendingReportEvidence = null;
    } catch (err) { Sound.error(); }
  });

  const aac = document.getElementById('adminActionCancel');
  if (aac) aac.addEventListener('click', () => { document.getElementById('adminActionOverlay').classList.remove('open'); adminActionReportId = null; });
  const awb = document.getElementById('adminWarnBtn');
  if (awb) awb.addEventListener('click', async () => {
    if (!adminActionReportId) return;
    const target = getTargetFromReport(adminActionReportId); if (!target) return;
    const comment = document.getElementById('adminActionComment').value.trim();
    try {
      const { database, ref, push, set, get, update } = window.flypeFirebase;
      const wr = push(ref(database, 'warnings')); await set(wr, { userId: target.id, userName: target.name, issuedBy: state.currentUser.id, reason: comment || 'Нарушение правил', reportId: adminActionReportId, timestamp: Date.now() });
      const sn = await get(ref(database, 'warnings')); const all = sn.val() || {};
      const count = Object.values(all).filter(w => w.userId === target.id).length;
      if (count >= WARNINGS_FOR_AUTOBAN) { await autoBanUser(target.id, target.name, `Накоплено ${count}`); showToast('Автобан', `${target.name} — ${AUTOBAN_DAYS} дней`, 'fa-ban', 5000); }
      else showToast('Предупреждение', `${target.name}: ${count}/${WARNINGS_FOR_AUTOBAN}`, 'fa-exclamation-triangle', 4000);
      await update(ref(database, 'reports/' + adminActionReportId), { status: 'resolved' });
      document.getElementById('adminActionOverlay').classList.remove('open'); adminActionReportId = null;
    } catch (err) { Sound.error(); }
  });
  const atb = document.getElementById('adminTempBanBtn');
  if (atb) atb.addEventListener('click', () => { if (!adminActionReportId) return; document.getElementById('banDaysInput').value = 7; document.getElementById('adminActionOverlay').classList.remove('open'); document.getElementById('banDaysOverlay').classList.add('open'); });
  const bdc = document.getElementById('banDaysCancel');
  if (bdc) bdc.addEventListener('click', () => document.getElementById('banDaysOverlay').classList.remove('open'));
  const bdC = document.getElementById('banDaysConfirm');
  if (bdC) bdC.addEventListener('click', async () => { const days = parseInt(document.getElementById('banDaysInput').value); if (!days || days < 1 || days > 365) { Sound.error(); return; } const target = getTargetFromReport(adminActionReportId); if (!target) return; await banUserForDays(target.id, target.name, days); document.getElementById('banDaysOverlay').classList.remove('open'); adminActionReportId = null; });
  const adu = document.getElementById('adminDeleteUserBtn');
  if (adu) adu.addEventListener('click', async () => { if (!adminActionReportId) return; const target = getTargetFromReport(adminActionReportId); if (!target) return; if (!confirm(`Удалить ${target.name} НАВСЕГДА?`)) return; await deleteUserForever(target.id, target.name); document.getElementById('adminActionOverlay').classList.remove('open'); adminActionReportId = null; });

  // ГОСУСЛУГИ - навигация
  document.querySelectorAll('.gos-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => renderGosSection(btn.dataset.gosSection));
  });

  // Госуслуги-модалки
  const emSend = document.getElementById('emSend');
  if (emSend) emSend.addEventListener('click', async () => {
    const region = document.getElementById('emRegion').value;
    const type = document.getElementById('emType').value;
    const level = document.getElementById('emLevel').value;
    const description = document.getElementById('emDescription').value.trim();
    const until = document.getElementById('emUntil').value;
    if (!description) { Sound.error(); return; }
    const typeLabels = { fire: 'Пожар', flood: 'Наводнение', earthquake: 'Землетрясение', war: 'Военное положение', epidemic: 'Эпидемия', other: 'ЧС' };
    const levelLabels = { low: 'Низкий', medium: 'Средний', high: 'ВЫСОКИЙ', critical: '🔴 КРИТИЧЕСКИЙ' };
    const scopeLabel = region === 'all' ? 'Вся страна' : region;
    const text = `🚨 ЧРЕЗВЫЧАЙНАЯ СИТУАЦИЯ\n\nРеспублика: ${scopeLabel}\nТип: ${typeLabels[type]}\nУровень: ${levelLabels[level]}\n${until ? 'Действует до: ' + until + '\n' : ''}\n${description}`;
    const sent = await broadcastFromGosBot({ audience: region === 'all' ? { type: 'all' } : { type: 'region', region }, messageType: 'emergency', text, meta: { emergencyType: type, level, until, description, scope: region }, priority: level === 'critical' ? 'critical' : 'high' });
    if (sent > 0) showToast('Объявлено', `Разослано ${sent}`, 'fa-exclamation-triangle', 4000);
    document.getElementById('gosEmergencyOverlay').classList.remove('open');
    document.getElementById('emDescription').value = '';
  });
  const elAdd = document.getElementById('elAddCandidate');
  if (elAdd) elAdd.addEventListener('click', () => { elCandidateList.push({ id: genId(), name: '' }); renderElectionCandidates(elCandidateList); });
  const elSend = document.getElementById('elSend');
  if (elSend) elSend.addEventListener('click', async () => {
    const type = document.getElementById('elType').value;
    const scope = document.getElementById('elScope').value;
    const start = document.getElementById('elStart').value;
    const end = document.getElementById('elEnd').value;
    const candidates = elCandidateList.filter(c => c.name.trim());
    if (candidates.length < 2) { Sound.error(); showToast('Ошибка', 'Минимум 2 кандидата', 'fa-exclamation-circle'); return; }
    if (!start || !end) { Sound.error(); return; }
    const typeLabels = { president: 'Президентские', parliament: 'Парламентские', republic: 'Республиканские', regional: 'Областные', referendum: 'Референдум' };
    const scopeLabel = scope === 'all' ? 'Вся страна' : scope;
    const electionId = 'election_' + genId();
    const text = `🗳️ ${typeLabels[type].toUpperCase()}\n\nРеспублика: ${scopeLabel}\nПериод: ${new Date(start).toLocaleString('ru-RU')} — ${new Date(end).toLocaleString('ru-RU')}\n\nПроголосуйте за одного из кандидатов ниже:`;
    const sent = await broadcastFromGosBot({ audience: scope === 'all' ? { type: 'all' } : { type: 'region', region: scope }, messageType: 'election', text, meta: { electionId, electionType: type, scope, start, end, candidates }, priority: 'high' });
    if (window.flypeFirebase) { try { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'elections/' + electionId), { id: electionId, type, scope, start, end, candidates, status: 'active', createdAt: Date.now(), createdBy: state.currentUser.id, votes: {} }); } catch (e) {} }
    if (sent > 0) showToast('Выборы объявлены', `Разослано ${sent}`, 'fa-vote-yea', 4000);
    document.getElementById('gosElectionOverlay').classList.remove('open'); elCandidateList = [];
  });
  const taxSearch = document.getElementById('taxCitizenSearch');
  if (taxSearch) taxSearch.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const c = document.getElementById('taxCitizenResults');
    if (!q) { c.innerHTML = ''; return; }
    const users = state.users.filter(u => !u.isOfficial && !u.isBot && u.id !== state.currentUser.id && u.id !== 'flype_bot').filter(u => { const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase(); const fid = (u.flypeId || '').toLowerCase(); return name.includes(q) || fid.includes(q); }).slice(0, 8);
    if (users.length === 0) { c.innerHTML = '<div style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">Никого</div>'; return; }
    c.innerHTML = users.map(u => { const n = `${u.firstName} ${u.lastName}`; return `<div data-tax-uid="${u.id}" style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;border-radius:var(--radius);"><div class="avatar sm">${u.avatar ? `<img src="${escapeHtml(u.avatar)}">` : initial(n)}</div><div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;">${escapeHtml(n)}</div><div style="font-size:10.5px;font-family:monospace;color:var(--text-muted);">@${escapeHtml(u.flypeId || '')}</div></div></div>`; }).join('');
    c.querySelectorAll('[data-tax-uid]').forEach(el => el.addEventListener('click', () => { const u = state.users.find(x => x.id === el.dataset.taxUid); if (!u) return; selectedTaxCitizen = u; const sel = document.getElementById('taxSelectedCitizen'); sel.style.display = 'block'; sel.innerHTML = `✅ Выбран: <b>${escapeHtml(u.firstName + ' ' + u.lastName)}</b> (@${escapeHtml(u.flypeId)})`; c.innerHTML = ''; document.getElementById('taxCitizenSearch').value = ''; }));
  });
  const taxSend = document.getElementById('taxSend');
  if (taxSend) taxSend.addEventListener('click', async () => {
    if (!selectedTaxCitizen) { Sound.error(); showToast('Ошибка', 'Выберите гражданина', 'fa-exclamation-circle'); return; }
    const type = document.getElementById('taxType').value; const amount = document.getElementById('taxAmount').value; const reason = document.getElementById('taxReason').value.trim(); const dueDate = document.getElementById('taxDueDate').value;
    if (!amount || !dueDate) { Sound.error(); return; }
    const typeLabels = { income: 'Подоходный', transport: 'Транспортный', land: 'Земельный', property: 'Имущественный', fine: 'Штраф', other: 'Налог' };
    const taxId = 'tax_' + genId();
    const text = `💰 НАЛОГОВОЕ УВЕДОМЛЕНИЕ\n\nТип: ${typeLabels[type]}\nСумма: ${amount} ₮\n${reason ? 'Основание: ' + reason + '\n' : ''}Оплатить до: ${dueDate}`;
    try {
      const { database, ref, get, set, push, update } = window.flypeFirebase;
      const chatId = 'chat_gosbot_' + selectedTaxCitizen.id;
      const chatSnap = await get(ref(database, 'chats/' + chatId));
      if (!chatSnap.exists()) { await set(ref(database, 'chats/' + chatId), { id: chatId, type: 'private', participants: [selectedTaxCitizen.id, 'gosbot'], createdAt: Date.now(), lastMessageAt: Date.now(), isGovChat: true }); }
      const msgRef = push(ref(database, 'messages'));
      await set(msgRef, { chatId, senderId: 'gosbot', text, timestamp: Date.now(), read: false, type: 'tax', priority: 'high', meta: { taxId, taxType: type, amount: Number(amount), reason, dueDate } });
      await update(ref(database, 'chats/' + chatId), { lastMessageAt: Date.now(), lastMessage: text.slice(0, 60) });
      await set(ref(database, 'taxes/' + taxId), { id: taxId, userId: selectedTaxCitizen.id, type, amount: Number(amount), reason, dueDate, status: 'unpaid', issuedBy: state.currentUser.id, issuedAt: Date.now() });
      showToast('Налог выписан', `${selectedTaxCitizen.firstName}: ${amount} ₮`, 'fa-check-circle', 4000);
      document.getElementById('gosTaxOverlay').classList.remove('open'); selectedTaxCitizen = null;
      document.getElementById('taxSelectedCitizen').style.display = 'none';
      document.getElementById('taxAmount').value = ''; document.getElementById('taxReason').value = '';
    } catch (e) { Sound.error(); }
  });
  const anSend = document.getElementById('anSend');
  if (anSend) anSend.addEventListener('click', async () => {
    const title = document.getElementById('anTitle').value.trim(); const text = document.getElementById('anText').value.trim();
    const audience = document.getElementById('anAudience').value; const importance = document.getElementById('anImportance').value;
    if (!title || !text) { Sound.error(); return; }
    const impLabel = { normal: '', important: '📙 ВАЖНО\n', critical: '📕 КРИТИЧЕСКИ ВАЖНО\n' };
    const msgText = `📢 ${title.toUpperCase()}\n${impLabel[importance]}\n${text}`;
    const sent = await broadcastFromGosBot({ audience: audience === 'all' ? { type: 'all' } : { type: 'region', region: audience }, messageType: 'announcement', text: msgText, meta: { title, importance }, priority: importance === 'critical' ? 'critical' : (importance === 'important' ? 'high' : 'normal') });
    if (sent > 0) showToast('Отправлено', `Разослано ${sent}`, 'fa-bullhorn', 4000);
    document.getElementById('gosAnnounceOverlay').classList.remove('open'); document.getElementById('anTitle').value = ''; document.getElementById('anText').value = '';
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.gos-panel-btn'); if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'emergency') document.getElementById('gosEmergencyOverlay').classList.add('open');
    if (action === 'election') { elCandidateList = []; renderElectionCandidates([]); document.getElementById('gosElectionOverlay').classList.add('open'); }
    if (action === 'tax') document.getElementById('gosTaxOverlay').classList.add('open');
    if (action === 'announcement') document.getElementById('gosAnnounceOverlay').classList.add('open');
  });

  document.addEventListener('click', async (e) => {
    const payBtn = e.target.closest('.pay-tax-btn');
    if (payBtn) {
      const taxId = payBtn.dataset.taxId;
      try {
        if (window.flypeFirebase) { const { database, ref, update } = window.flypeFirebase; await update(ref(database, 'taxes/' + taxId), { status: 'paid', paidAt: Date.now() }); }
        document.getElementById('taxPaidDetails').textContent = `Налог №${taxId.slice(-6)} — ✅ Оплачен (${CURRENCY})`;
        document.getElementById('taxPaidOverlay').classList.add('open'); Sound.send();
      } catch (err) { Sound.error(); }
      return;
    }
    const voteBtn = e.target.closest('.vote-btn');
    if (voteBtn) {
      const electionId = voteBtn.dataset.election; const candidateId = voteBtn.dataset.candidate;
      const candidateName = voteBtn.textContent.replace('🗳️','').trim();
      try {
        if (window.flypeFirebase) { const { database, ref, get, update } = window.flypeFirebase; const snap = await get(ref(database, 'elections/' + electionId)); if (snap.exists()) { const el = snap.val(); const votes = el.votes || {}; if (votes[state.currentUser.id]) { Sound.error(); showToast('Уже голосовали', '', 'fa-info-circle', 3000); return; } votes[state.currentUser.id] = candidateId; await update(ref(database, 'elections/' + electionId), { votes }); } }
        document.getElementById('voteConfirmName').textContent = candidateName;
        document.getElementById('voteConfirmOverlay').classList.add('open'); Sound.send();
      } catch (err) { Sound.error(); }
      return;
    }
  });
  const tpc = document.getElementById('taxPaidClose');
  if (tpc) tpc.addEventListener('click', () => document.getElementById('taxPaidOverlay').classList.remove('open'));
  const vcc = document.getElementById('voteConfirmClose');
  if (vcc) vcc.addEventListener('click', () => document.getElementById('voteConfirmOverlay').classList.remove('open'));

  const tutNext = document.getElementById('tutorialNext');
  if (tutNext) tutNext.addEventListener('click', nextTutorialStep);
  const tutSkip = document.getElementById('tutorialSkip');
  if (tutSkip) tutSkip.addEventListener('click', () => closeTutorial(true));
});

/* ================== ФУНКЦИИ ВНЕ DOMContentLoaded ================== */
function renderNewChatResults(query) {
  const c = document.getElementById('newChatResults'); if (!c) return;
  const q = query.trim().toLowerCase();
  let users = state.users.filter(u => u.id !== state.currentUser.id && u.id !== 'flype_bot');
  users = users.filter(u => u.id && (u.email || u.flypeId)); users = users.filter(u => !u.banned || u.bannedUntil > Date.now());
  if (q) users = users.filter(u => { const n = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase(); const fid = (u.flypeId || '').toLowerCase(); return n.includes(q) || fid.includes(q); });
  if (users.length === 0) { c.innerHTML = `<div style="text-align:center;color:var(--text-secondary);font-size:12.5px;padding:14px;">${q ? 'Ничего не найдено' : 'Нет других'}</div>`; return; }
  c.innerHTML = users.map(u => { const n = `${u.firstName} ${u.lastName}`.trim(); return `<div class="chat-item" data-user-id="${u.id}" style="cursor:pointer;border-left:none;"><div class="avatar sm">${u.avatar ? `<img src="${escapeHtml(u.avatar)}">` : (u.id === 'gosbot' ? '<i class="fas fa-landmark"></i>' : initial(n))}</div><div class="chat-info"><div class="name">${escapeHtml(n)}${u.isAdmin ? ' <i class="fas fa-shield-alt" style="color:var(--accent);font-size:10px;"></i>' : ''}</div><div class="last-msg" style="font-family:monospace;font-size:10.5px;">@${escapeHtml(u.flypeId || '')}</div></div></div>`; }).join('');
  c.querySelectorAll('.chat-item').forEach(el => el.addEventListener('click', () => { openChatWithUser(el.dataset.userId); document.getElementById('newChatOverlay').classList.remove('open'); }));
}
async function openChatWithUser(userId) {
  let chat = state.chats.find(c => c.type === 'private' && c.participants.includes(state.currentUser.id) && c.participants.includes(userId));
  if (!chat && window.flypeFirebase) {
    try {
      const { database, ref, get, remove } = window.flypeFirebase;
      const sn = await get(ref(database, 'chats')); const all = sn.val() || {};
      const matches = Object.values(all).filter(c => c.type === 'private' && c.participants && c.participants.includes(state.currentUser.id) && c.participants.includes(userId));
      if (matches.length > 0) {
        matches.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); chat = matches[0];
        if (matches.length > 1) { for (let i = 1; i < matches.length; i++) { try { await remove(ref(database, 'chats/' + matches[i].id)); } catch (e) {} } }
        if (!state.chats.find(c => c.id === chat.id)) state.chats.push(chat); persistChats();
      }
    } catch (err) {}
  }
  if (!chat) {
    chat = { id: genId(), type: 'private', participants: [state.currentUser.id, userId], createdAt: Date.now(), lastMessageAt: Date.now(), createdBy: state.currentUser.id };
    state.chats.push(chat); persistChats();
    try { if (window.flypeFirebase) { const { database, ref, set } = window.flypeFirebase; await set(ref(database, 'chats/' + chat.id), chat); } } catch (err) {}
  }
  unhideChat(chat.id);
  state.activeChatId = chat.id;
  renderAll(); listenToMessages(chat.id);
  if (window.innerWidth <= 900) document.getElementById('sidebar').classList.add('hidden');
}
function canChangeId() { if (!state.currentUser.idChangedAt) return true; return Date.now() - state.currentUser.idChangedAt >= ID_CHANGE_COOLDOWN; }
function updateChangeIdButton() {
  const btn = document.getElementById('changeUsernameBtn'); const timer = document.getElementById('changeIdTimer');
  if (!btn) return;
  if (canChangeId()) { btn.disabled = false; btn.style.opacity = '1'; timer.style.display = 'none'; }
  else { btn.disabled = true; btn.style.opacity = '0.5'; const left = ID_CHANGE_COOLDOWN - (Date.now() - state.currentUser.idChangedAt); const days = Math.ceil(left/(24*60*60*1000)); timer.textContent = `Следующая смена через ${days} дн.`; timer.style.display = 'block'; }
}
function openSettings() {
  const u = state.currentUser; if (!u) return;
  document.getElementById('settingsFirstName').value = u.firstName;
  document.getElementById('settingsLastName').value = u.lastName;
  document.getElementById('settingsRegion').value = u.region || '';
  document.getElementById('settingsAbout').value = u.about || '';
  document.getElementById('aboutCounter').textContent = (u.about || '').length;
  document.getElementById('settingsUsername').textContent = '@' + (u.flypeId || '');
  document.getElementById('darkThemeToggle').checked = state.settings.darkTheme;
  document.getElementById('soundToggle').checked = state.settings.sounds;
  const oft = document.getElementById('oldFlypeToggle'); if (oft) oft.checked = state.settings.oldFlype === true;
  const rt = document.getElementById('ringtoneSelect'); if (rt) rt.value = state.settings.ringtone || 'sounds/Flype-Standart.mp3';
  const cft = document.getElementById('citizenFRCToggle'); if (cft) cft.checked = u.isCitizenFRC === true;
  pendingAvatarData = u.avatar || '';
  const preview = document.getElementById('settingsAvatarPreview');
  if (u.avatar) preview.innerHTML = `<img src="${escapeHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  else preview.textContent = initial(`${u.firstName} ${u.lastName}`);
  updateChangeIdButton(); updateAdminPanel();
  applyCitizenMode();
  document.querySelectorAll('.theme-swatch').forEach(sw => sw.classList.toggle('selected', sw.dataset.theme === (state.settings.theme || 'standard')));
  document.getElementById('settingsOverlay').classList.add('open');
}
function openConfirmDeleteProfile() {
  const check = document.getElementById('deleteProfileCheck'); const btn = document.getElementById('deleteProfileConfirmBtn');
  const tb = document.getElementById('deleteProfileTimer'); const tv = document.getElementById('deleteProfileTimerValue');
  check.checked = false; check.disabled = true; btn.disabled = true; btn.style.opacity = '0.5'; tb.style.display = 'block'; tv.textContent = '5';
  document.getElementById('confirmDeleteProfileOverlay').classList.add('open');
  let left = 5;
  const int = setInterval(() => { left--; tv.textContent = left; if (left <= 0) { clearInterval(int); check.disabled = false; btn.disabled = false; btn.style.opacity = '1'; tb.style.display = 'none'; Sound.send(); } }, 1000);
}
function closeConfirmDeleteProfile() { document.getElementById('confirmDeleteProfileOverlay').classList.remove('open'); }
async function deleteAccount() {
  const user = state.currentUser; if (!user) return;
  if (user.isAdmin) { Sound.error(); showToast('Недоступно', '', 'fa-shield-alt', 3000); return; }
  const pwd = document.getElementById('deleteAccountPassword').value;
  if (pwd !== user.password) { Sound.error(); showToast('Неверный пароль', '', 'fa-exclamation-circle'); return; }
  const cw = document.getElementById('deleteAccountConfirm').value.trim();
  if (cw !== 'УДАЛИТЬ') { Sound.error(); showToast('Введите УДАЛИТЬ', '', 'fa-exclamation-circle'); return; }
  await deleteUserForever(user.id, `${user.firstName} ${user.lastName}`.trim());
  await deleteAuthUser(pwd);
  if (window.flypeFirebase && window.flypeFirebase.signOut) { try { await window.flypeFirebase.signOut(window.flypeFirebase.auth); } catch (e) {} }
  localStorage.removeItem(STORAGE_KEYS.currentUserId); localStorage.removeItem('flype_private_key_' + user.id); localStorage.removeItem('flype_sync_unlock_until'); localStorage.removeItem('flype_is_primary');
  stopPresenceHeartbeat(); state.currentUser = null; state.activeChatId = null;
  state.users = []; state.chats = []; state.messages = [];
  if (messagesUnsubscribe) { messagesUnsubscribe(); messagesUnsubscribe = null; }
  if (callListenerUnsubscribe) { callListenerUnsubscribe(); callListenerUnsubscribe = null; }
  document.getElementById('deleteAccountOverlay').classList.remove('open');
  showAuthScreen(); document.getElementById('loginForm').reset(); document.getElementById('registerForm').reset();
}

/* ============================================================
   МОДУЛИ СУПЕР-АППА
   ============================================================ */
(function() {
  'use strict';

  function switchApp(appName) {
    document.querySelectorAll('.app-rail-btn').forEach(b => b.classList.toggle('active', b.dataset.app === appName));
    document.querySelectorAll('.app-module').forEach(m => m.classList.remove('active'));
    const mod = document.getElementById('module-' + appName);
    if (mod) mod.classList.add('active');

    if (appName === 'news' && !window.__newsLoaded) { window.__newsLoaded = true; loadNews(); }
    if (appName === 'music') renderMusicList();
    if (appName === 'video') renderVideoHistory();
    if (appName === 'gossuslugi') renderGosSection(state.gosSection || 'dashboard');

    state.activeApp = appName;
    saveData('flype_active_app', appName);
  }
  document.querySelectorAll('.app-rail-btn[data-app]').forEach(btn => {
    btn.addEventListener('click', () => switchApp(btn.dataset.app));
  });

  /* Браузер */
  const bwFrame = document.getElementById('bwFrame');
  const bwAddress = document.getElementById('bwAddress');
  const bwBlocked = document.getElementById('bwBlocked');
  const bwHistory = [];
  let bwHistoryIndex = -1;
  function normalizeUrl(input) { if (!input) return ''; input = input.trim(); if (/^https?:\/\//i.test(input)) return input; if (/^[\w-]+\.[\w-]+/.test(input)) return 'https://' + input; return 'https://duckduckgo.com/?q=' + encodeURIComponent(input); }
  function navigateBrowser(url, addHistory = true) {
    if (!url) return; url = normalizeUrl(url); bwAddress.value = url; bwBlocked.classList.add('hidden');
    try { bwFrame.src = url; if (addHistory) { bwHistory.splice(bwHistoryIndex + 1); bwHistory.push(url); bwHistoryIndex = bwHistory.length - 1; } setTimeout(() => { try { const doc = bwFrame.contentDocument; if (!doc || doc.location.href === 'about:blank') bwBlocked.classList.remove('hidden'); } catch (e) {} }, 1200); } catch (e) { bwBlocked.classList.remove('hidden'); }
  }
  if (bwAddress) bwAddress.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigateBrowser(e.target.value); });
  const bwBack = document.getElementById('bwBack'); if (bwBack) bwBack.addEventListener('click', () => { if (bwHistoryIndex > 0) { bwHistoryIndex--; navigateBrowser(bwHistory[bwHistoryIndex], false); } });
  const bwFwd = document.getElementById('bwForward'); if (bwFwd) bwFwd.addEventListener('click', () => { if (bwHistoryIndex < bwHistory.length - 1) { bwHistoryIndex++; navigateBrowser(bwHistory[bwHistoryIndex], false); } });
  const bwRel = document.getElementById('bwReload'); if (bwRel) bwRel.addEventListener('click', () => { try { bwFrame.src = bwFrame.src; } catch (e) {} });
  const bwHome = document.getElementById('bwHome'); if (bwHome) bwHome.addEventListener('click', () => navigateBrowser('https://duckduckgo.com/'));
  const bwExt = document.getElementById('bwExternal'); if (bwExt) bwExt.addEventListener('click', () => { if (bwAddress.value) window.open(normalizeUrl(bwAddress.value), '_blank'); });
  const bwBlockedOpen = document.getElementById('bwBlockedOpen'); if (bwBlockedOpen) bwBlockedOpen.addEventListener('click', () => { if (bwAddress.value) window.open(normalizeUrl(bwAddress.value), '_blank'); });
  document.querySelectorAll('.bw-bm').forEach(bm => bm.addEventListener('click', () => navigateBrowser(bm.dataset.url)));

  /* Новости */
  const RSS2JSON_ENDPOINT = 'https://api.rss2json.com/v1/api.json?rss_url=';
  const TRANSLATE_ENDPOINT = 'https://api.mymemory.translated.net/get?q=';
  const RUSSIAN_DOMAINS = ['ria.ru', 'tass.ru', 'lenta.ru', 'iz.ru', 'kommersant.ru', 'gazeta.ru', 'rt.com', 'russian.rt.com'];
  function isRussianSource(url) { if (!url) return false; return RUSSIAN_DOMAINS.some(d => url.includes(d)); }
  async function translateToRussian(text) { if (!text || text.length < 2) return text; try { const url = TRANSLATE_ENDPOINT + encodeURIComponent(text.slice(0, 480)) + '&langpair=auto|ru'; const res = await fetch(url); if (!res.ok) return text; const data = await res.json(); return (data.responseData && data.responseData.translatedText) ? data.responseData.translatedText : text; } catch (e) { return text; } }
  async function loadNews() {
    const list = document.getElementById('newsList'); const src = document.getElementById('newsSource'); if (!list || !src) return;
    const url = src.value; const needTranslate = !isRussianSource(url);
    list.innerHTML = `<div class="news-loading"><i class="fas fa-circle-notch fa-spin"></i> Загрузка${needTranslate ? ' и перевод...' : '...'}</div>`;
    try {
      const res = await fetch(RSS2JSON_ENDPOINT + encodeURIComponent(url)); const data = await res.json();
      if (!data.items || data.items.length === 0) { list.innerHTML = `<div class="news-loading"><i class="fas fa-exclamation-triangle" style="color:#F4B400;"></i> Новостей нет</div>`; return; }
      const items = data.items.slice(0, 20);
      list.innerHTML = items.map((item, idx) => {
        const thumb = item.thumbnail || (item.enclosure && item.enclosure.link) || '';
        const date = item.pubDate ? new Date(item.pubDate).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        const descRaw = (item.description || '').replace(/<[^>]+>/g, '').slice(0, 220);
        return `<div class="news-item" data-url="${escapeHtml(item.link)}" data-idx="${idx}"><div class="news-thumb">${thumb ? `<img src="${escapeHtml(thumb)}" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-newspaper\\'></i>'">` : '<i class="fas fa-newspaper"></i>'}</div><div class="news-body"><div class="news-title" data-orig="${escapeHtml(item.title || '')}">${escapeHtml(item.title || '')}</div><div class="news-desc" data-orig="${escapeHtml(descRaw)}">${escapeHtml(descRaw)}</div><div class="news-meta"><span><i class="fas fa-clock"></i> ${date}</span><span><i class="fas fa-globe"></i> ${escapeHtml(data.feed.title || '')}</span>${needTranslate ? '<span style="color:#B8860B;"><i class="fas fa-language"></i> перевод...</span>' : ''}</div></div></div>`;
      }).join('');
      list.querySelectorAll('.news-item').forEach(el => el.addEventListener('click', () => window.open(el.dataset.url, '_blank')));
      if (needTranslate) {
        const maxTranslate = 8;
        for (let i = 0; i < Math.min(items.length, maxTranslate); i++) {
          const item = items[i]; const el = list.querySelector(`.news-item[data-idx="${i}"]`); if (!el) continue;
          const titleEl = el.querySelector('.news-title'); const descEl = el.querySelector('.news-desc');
          const origTitle = titleEl.dataset.orig; const origDesc = descEl.dataset.orig;
          const tTitle = await translateToRussian(origTitle); if (tTitle) titleEl.textContent = tTitle;
          if (origDesc) { const tDesc = await translateToRussian(origDesc); if (tDesc) descEl.textContent = tDesc; }
          const meta = el.querySelector('.news-meta'); const langEl = meta && meta.querySelector('.fa-language'); if (langEl && langEl.parentElement) langEl.parentElement.remove();
        }
      }
    } catch (err) { list.innerHTML = `<div class="news-loading"><i class="fas fa-exclamation-triangle" style="color:#D93025;"></i> Не удалось загрузить.</div>`; }
  }
  const newsRefresh = document.getElementById('newsRefresh'); if (newsRefresh) newsRefresh.addEventListener('click', () => { window.__newsLoaded = false; loadNews(); window.__newsLoaded = true; });
  const newsSource = document.getElementById('newsSource'); if (newsSource) newsSource.addEventListener('change', () => { loadNews(); window.__newsLoaded = true; });

  /* ВИДЕО — ИСТОРИЯ В LOCALSTORAGE */
  const videoFrame = document.getElementById('videoFrame');
  const videoDirect = document.getElementById('videoDirect');
  const videoPlaceholder = document.getElementById('videoPlaceholder');
  const videoUrlInput = document.getElementById('videoUrlInput');
  function parseVideoUrl(url) {
    if (!url) return null; url = url.trim();
    if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url)) return { type: 'direct', url };
    let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) return { type: 'iframe', url: `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0`, src: 'YouTube' };
    m = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
    if (m) return { type: 'iframe', url: `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2`, src: 'VK Видео' };
    m = url.match(/rutube\.ru\/video\/([a-f0-9]{32})/i);
    if (m) return { type: 'iframe', url: `https://rutube.ru/play/embed/${m[1]}`, src: 'Rutube' };
    m = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
    if (m) return { type: 'iframe', url: `https://www.dailymotion.com/embed/video/${m[1]}`, src: 'Dailymotion' };
    m = url.match(/vimeo\.com\/(\d+)/);
    if (m) return { type: 'iframe', url: `https://player.vimeo.com/video/${m[1]}`, src: 'Vimeo' };
    if (/\/embed\//.test(url) || /\/play\/embed\//.test(url) || /video_ext\.php/.test(url)) return { type: 'iframe', url, src: 'Embed' };
    return { type: 'unknown', url };
  }
  function getVideoHistory() { return loadData('flype_video_history', []); }
  function saveVideoHistory(hist) { saveData('flype_video_history', hist); }
  function renderVideoHistory() {
    const c = document.getElementById('videoHistoryList'); if (!c) return;
    const hist = getVideoHistory();
    if (hist.length === 0) { c.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-muted);font-size:12.5px;">История пуста</div>'; return; }
    c.innerHTML = hist.slice(0, 30).map((h) => `<div class="video-history-item" data-video-url="${escapeHtml(h.url)}"><i class="fas fa-play-circle"></i><div class="vh-info"><div class="vh-title">${escapeHtml(h.title || h.url)}</div><div class="vh-src">${escapeHtml(h.src || 'Видео')} · ${new Date(h.ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div><button data-del-history="${escapeHtml(h.url)}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:12px;padding:4px 8px;" title="Удалить"><i class="fas fa-times"></i></button></div>`).join('');
    c.querySelectorAll('[data-video-url]').forEach(el => {
      el.addEventListener('click', (e) => { if (e.target.closest('[data-del-history]')) return; videoUrlInput.value = el.dataset.videoUrl; loadVideo(el.dataset.videoUrl); });
    });
    c.querySelectorAll('[data-del-history]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); const url = btn.dataset.delHistory; const hist2 = getVideoHistory().filter(h => h.url !== url); saveVideoHistory(hist2); renderVideoHistory(); showToast('Удалено из истории', '', 'fa-trash-alt', 2000); });
    });
  }
  function saveVideoToHistory(url, title, src) {
    const hist = getVideoHistory();
    const filtered = hist.filter(h => h.url !== url);
    filtered.unshift({ url, title: title || url, src, ts: Date.now() });
    saveVideoHistory(filtered.slice(0, 50));
    renderVideoHistory();
  }
  function loadVideo(url) {
    const parsed = parseVideoUrl(url); if (!parsed) { Sound.error(); showToast('Ошибка', 'Неверная ссылка', 'fa-exclamation-circle'); return; }
    videoPlaceholder.classList.add('hidden'); videoFrame.classList.add('hidden'); videoDirect.classList.add('hidden');
    try { videoDirect.pause(); videoDirect.src = ''; } catch (e) {}
    if (parsed.type === 'iframe') { videoFrame.src = parsed.url; videoFrame.classList.remove('hidden'); showToast('Загружено', parsed.src, 'fa-play-circle', 2500); saveVideoToHistory(url, parsed.src + ' видео', parsed.src); }
    else if (parsed.type === 'direct') { videoDirect.src = parsed.url; videoDirect.classList.remove('hidden'); videoDirect.play().catch(() => { showToast('Ошибка', 'Не удалось воспроизвести', 'fa-exclamation-circle'); }); showToast('Загружено', 'Прямое видео', 'fa-play-circle', 2500); saveVideoToHistory(url, 'mp4 видео', 'Прямая ссылка'); }
    else { videoPlaceholder.classList.remove('hidden'); showToast('Неизвестный формат', 'YouTube, VK, Rutube, Dailymotion, Vimeo, mp4', 'fa-info-circle', 5000); }
  }
  const videoLoadBtn = document.getElementById('videoLoadBtn');
  if (videoLoadBtn) videoLoadBtn.addEventListener('click', () => { if (videoUrlInput && videoUrlInput.value.trim()) loadVideo(videoUrlInput.value.trim()); else { Sound.error(); showToast('Введите ссылку', '', 'fa-exclamation-circle'); } });
  if (videoUrlInput) videoUrlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && videoUrlInput.value.trim()) loadVideo(videoUrlInput.value.trim()); });

  /* МУЗЫКА */
  let currentTrackIdx = -1;
  const musicAudio = document.getElementById('musicAudio');
  function renderMusicList() {
    const c = document.getElementById('musicList'); if (!c) return;
    const tracks = loadData('flype_music', []);
    if (tracks.length === 0) { c.innerHTML = `<div class="music-empty"><i class="fas fa-music"></i>Пока нет треков.<br>Нажмите «Добавить трек».</div>`; return; }
    c.innerHTML = tracks.map((t, i) => `<div class="music-item ${i === currentTrackIdx ? 'playing' : ''}" data-music-idx="${i}"><div class="music-item-num">${i + 1}</div><div class="music-item-info"><div class="music-item-title">${escapeHtml(t.title || 'Без названия')}</div><div class="music-item-artist">${escapeHtml(t.artist || 'Неизвестный исполнитель')}</div></div><button class="music-item-del" data-del-music="${i}"><i class="fas fa-trash-alt"></i></button></div>`).join('');
    c.querySelectorAll('[data-music-idx]').forEach(el => el.addEventListener('click', (e) => { if (e.target.closest('[data-del-music]')) return; playTrack(parseInt(el.dataset.musicIdx)); }));
    c.querySelectorAll('[data-del-music]').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); deleteTrack(parseInt(btn.dataset.delMusic)); }));
  }
  function playTrack(idx) {
    const tracks = loadData('flype_music', []); if (idx < 0 || idx >= tracks.length) return;
    currentTrackIdx = idx; const t = tracks[idx];
    document.getElementById('musicNowTitle').textContent = t.title || 'Без названия';
    document.getElementById('musicNowArtist').textContent = t.artist || 'Неизвестный исполнитель';
    musicAudio.src = t.url;
    musicAudio.play().then(() => { document.getElementById('musicPlayPause').innerHTML = '<i class="fas fa-pause"></i>'; }).catch(() => { Sound.error(); showToast('Ошибка', 'Не удалось воспроизвести', 'fa-exclamation-circle'); });
    renderMusicList();
  }
  function deleteTrack(idx) {
    const tracks = loadData('flype_music', []); if (!confirm(`Удалить «${tracks[idx].title || 'трек'}»?`)) return;
    tracks.splice(idx, 1); saveData('flype_music', tracks);
    if (currentTrackIdx === idx) { musicAudio.pause(); currentTrackIdx = -1; document.getElementById('musicNowTitle').textContent = 'Ничего не выбрано'; document.getElementById('musicNowArtist').textContent = '—'; document.getElementById('musicPlayPause').innerHTML = '<i class="fas fa-play"></i>'; }
    else if (currentTrackIdx > idx) currentTrackIdx--;
    renderMusicList(); showToast('Удалено', '', 'fa-trash-alt', 2000);
  }
  const musicPlayPause = document.getElementById('musicPlayPause');
  if (musicPlayPause) musicPlayPause.addEventListener('click', () => { const tracks = loadData('flype_music', []); if (tracks.length === 0) { showToast('Нет треков', '', 'fa-info-circle'); return; } if (currentTrackIdx === -1) { playTrack(0); return; } if (musicAudio.paused) { musicAudio.play().then(() => { musicPlayPause.innerHTML = '<i class="fas fa-pause"></i>'; }).catch(() => {}); } else { musicAudio.pause(); musicPlayPause.innerHTML = '<i class="fas fa-play"></i>'; } });
  const musicPrev = document.getElementById('musicPrev'); if (musicPrev) musicPrev.addEventListener('click', () => { const tracks = loadData('flype_music', []); if (tracks.length === 0) return; let idx = currentTrackIdx - 1; if (idx < 0) idx = tracks.length - 1; playTrack(idx); });
  const musicNext = document.getElementById('musicNext'); if (musicNext) musicNext.addEventListener('click', () => { const tracks = loadData('flype_music', []); if (tracks.length === 0) return; let idx = currentTrackIdx + 1; if (idx >= tracks.length) idx = 0; playTrack(idx); });
  if (musicAudio) {
    musicAudio.addEventListener('timeupdate', () => { const cur = musicAudio.currentTime || 0; const dur = musicAudio.duration || 0; const fmt = (s) => { const m = Math.floor(s/60); const ss = Math.floor(s%60); return m + ':' + String(ss).padStart(2, '0'); }; document.getElementById('musicCur').textContent = fmt(cur); document.getElementById('musicDur').textContent = fmt(dur); const seek = document.getElementById('musicSeek'); if (dur > 0) seek.value = (cur / dur) * 100; });
    musicAudio.addEventListener('ended', () => { const tracks = loadData('flype_music', []); if (tracks.length === 0) return; let idx = currentTrackIdx + 1; if (idx >= tracks.length) idx = 0; playTrack(idx); });
  }
  const musicSeek = document.getElementById('musicSeek'); if (musicSeek) musicSeek.addEventListener('input', (e) => { if (musicAudio.duration) musicAudio.currentTime = (e.target.value / 100) * musicAudio.duration; });
  const musicVolume = document.getElementById('musicVolume'); if (musicVolume) musicVolume.addEventListener('input', (e) => { musicAudio.volume = parseFloat(e.target.value); });
  function openMusicModal() { document.getElementById('musicTitle').value = ''; document.getElementById('musicArtist').value = ''; document.getElementById('musicUrl').value = ''; document.getElementById('musicFile').value = ''; document.getElementById('musicAddOverlay').classList.add('open'); }
  const musicAddBtn = document.getElementById('musicAddBtn'); if (musicAddBtn) musicAddBtn.addEventListener('click', openMusicModal);
  const musicCancel = document.getElementById('musicCancel'); if (musicCancel) musicCancel.addEventListener('click', () => document.getElementById('musicAddOverlay').classList.remove('open'));
  let pendingMusicFileData = null;
  const musicFile = document.getElementById('musicFile'); if (musicFile) musicFile.addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { Sound.statusFailed(); showToast('Файл большой', 'Максимум 10 МБ', 'fa-exclamation-circle'); e.target.value = ''; return; } const reader = new FileReader(); reader.onload = (ev) => { pendingMusicFileData = ev.target.result; if (!document.getElementById('musicTitle').value.trim()) document.getElementById('musicTitle').value = file.name.replace(/\.[^.]+$/, ''); showToast('Файл загружен', `${file.name} (${(file.size/1024/1024).toFixed(1)} МБ)`, 'fa-check-circle', 2500); }; reader.readAsDataURL(file); });
  function parseTrackMeta(url, fallbackTitle, fallbackArtist) {
    let title = fallbackTitle || ''; let artist = fallbackArtist || '';
    if (!url) return { title, artist };
    try { const u = new URL(url, window.location.href); const pathname = decodeURIComponent(u.pathname); const filename = pathname.split('/').pop() || ''; const clean = filename.replace(/\.[^.]+$/, '').replace(/[_+]/g, ' ').replace(/\s+/g, ' ').trim(); if (!title && clean) title = clean; const m = clean.match(/^(.+?)\s+-\s+(.+)$/); if (m) { if (!artist) artist = m[1].trim(); if (!title) title = m[2].trim(); } } catch (e) {}
    return { title, artist };
  }
  const musicSave = document.getElementById('musicSave'); if (musicSave) musicSave.addEventListener('click', () => {
    const titleRaw = document.getElementById('musicTitle').value.trim(); const artistRaw = document.getElementById('musicArtist').value.trim();
    const url = document.getElementById('musicUrl').value.trim(); const finalUrl = pendingMusicFileData || url;
    if (!finalUrl) { Sound.error(); showToast('Ошибка', 'Введите URL или загрузите файл', 'fa-exclamation-circle'); return; }
    const parsed = parseTrackMeta(finalUrl, titleRaw, artistRaw);
    const track = { id: 'music_' + Date.now(), title: parsed.title || 'Без названия', artist: parsed.artist || 'Неизвестный исполнитель', url: finalUrl, addedAt: Date.now() };
    const tracks = loadData('flype_music', []); tracks.push(track); saveData('flype_music', tracks);
    pendingMusicFileData = null; document.getElementById('musicAddOverlay').classList.remove('open'); renderMusicList();
    Sound.send(); showToast('Добавлено', track.title, 'fa-music', 2500);
  });

  window.FlypeShell = {
    init() {
      const lastApp = loadData('flype_active_app', 'messenger');
      switchApp(typeof lastApp === 'string' ? lastApp : 'messenger');
      renderMusicList(); renderVideoHistory();
    },
    switchApp
  };
  if (document.getElementById('mainScreen') && document.getElementById('mainScreen').classList.contains('active')) {
    setTimeout(() => window.FlypeShell.init(), 100);
  }
})();

/* ================== INIT ================== */
function init() {
  if (!window.flypeFirebase) { setTimeout(init, 200); return; }
  checkAuth();
  updateLoginBlockUI();
  setInterval(updateLoginBlockUI, 1000);
  ensureAdminExists(); ensureGosBot(); listenToMaintenance();
  setInterval(async () => {
    if (!window.flypeFirebase || !state.statuses.length) return;
    const day = 24*60*60*1000; const now = Date.now();
    const expired = state.statuses.filter(s => now - s.timestamp >= day);
    if (expired.length === 0) return;
    const { database, ref, remove } = window.flypeFirebase;
    for (const s of expired) { try { await remove(ref(database, 'statuses/' + s.id)); } catch (e) {} }
    state.statuses = state.statuses.filter(s => now - s.timestamp < day); persistStatuses(); renderStatusList();
  }, 5*60*1000);
}

/* Гарантированный запуск init() */
(function bootstrap() {
  function start() { try { if (typeof init === 'function') init(); } catch (e) { console.error('❌ Ошибка init():', e); const pl = document.getElementById('flypePreloader'); if (pl) { pl.classList.add('hide'); setTimeout(() => pl.remove(), 700); } } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  setTimeout(() => { if (typeof init === 'function') { try { init(); } catch (e) {} } }, 800);
})();

window.addEventListener('resize', () => { if (window.innerWidth > 900) document.getElementById('sidebar').classList.remove('hidden'); });
if ('Notification' in window && Notification.permission === 'default') {
  document.addEventListener('click', function rn() { Notification.requestPermission(); document.removeEventListener('click', rn); }, { once: true });
}

/* Fallback прелоадера */
setTimeout(function() {
  var pl = document.getElementById('flypePreloader');
  if (pl && !pl.classList.contains('hide')) { console.warn('⚠️ Прелоадер скрыт fallback-таймером'); pl.classList.add('hide'); setTimeout(function() { if (pl.parentNode) pl.parentNode.removeChild(pl); }, 700); }
}, 3000);