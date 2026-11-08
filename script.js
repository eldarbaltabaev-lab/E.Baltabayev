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
onSnapshot(tasksCollection, (snap) => {
  tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  render();
}, (err) => { console.error(err); toast('Не удалось получить данные: ' + err.message, true); });

function render() {
  const q = filter.trim().toLowerCase(), counts = { idea: 0, dev: 0, test: 0, done: 0 };
  STATUSES.forEach((s) => { $('list-' + s).innerHTML = ''; });
  tasks.forEach((task) => {
    if (counts[task.status] === undefined) return;
    counts[task.status]++;
    if (q && !((task.title || '') + ' ' + (task.desc || '')).toLowerCase().includes(q)) return;
    const url = safeUrl(task.url), next = STATUSES[STATUSES.indexOf(task.status) + 1];
    const card = document.createElement('div');
    card.className = 'card'; card.draggable = isAdmin;
    card.addEventListener('dragstart', (e) => window.dragStart(e, task.id));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.innerHTML = `
      ${isAdmin ? `<div class="card-actions">
        ${next ? `<button onclick="moveTask('${task.id}')" title="Передвинуть дальше">➜</button>` : ''}
        <button onclick="openEditModal('${task.id}')" title="Редактировать">✎</button>
        <button class="delete-btn" onclick="deleteTask('${task.id}')" title="Удалить">✕</button></div>` : ''}
      <div class="card-title">${esc(task.title)}</div>
      <div class="card-desc">${esc(task.desc)}</div>
      <i class="stamp" aria-hidden="true">${KANJI[task.status]}</i>
      ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="card-link">🔗 Открыть проект</a>` : ''}`;
    $('list-' + task.status).append(card);
  });
  STATUSES.forEach((s) => { $('count-' + s).textContent = counts[s]; });
  const all = STATUSES.reduce((n, s) => n + counts[s], 0), pct = all ? Math.round(counts.done / all * 100) : 0;
  $('done-n').textContent = counts.done; $('all-n').textContent = all;
  $('prog-f').style.width = pct + '%'; $('prog-p').textContent = pct + '%';
}
window.setFilter = (v) => { filter = v; render(); };

// светящийся блик на карточке следует за курсором
document.addEventListener('pointermove', (e) => {
  const c = e.target.closest && e.target.closest('.card'); if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px');
});

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
document.addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); if (e.target.id === 'modal-auth') closeAuthModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeAuthModal(); } });
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

// ── Снегопад (лёгкий: без свечения и размытия, чтобы не нагружать телефон) ──
(() => {
  const cv = $('snow'), g = cv.getContext('2d');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let W, H, wind = 0, flakes = [];
  const size = () => {
    W = cv.width = innerWidth; H = cv.height = innerHeight;
    flakes = Array.from({ length: Math.min(90, Math.round(W * H / 14000)) }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * .8 + .2, p: Math.random() * 6.28 }));
  };
  size(); addEventListener('resize', size);
  addEventListener('pointermove', (e) => { wind = (e.clientX / W - .5) * 2; });
  g.fillStyle = '#fff';
  (function loop(t) {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    g.clearRect(0, 0, W, H);
    for (const f of flakes) {
      f.y += f.z * 1.1 + .3; f.x += Math.sin(t / 1500 + f.p) * .4 * f.z + wind * f.z * 1.2;
      if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W; } if (f.x > W + 6) f.x = -6; if (f.x < -6) f.x = W + 6;
      g.globalAlpha = .35 + f.z * .55; g.beginPath(); g.arc(f.x, f.y, f.z * 2.4, 0, 6.283); g.fill();
    }
  })(0);
})();
