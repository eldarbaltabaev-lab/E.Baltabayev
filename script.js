import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// ── Firebase (твой конфиг, без изменений) ──
const firebaseConfig = {
  apiKey: 'AIzaSyCFNCEiyo3bQXbeDr17RBnps9Nclw-Bf3k',
  authDomain: 'meprtf-261b5.firebaseapp.com',
  projectId: 'meprtf-261b5',
  storageBucket: 'meprtf-261b5.firebasestorage.app',
  messagingSenderId: '455250051170',
  appId: '1:455250051170:web:8ed8da93386265fe14d13b',
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const tasksCollection = collection(db, 'tasks');

const STATUSES = ['idea', 'dev', 'test', 'done'];
const KANJI = { idea: '案', dev: '作', test: '試', done: '完' };
let isAdmin = false, tasks = [], draggedId = null, editingTaskId = null, filter = '';
const $ = (id) => document.getElementById(id);

// ── Вспомогательное ──
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u = '') => (/^https?:\/\//i.test(u) ? u : '');
let toastTimer;
function toast(text, bad) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = text; t.classList.toggle('bad', !!bad);
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

// ── Данные (реальное время) ──
const LABEL = { idea: 'Идея', dev: 'В разработке', test: 'Тестирование', done: 'Готово' };
const GUEST = 'Предложено посетителем сайта';
const store = { get(k, d) { try { const v = localStorage.getItem('board.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('board.' + k, JSON.stringify(v)); } catch {} } };
let loaded = false, mode = store.get('mode', 'all'), newest = store.get('newest', false);
const ago = (ts) => { if (!ts) return ''; const m = Math.floor((Date.now() - ts) / 6e4); if (m < 1) return 'только что'; if (m < 60) return m + ' мин. назад'; const h = Math.floor(m / 60); if (h < 24) return h + ' ч. назад'; const d = Math.floor(h / 24); return d < 30 ? d + ' дн. назад' : new Date(ts).toLocaleDateString('ru-RU'); };
const fullDate = (ts) => (ts ? new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
function setSync(st) { const el = $('sync'); el.dataset.s = st; el.textContent = { ok: '● на связи', cache: '● из кэша', off: '● нет сети', load: '● подключаюсь…' }[st]; }
addEventListener('offline', () => setSync('off')); addEventListener('online', () => setSync(loaded ? 'ok' : 'load'));
if (!navigator.onLine) setSync('off');

onSnapshot(tasksCollection, (snap) => {
  const next = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (loaded) next.forEach((t) => { const o = tasks.find((x) => x.id === t.id); if (o && o.status !== 'done' && t.status === 'done') celebrate(); });
  tasks = next; loaded = true;
  if (navigator.onLine) setSync(snap.metadata && snap.metadata.fromCache ? 'cache' : 'ok');
  render();
}, (err) => { console.error(err); setSync('off'); toast('Не удалось получить данные: ' + err.message, true); });

function visible(t) {
  const q = filter.trim().toLowerCase();
  if (q && !((t.title || '') + ' ' + (t.desc || '')).toLowerCase().includes(q)) return false;
  if (mode === 'link' && !safeUrl(t.url)) return false;
  if (mode === 'guest' && t.desc !== GUEST) return false;
  return true;
}
function render() {
  STATUSES.forEach((s) => { $('list-' + s).innerHTML = loaded ? '' : '<div class="card skel"></div><div class="card skel short"></div>'; });
  if (!loaded) return;
  const counts = { idea: 0, dev: 0, test: 0, done: 0 }; let shown = 0;
  (newest ? [...tasks].reverse() : tasks).forEach((task) => {
    if (counts[task.status] === undefined) return;
    counts[task.status]++;
    if (!visible(task)) return;
    shown++;
    const url = safeUrl(task.url), next = STATUSES[STATUSES.indexOf(task.status) + 1], guest = task.desc === GUEST;
    const card = document.createElement('div');
    card.className = 'card'; card.dataset.id = task.id; card.draggable = isAdmin; card.tabIndex = 0;
    card.addEventListener('dragstart', (e) => window.dragStart(e, task.id));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.innerHTML = `
      ${isAdmin ? `<div class="card-actions">
        ${next ? `<button onclick="moveTask('${task.id}')" title="Передвинуть дальше" aria-label="Передвинуть дальше">➜</button>` : ''}
        <button onclick="openEditModal('${task.id}')" title="Редактировать" aria-label="Редактировать">✎</button>
        <button class="delete-btn" onclick="deleteTask('${task.id}')" title="Удалить" aria-label="Удалить">✕</button></div>` : ''}
      <div class="card-title">${esc(task.title)}</div>
      <div class="card-desc">${guest ? '' : esc(task.desc)}</div>
      <div class="card-meta"><time title="${esc(fullDate(task.createdAt))}">${ago(task.createdAt)}</time>${guest ? '<span class="tag">от посетителя</span>' : ''}</div>
      <i class="stamp" aria-hidden="true">${KANJI[task.status]}</i>
      ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="card-link">🔗 Открыть проект</a>` : ''}`;
    $('list-' + task.status).append(card);
  });
  STATUSES.forEach((s) => { $('count-' + s).textContent = counts[s]; });
  const all = STATUSES.reduce((n, s) => n + counts[s], 0), pct = all ? Math.round(counts.done / all * 100) : 0;
  $('done-n').textContent = counts.done; $('all-n').textContent = all;
  $('prog-f').style.width = pct + '%'; $('prog-p').textContent = pct + '%';
  $('fnote').hidden = !(all && !shown);
}

// ── Поиск, фильтры, сортировка ──
// Поиск реагирует только на настоящий ввод. Автозаполнение браузера игнорируется.
$('q').value = '';
$('q').addEventListener('input', (e) => {
  if (!e.inputType || e.inputType === 'insertReplacementText') { e.target.value = filter; return; }
  filter = e.target.value; $('fclr').hidden = !filter.trim(); render();
});
window.clearFilter = () => { filter = ''; $('q').value = ''; $('fclr').hidden = true; render(); };
function syncChips() {
  document.querySelectorAll('#chips [data-f]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.f === mode));
  $('sort-btn').textContent = newest ? '↓ Сначала новые' : '↑ Сначала старые';
}
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.f) { mode = b.dataset.f; store.set('mode', mode); } else { newest = !newest; store.set('newest', newest); }
  syncChips(); render();
});
syncChips();

// ── Подробности карточки ──
window.openCard = (id) => {
  const t = tasks.find((x) => x.id === id); if (!t) return;
  const url = safeUrl(t.url), guest = t.desc === GUEST;
  $('card-body').innerHTML = `
    <div class="dt-top"><i class="stamp big">${KANJI[t.status] || ''}</i><div><h2>${esc(t.title)}</h2><p class="dt-st">${LABEL[t.status] || ''} · ${ago(t.createdAt)}</p></div></div>
    <p class="dt-desc">${guest ? 'Идея от посетителя сайта.' : esc(t.desc) || 'Описания пока нет.'}</p>
    <p class="dt-date">Создано: ${esc(fullDate(t.createdAt))}</p>
    <div class="modal-actions">
      ${url ? `<button class="btn ghost" onclick="copyLink('${t.id}')">Скопировать ссылку</button><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Открыть проект</a>` : ''}
      ${isAdmin ? `<button class="btn ghost" onclick="closeCard();openEditModal('${t.id}')">Редактировать</button>` : ''}
      <button class="btn ghost" onclick="closeCard()">Закрыть</button>
    </div>`;
  $('modal-card').classList.add('open');
};
window.closeCard = () => $('modal-card').classList.remove('open');
window.copyLink = (id) => { const t = tasks.find((x) => x.id === id); navigator.clipboard.writeText(t.url).then(() => toast('Ссылка скопирована')).catch(() => toast('Не удалось скопировать', true)); };
window.openHelp = () => $('modal-help').classList.add('open');
window.closeHelp = () => $('modal-help').classList.remove('open');
document.querySelector('.board').addEventListener('click', (e) => {
  if (e.target.closest('button,a')) return;
  const c = e.target.closest('.card:not(.skel)'); if (c) openCard(c.dataset.id);
});
document.querySelector('.board').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('card')) openCard(e.target.dataset.id); });

// ── Движение курсора: блик и наклон карточки, параллакс луны ──
document.addEventListener('pointermove', (e) => {
  document.documentElement.style.setProperty('--px', (e.clientX / innerWidth - .5).toFixed(3));
  document.documentElement.style.setProperty('--py', (e.clientY / innerHeight - .5).toFixed(3));
  const c = e.target.closest && e.target.closest('.card'); if (!c || e.pointerType !== 'mouse') return;
  const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  c.style.setProperty('--rx', ((.5 - y) * 6).toFixed(2) + 'deg'); c.style.setProperty('--ry', ((x - .5) * 8).toFixed(2) + 'deg');
});
document.addEventListener('pointerout', (e) => { const c = e.target.closest && e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } });
// чернильная рябь на кнопках
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest && e.target.closest('.btn'); if (!b) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, sp = document.createElement('span');
  sp.className = 'rip'; sp.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.append(sp); setTimeout(() => sp.remove(), 650);
});
// дата в шапке и год в подвале
const MONTHS = ['睦月', '如月', '弥生', '卯月', '皐月', '水無月', '文月', '葉月', '長月', '神無月', '霜月', '師走'];
const setToday = () => { const d = new Date(); $('today').textContent = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + MONTHS[d.getMonth()]; };
setToday(); setInterval(setToday, 6e4); $('yr').textContent = new Date().getFullYear();
function celebrate() { toast('完 · проект завершён!'); const r = $('list-done').getBoundingClientRect(); fx.burst(r.left + r.width / 2, Math.max(r.top + 70, 90)); }

// ── Перетаскивание ──
window.dragStart = (e, id) => { draggedId = id; e.target.classList.add('dragging'); };
window.allowDrop = (e) => { if (!isAdmin) return; e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
window.dragLeave = (e) => e.currentTarget.classList.remove('drag-over');
window.drop = async (e) => {
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if (!isAdmin) return toast('Только администратор может перемещать карточки', true);
  const status = e.currentTarget.dataset.status, task = tasks.find((t) => t.id === draggedId);
  draggedId = null;
  if (task && task.status !== status) await updateDoc(doc(db, 'tasks', task.id), { status }).catch((err) => toast(err.message, true));
};
window.moveTask = async (id) => { // для телефонов, где перетаскивание неудобно
  const t = tasks.find((x) => x.id === id), next = t && STATUSES[STATUSES.indexOf(t.status) + 1];
  if (next) await updateDoc(doc(db, 'tasks', id), { status: next }).catch((err) => toast(err.message, true));
};

// ── Окно проекта ──
const modal = () => $('modal');
window.openModal = () => {
  editingTaskId = null; modal().querySelector('h2').textContent = 'Добавить проект';
  ['input-title', 'input-desc', 'input-link'].forEach((i) => { $(i).value = ''; });
  $('input-status').value = 'dev'; $('admin-form').style.display = 'block'; modal().classList.add('open'); $('input-title').focus();
};
window.openEditModal = (id) => {
  const t = tasks.find((x) => x.id === id); if (!t) return;
  editingTaskId = id; modal().querySelector('h2').textContent = 'Редактировать проект';
  $('input-title').value = t.title || ''; $('input-desc').value = t.desc || ''; $('input-link').value = t.url || ''; $('input-status').value = t.status || 'idea';
  $('admin-form').style.display = 'block'; modal().classList.add('open');
};
window.closeModal = () => modal().classList.remove('open');
window.addTaskAdmin = async () => {
  const data = { title: $('input-title').value.trim(), desc: $('input-desc').value.trim(), url: $('input-link').value.trim(), status: $('input-status').value };
  if (!data.title) return toast('Введите название проекта', true);
  try {
    if (editingTaskId) await updateDoc(doc(db, 'tasks', editingTaskId), data);
    else await addDoc(tasksCollection, { ...data, createdAt: Date.now() });
    closeModal(); toast(editingTaskId ? 'Изменения сохранены' : 'Проект добавлен');
  } catch (err) { toast('Ошибка: ' + err.message, true); }
};
window.deleteTask = async (id) => {
  if (!isAdmin) return toast('Только администратор может удалять проекты', true);
  if (confirm('Удалить этот проект с доски?')) await deleteDoc(doc(db, 'tasks', id)).then(() => toast('Проект удалён')).catch((err) => toast(err.message, true));
};

// ── Вход ──
window.toggleAuth = () => { if (isAdmin) signOut(auth).then(() => toast('Вы вышли из режима администратора')); else { $('modal-auth').classList.add('open'); $('auth-email').focus(); } };
window.closeAuthModal = () => $('modal-auth').classList.remove('open');
window.login = async () => {
  try {
    await signInWithEmailAndPassword(auth, $('auth-email').value, $('auth-pass').value);
    closeAuthModal(); $('auth-email').value = ''; $('auth-pass').value = ''; toast('Добро пожаловать, администратор');
  } catch (err) { toast('Ошибка входа: ' + err.message, true); }
};
$('auth-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') window.login(); });
document.addEventListener('click', (e) => { if (e.target.classList && e.target.classList.contains('modal-overlay')) e.target.classList.remove('open'); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay.open').forEach((m) => m.classList.remove('open')); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if (e.key === '/') { e.preventDefault(); $('q').removeAttribute('readonly'); $('q').focus(); }
  else if (e.key === '?') openHelp();
  else if ((k === 'n' || k === 'т') && isAdmin) openModal();
  else if (k === 's' || k === 'ы') toggleSnow();
});
onAuthStateChanged(auth, (user) => {
  isAdmin = !!user;
  $('auth-btn').textContent = isAdmin ? 'Выйти' : 'Войти';
  $('add-btn').style.display = isAdmin ? '' : 'none';
  $('guest-idea-section').hidden = isAdmin;
  render();
});

// ── Идея от гостя ──
window.submitGuestIdea = async () => {
  const idea = $('guest-idea-input').value.trim();
  if (!idea) return toast('Напишите вашу идею', true);
  try {
    await addDoc(tasksCollection, { title: idea, desc: 'Предложено посетителем сайта', url: '', status: 'idea', createdAt: Date.now() });
    $('guest-idea-input').value = ''; toast('Спасибо! Ваша идея отправлена');
  } catch (err) { toast('Ошибка при отправке: ' + err.message, true); }
};

// ── Снегопад и искры (лёгкий canvas, без свечения и размытия) ──
let snowOn = store.get('snow', true);
$('snow-btn').setAttribute('aria-pressed', snowOn);
window.toggleSnow = () => { snowOn = !snowOn; store.set('snow', snowOn); $('snow-btn').setAttribute('aria-pressed', snowOn); toast(snowOn ? 'Снегопад включён' : 'Снегопад выключен'); };
const fx = { sparks: [], burst() {}, };
(() => {
  const cv = $('snow'), g = cv.getContext('2d');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let W, H, wind = 0, flakes = [], last = 0;
  const size = () => {
    W = cv.width = innerWidth; H = cv.height = innerHeight;
    flakes = Array.from({ length: Math.min(90, Math.round(W * H / 14000)) }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * .8 + .2, p: Math.random() * 6.28 }));
  };
  size(); addEventListener('resize', size);
  const COL = ['#ffffff', '#e8b64a', '#c8102e', '#5fd0a0', '#9cc8ff'];
  const spawn = (x, y, n, v, life) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = Math.random() * v + v * .3; fx.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - v * .4, l: 1, d: 1 / life + Math.random() * .01, c: COL[(Math.random() * COL.length) | 0], r: Math.random() * 2 + 1.2 }); } };
  fx.burst = (x, y) => spawn(x, y, 46, 4.2, 70);
  addEventListener('pointermove', (e) => {
    wind = (e.clientX / W - .5) * 2;
    if (e.pointerType === 'mouse' && snowOn && e.timeStamp - last > 45) { last = e.timeStamp; spawn(e.clientX, e.clientY, 1, .6, 40); }
  });
  (function loop(t) {
    requestAnimationFrame(loop);
    if (document.hidden || (!snowOn && !fx.sparks.length)) { if (!snowOn && cv.dataset.c !== '0') { g.clearRect(0, 0, W, H); cv.dataset.c = '0'; } return; }
    cv.dataset.c = '1'; g.clearRect(0, 0, W, H); g.fillStyle = '#fff';
    if (snowOn) for (const f of flakes) {
      f.y += f.z * 1.1 + .3; f.x += Math.sin(t / 1500 + f.p) * .4 * f.z + wind * f.z * 1.2;
      if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W; } if (f.x > W + 6) f.x = -6; if (f.x < -6) f.x = W + 6;
      g.globalAlpha = .35 + f.z * .55; g.beginPath(); g.arc(f.x, f.y, f.z * 2.4, 0, 6.283); g.fill();
    }
    fx.sparks = fx.sparks.filter((p) => p.l > 0);
    for (const p of fx.sparks) { p.x += p.vx; p.y += p.vy; p.vy += .07; p.vx *= .985; p.l -= p.d; g.globalAlpha = Math.max(p.l, 0); g.fillStyle = p.c; g.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); }
    g.globalAlpha = 1;
  })(0);
})();
