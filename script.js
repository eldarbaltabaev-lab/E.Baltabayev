import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, addDoc, setDoc, getDoc, writeBatch, getDocs, query, where, onSnapshot, doc, updateDoc, deleteDoc, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
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
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); // офлайн-кэш
const auth = getAuth(app);
const tasksCollection = collection(db, 'tasks'), sugCollection = collection(db, 'suggestions'), votesCollection = collection(db, 'votes'), commentsCollection = collection(db, 'comments'), eventsCollection = collection(db, 'events');

const STATUSES = ['idea', 'dev', 'test', 'done'];
const KANJI = { idea: '案', dev: '作', test: '試', done: '完' };
let isAdmin = false, comm = {}, unsubCm = null, openId = null, suggestions = [], votes = {}, mine = new Set(), pendingDel = new Set(), unsubSug = null, tasks = [], draggedId = null, editingTaskId = null, filter = '';
const $ = (id) => document.getElementById(id);

// ── Вспомогательное ──
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u = '') => (/^https?:\/\//i.test(u) ? u : '');
let toastTimer;
function toast(text, bad, act) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = text; t.classList.toggle('bad', !!bad);
  if (act) { const b = document.createElement('button'); b.textContent = act.label; b.onclick = () => { act.fn(); t.classList.remove('show'); }; t.append(b); }
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), act ? 6000 : 3800);
}

// ── Данные (реальное время) ──
const LABEL = { idea: 'Идея', dev: 'В разработке', test: 'Тестирование', done: 'Готово' };
const GUEST = 'Предложено посетителем сайта';
const store = { get(k, d) { try { const v = localStorage.getItem('board.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('board.' + k, JSON.stringify(v)); } catch {} } };
let loaded = false, mode = store.get('mode', 'all'), sort = store.get('sort', 'manual'), view = store.get('view', 'board'), soundOn = store.get('sound', true), cardsDark = store.get('cards', false);
const DEV = store.get('dev', null) || (() => { const v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store.set('dev', v); return v; })();
const isGuest = (t) => t.source === 'guest' || t.desc === GUEST;
const VERD = { accepted: 'Принято', planned: 'В планах', declined: 'Отклонено' };
const key = (t) => (t.order ?? t.createdAt ?? 0), dayN = (ts) => Math.floor((Date.now() - ts) / 864e5);
const statusPatch = (s) => ({ status: s, updatedAt: Date.now(), history: arrayUnion({ s, t: Date.now() }) });
const SORTS = { manual: '↕ Мой порядок', new: '↓ Сначала новые', top: '▲ Популярные' };
const ago = (ts) => { if (!ts) return ''; const m = Math.floor((Date.now() - ts) / 6e4); if (m < 1) return 'только что'; if (m < 60) return m + ' мин. назад'; const h = Math.floor(m / 60); if (h < 24) return h + ' ч. назад'; const d = Math.floor(h / 24); return d < 30 ? d + ' дн. назад' : new Date(ts).toLocaleDateString('ru-RU'); };
const fullDate = (ts) => (ts ? new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
function setSync(st) { const el = $('sync'); el.dataset.s = st; el.textContent = { ok: '● на связи', cache: '● из кэша', off: '● нет сети', load: '● подключаюсь…' }[st]; }
addEventListener('offline', () => setSync('off')); addEventListener('online', () => setSync(loaded ? 'ok' : 'load'));
if (!navigator.onLine) setSync('off');

onSnapshot(tasksCollection, { includeMetadataChanges: true }, (snap) => {
  const next = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (loaded) next.forEach((t) => { const o = tasks.find((x) => x.id === t.id); if (o && o.status !== 'done' && t.status === 'done') celebrate(); });
  if (!loaded) { document.body.classList.add('first'); setTimeout(() => document.body.classList.remove('first'), 700); }
  tasks = next; loaded = true;
  if (navigator.onLine) setSync(snap.metadata && snap.metadata.fromCache ? 'cache' : 'ok');
  render(); openFromHash();
}, (err) => { console.error(err); setSync('off'); toast('Не удалось получить данные: ' + err.message, true); });

onSnapshot(votesCollection, (s) => { votes = {}; mine = new Set(); s.forEach((d) => { const v = d.data(); votes[v.task] = (votes[v.task] || 0) + 1; if (v.dev === DEV) mine.add(v.task); }); render(); }, () => {});

function visible(t) {
  const q = filter.trim().toLowerCase();
  if (q && !((t.title || '') + ' ' + (t.desc || '') + ' ' + (t.tags || []).join(' ')).toLowerCase().includes(q)) return false;
  if (mode === 'link' && !safeUrl(t.url)) return false;
  if (mode === 'guest' && !isGuest(t)) return false;
  return true;
}
function subComments() {
  if (unsubCm) unsubCm();
  unsubCm = onSnapshot(isAdmin ? commentsCollection : query(commentsCollection, where('approved', '==', true)), (s) => {
    comm = {}; s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.createdAt - b.createdAt).forEach((c) => (comm[c.task] = comm[c.task] || []).push(c));
    render(); if (openId && $('modal-card').classList.contains('open')) renderComments();
  }, (e) => console.error(e));
}
function sorted() {
  const a = tasks.filter((t) => !pendingDel.has(t.id));
  if (sort === 'new') return a.reverse();
  if (sort === 'top') return a.sort((x, y) => (votes[y.id] || 0) - (votes[x.id] || 0) || y.createdAt - x.createdAt);
  return a.sort((x, y) => key(x) - key(y));
}
function render() {
  STATUSES.forEach((s) => { $('list-' + s).innerHTML = loaded ? '' : '<div class="card skel"></div><div class="card skel short"></div>'; });
  if (!loaded) return;
  const counts = { idea: 0, dev: 0, test: 0, done: 0 }; let shown = 0;
  if (isAdmin) suggestions.forEach((s) => { // очередь модерации
    const el = document.createElement('div'); el.className = 'card pending';
    el.innerHTML = `<div class="card-title">${esc(s.title)}</div><div class="card-meta"><span class="tag warn">на модерации</span><time>${ago(s.createdAt)}</time></div>
      <div class="mod-actions"><button class="btn" onclick="approveIdea('${s.id}')">Одобрить</button><button class="btn ghost" onclick="rejectIdea('${s.id}')">Отклонить</button></div>`;
    $('list-idea').append(el);
  });
  sorted().forEach((task) => {
    if (counts[task.status] === undefined) return;
    counts[task.status]++;
    if (!visible(task)) return;
    shown++;
    const url = safeUrl(task.url), shot = safeUrl(task.shot), next = STATUSES[STATUSES.indexOf(task.status) + 1], guest = isGuest(task);
    const upd = task.updatedAt && task.updatedAt > task.createdAt + 36e5 ? task.updatedAt : 0;
    const badge = dayN(task.createdAt) < 3 ? '<span class="tag new">Новое</span>' : upd && dayN(upd) < 7 ? `<span class="tag upd">Обновлено ${ago(upd)}</span>` : '';
    const since = task.status === 'dev' ? dayN(statusSince(task)) : -1, nc = (comm[task.id] || []).filter((c) => c.approved).length;
    const card = document.createElement('div');
    card.className = 'card'; card.dataset.id = task.id; card.draggable = isAdmin; card.tabIndex = 0;
    card.addEventListener('dragstart', (e) => window.dragStart(e, task.id));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.innerHTML = `
      ${shot ? `<img class="shot" src="${esc(shot)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      ${isAdmin ? `<div class="card-actions">
        ${next ? `<button onclick="moveTask('${task.id}')" title="Передвинуть дальше" aria-label="Передвинуть дальше">➜</button>` : ''}
        <button onclick="openEditModal('${task.id}')" title="Редактировать" aria-label="Редактировать">✎</button>
        <button class="delete-btn" onclick="deleteTask('${task.id}')" title="Удалить" aria-label="Удалить">✕</button></div>` : ''}
      <div class="card-title">${esc(task.title)}</div>
      <div class="card-desc">${guest ? '' : esc(task.desc)}</div>
      ${(task.tags || []).length ? `<div>${task.tags.map((g) => `<button class="ptag" data-tag="${esc(g)}">#${esc(g)}</button>`).join('')}</div>` : ''}
      <div class="card-meta"><time title="${esc(fullDate(task.createdAt))}">${ago(task.createdAt)}</time>${badge}${guest ? '<span class="tag">от посетителя</span>' : ''}${task.verdict ? `<span class="tag verd-${task.verdict}">${VERD[task.verdict]}</span>` : ''}${nc ? `<span>💬 ${nc}</span>` : ''}${since >= 1 ? `<span>в работе ${since} дн.</span>` : ''}${task.status === 'idea' ? `<button class="vote" data-vote="${task.id}" aria-pressed="${mine.has(task.id)}" title="Поддержать идею">▲ ${votes[task.id] || 0}</button>` : ''}</div>
      <i class="stamp" aria-hidden="true">${KANJI[task.status]}</i>
      ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="card-link" data-track="${task.id}">🔗 Открыть проект</a>` : ''}`;
    $('list-' + task.status).append(card);
  });
  STATUSES.forEach((s) => { $('count-' + s).textContent = counts[s]; });
  const all = STATUSES.reduce((n, s) => n + counts[s], 0), pct = all ? Math.round(counts.done / all * 100) : 0;
  $('done-n').textContent = counts.done; $('all-n').textContent = all;
  $('prog-f').style.width = pct + '%'; $('prog-p').textContent = pct + '%';
  $('fnote').hidden = !(all && !shown);
  if (view === 'time') renderTimeline();
}
const statusSince = (t) => ((t.history || []).slice(-1)[0] || {}).t || t.updatedAt || t.createdAt;
window.vote = async (id) => {
  if (mine.has(id)) return toast('Вы уже голосовали за эту идею');
  mine.add(id); votes[id] = (votes[id] || 0) + 1; render();
  try { await setDoc(doc(db, 'votes', id + '_' + DEV), { task: id, dev: DEV }); }
  catch { mine.delete(id); votes[id]--; render(); toast('Не удалось проголосовать', true); }
};

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
  $('sort-btn').textContent = SORTS[sort]; document.body.dataset.view = view; $('view-btn').textContent = view === 'board' ? '☰ Хронология' : '▦ Доска';
}
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'view-btn') { view = view === 'board' ? 'time' : 'board'; store.set('view', view); } else if (b.dataset.f) { mode = b.dataset.f; store.set('mode', mode); } else { const o = Object.keys(SORTS); sort = o[(o.indexOf(sort) + 1) % o.length]; store.set('sort', sort); }
  syncChips(); render();
});
syncChips();

function renderTimeline() {
  let m = ''; const items = tasks.filter((t) => !pendingDel.has(t.id) && visible(t)).sort((a, b) => b.createdAt - a.createdAt);
  $('timeline').innerHTML = items.length ? items.map((t) => {
    const mo = new Date(t.createdAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }), head = mo !== m ? `<h3 class="tl-m">${mo}</h3>` : ''; m = mo;
    return `${head}<div class="tl-i" data-id="${t.id}" tabindex="0" style="--c:var(--${t.status})"><i class="kj">${KANJI[t.status]}</i><div><b>${esc(t.title)}</b><span>${LABEL[t.status]} · ${esc(fullDate(t.createdAt))}</span></div></div>`;
  }).join('') : '<p class="tl-e">Ничего не найдено</p>';
}
$('timeline').addEventListener('click', (e) => { const i = e.target.closest('.tl-i'); if (i) openCard(i.dataset.id); });
$('timeline').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.id) openCard(e.target.dataset.id); });
// ── Подробности карточки ──
window.openCard = (id) => {
  const t = tasks.find((x) => x.id === id); if (!t) return;
  const url = safeUrl(t.url), shot = safeUrl(t.shot), guest = isGuest(t);
  const hist = (t.history || []).length ? [...t.history].reverse() : [{ s: t.status, t: t.createdAt }];
  $('card-body').innerHTML = `
    ${shot ? `<img class="dt-shot" src="${esc(shot)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <div class="dt-top"><i class="stamp big">${KANJI[t.status] || ''}</i><div><h2>${esc(t.title)}</h2><p class="dt-st">${LABEL[t.status] || ''} · ${ago(statusSince(t))}</p></div></div>
    <p class="dt-desc">${guest ? 'Идея от посетителя сайта.' : esc(t.desc) || 'Описания пока нет.'}</p>
    ${t.reply || t.verdict ? `<div class="dt-reply"><b>${VERD[t.verdict] || 'Ответ автора'}</b>${t.reply ? '<p>' + esc(t.reply) + '</p>' : ''}</div>` : ''}
    ${(t.tags || []).length ? `<p>${t.tags.map((g) => `<span class="tag">#${esc(g)}</span>`).join(' ')}</p>` : ''}
    <h3 class="dt-h">Что нового</h3>
    <ul class="hist">${hist.map((h) => `<li><b>${LABEL[h.s] || ''}</b> · ${esc(fullDate(h.t))}</li>`).join('')}</ul>
    <h3 class="dt-h">Обсуждение</h3><div id="cm-list"></div>
    <div class="cm-form">${isAdmin ? '' : '<input id="cm-name" maxlength="30" placeholder="Имя (необязательно)">'}<textarea id="cm-text" rows="2" maxlength="300" placeholder="${isAdmin ? 'Ответ от автора…' : 'Ваш комментарий…'}"></textarea><div class="cm-attach"><label class="btn ghost">📎 Прикрепить<input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt" onchange="pickFile(this)"></label><span id="cm-fname"></span></div><button class="btn" onclick="sendComment()">Отправить</button></div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="copyCard('${t.id}')">Поделиться</button>
      ${url ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener" data-track="${t.id}">Открыть проект</a>` : ''}
      ${isAdmin ? `<button class="btn ghost" onclick="closeCard();openEditModal('${t.id}')">Редактировать</button>` : ''}
      <button class="btn ghost" onclick="closeCard()">Закрыть</button>
    </div>`;
  $('modal-card').classList.add('open'); history.replaceState(null, '', '#project=' + id); openId = id; cmFile = null; renderComments(); track(id, 'view');
};
let cmFile = null; // вложение, выбранное для комментария (до 600 КБ, хранится в Firestore)
window.pickFile = (inp) => {
  const f = inp.files[0]; inp.value = ''; if (!f) return;
  if (f.size > 614400) return toast('Файл больше 600 КБ', true);
  if (!/\.(pdf|png|jpe?g|docx?|xlsx?|txt)$/i.test(f.name)) return toast('Допустимы PDF, Word, Excel, TXT, PNG, JPG', true);
  const r = new FileReader();
  r.onload = () => { cmFile = { data: r.result, name: f.name.slice(0, 100), type: (f.type || 'application/octet-stream').slice(0, 100), size: f.size }; $('cm-fname').textContent = '📎 ' + f.name; };
  r.readAsDataURL(f);
};
window.openFile = async (id) => { // файл только скачивается, в странице не открывается
  try { const d = await getDoc(doc(db, 'files', id)); if (!d.exists()) return toast('Файл не найден', true);
    const a = document.createElement('a'); a.href = d.data().data; a.download = d.data().name; a.click();
  } catch (err) { toast('Не удалось получить файл: ' + err.message, true); }
};
function renderComments() {
  const el = $('cm-list'); if (!el) return; const list = comm[openId] || [];
  el.innerHTML = list.length ? list.map((c) => `<div class="cm${c.admin ? ' by-admin' : ''}${c.approved ? '' : ' wait'}"><b>${c.admin ? 'Автор' : esc(c.name || 'Гость')}</b><time>${ago(c.createdAt)}${c.approved ? '' : ' · на модерации'}</time><p>${esc(c.text)}</p>${c.file ? `<button class="cm-file" onclick="openFile('${c.id}')">📎 ${esc(c.file.name)} · ${Math.max(1, Math.round(c.file.size / 1024))} КБ</button>` : ''}${isAdmin ? `<span class="cm-act">${c.approved ? '' : `<button onclick="approveComment('${c.id}')">Одобрить</button>`}<button onclick="deleteComment('${c.id}')">Удалить</button></span>` : ''}</div>`).join('') : '<p class="dt-st">Пока никто не писал. Будьте первым.</p>';
}
window.sendComment = async () => {
  const text = $('cm-text').value.trim().slice(0, 300); if (!text) return toast('Напишите комментарий', true);
  if (!isAdmin && Date.now() - store.get('lastCm', 0) < 3e4) return toast('Подождите полминуты', true);
  try {
    const ref = doc(commentsCollection), b = writeBatch(db), body = { task: openId, text, name: isAdmin ? 'Автор' : $('cm-name').value.trim().slice(0, 30), createdAt: Date.now(), approved: isAdmin, admin: isAdmin };
    if (cmFile) { body.file = { name: cmFile.name, type: cmFile.type, size: cmFile.size }; b.set(doc(db, 'files', ref.id), cmFile); }
    b.set(ref, body); await b.commit(); cmFile = null; $('cm-fname').textContent = '';
    $('cm-text').value = ''; if (!isAdmin) { store.set('lastCm', Date.now()); toast('Спасибо! Комментарий появится после проверки'); }
  } catch (err) { toast('Ошибка: ' + err.message, true); }
};
window.approveComment = (id) => updateDoc(doc(db, 'comments', id), { approved: true }).catch((e) => toast(e.message, true));
window.deleteComment = (id) => deleteDoc(doc(db, 'comments', id)).then(() => deleteDoc(doc(db, 'files', id)).catch(() => {})).catch((e) => toast(e.message, true));
const clearHash = () => { if (location.hash && !$('modal-card').classList.contains('open')) history.replaceState(null, '', location.pathname + location.search); };
window.closeCard = () => { $('modal-card').classList.remove('open'); clearHash(); };
window.copyCard = (id) => navigator.clipboard.writeText(location.origin + location.pathname + '#project=' + id).then(() => toast('Ссылка на карточку скопирована')).catch(() => toast('Не удалось скопировать', true));
function openFromHash() { const m = location.hash.match(/^#project=([\w-]+)/); if (m && loaded && tasks.some((t) => t.id === m[1]) && !$('modal-card').classList.contains('open')) openCard(m[1]); }
addEventListener('hashchange', openFromHash);
window.openHelp = () => $('modal-help').classList.add('open');
window.closeHelp = () => $('modal-help').classList.remove('open');
document.querySelector('.board').addEventListener('click', (e) => {
  const v = e.target.closest('[data-vote]'); if (v) return vote(v.dataset.vote);
  const g = e.target.closest('[data-tag]'); if (g) { filter = g.dataset.tag; $('q').removeAttribute('readonly'); $('q').value = filter; $('fclr').hidden = false; return render(); }
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
const setToday = () => { const d = new Date(); $('today').textContent = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + MONTHS[d.getMonth()] + (d.getMonth() === 11 ? ' · до Нового года ' + Math.ceil((new Date(d.getFullYear() + 1, 0, 1) - d) / 864e5) + ' дн.' : ''); };
const SEASONS = { winter: { k: '冬', i: '❄', f: 'снег идёт, проекты растут', bg: '#0a1030' }, spring: { k: '桜', i: '🌸', f: 'лепестки летят, проекты цветут', bg: '#2a1f4a' }, summer: { k: '緑', i: '✨', f: 'светлячки в траве, проекты зреют', bg: '#0a2a3c' }, autumn: { k: '秋', i: '🍁', f: 'листья падают, проекты зреют', bg: '#26121f' } };
const SEASON = SEASONS[new URLSearchParams(location.search).get('season')] ? new URLSearchParams(location.search).get('season') : (m => (m === 11 || m < 2 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn'))(new Date().getMonth());
const SS = SEASONS[SEASON];
document.documentElement.dataset.season = SEASON; document.querySelector('meta[name=theme-color]').content = SS.bg;
document.querySelectorAll('[data-sk]').forEach((el) => { el.textContent = SS.k; }); $('foot-t').textContent = SS.f; $('snow-btn').textContent = SS.i;
setToday(); setInterval(setToday, 6e4); $('yr').textContent = new Date().getFullYear();
const applyCards = () => { document.documentElement.dataset.cards = cardsDark ? 'dark' : 'light'; $('cards-btn').setAttribute('aria-pressed', cardsDark); };
window.toggleCards = () => { cardsDark = !cardsDark; store.set('cards', cardsDark); applyCards(); }; applyCards();
const applySound = () => { $('sound-btn').textContent = soundOn ? '🔔' : '🔕'; };
window.toggleSound = () => { soundOn = !soundOn; store.set('sound', soundOn); applySound(); bell(); }; applySound();
function bell() { // колокольчик из трёх тонов, без аудиофайлов
  if (!soundOn) return;
  try { const a = new (window.AudioContext || window.webkitAudioContext)(), t = a.currentTime;
    [[880, .25], [1318, .12], [2217, .06]].forEach(([f, v]) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(1e-4, t + 2.2); o.connect(g).connect(a.destination); o.start(t); o.stop(t + 2.3); });
    setTimeout(() => a.close(), 2600); } catch {}
}
{ const d = new Date(); // новогодняя открытка: 28 дек – 10 янв (проверка: ?ny=1)
  if (((d.getMonth() === 11 && d.getDate() >= 28) || (d.getMonth() === 0 && d.getDate() <= 10) || /[?&]ny=1/.test(location.search)) && !sessionStorage.getItem('ny')) { $('modal-ny').classList.add('open'); try { sessionStorage.setItem('ny', 1); } catch {} } }
function celebrate() { bell(); toast('完 · проект завершён!'); const r = $('list-done').getBoundingClientRect(); fx.burst(r.left + r.width / 2, Math.max(r.top + 70, 90)); }

// ── Перетаскивание ──
window.dragStart = (e, id) => { draggedId = id; e.target.classList.add('dragging'); };
window.allowDrop = (e) => { if (!isAdmin) return; e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
window.dragLeave = (e) => e.currentTarget.classList.remove('drag-over');
window.drop = async (e) => {
  e.preventDefault(); const col = e.currentTarget; col.classList.remove('drag-over');
  if (!isAdmin) return toast('Только администратор может перемещать карточки', true);
  const status = col.dataset.status, task = tasks.find((t) => t.id === draggedId); draggedId = null; if (!task) return;
  const patch = task.status !== status ? statusPatch(status) : {};
  if (sort === 'manual') { // порядок внутри колонки
    const others = [...col.querySelectorAll('.card[data-id]')].filter((c) => c.dataset.id !== task.id);
    const idx = others.findIndex((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    const k = (c) => key(tasks.find((t) => t.id === c.dataset.id));
    const prev = others[idx === -1 ? others.length - 1 : idx - 1], nxt = idx === -1 ? null : others[idx];
    patch.order = prev && nxt ? (k(prev) + k(nxt)) / 2 : prev ? k(prev) + 1000 : nxt ? k(nxt) - 1000 : Date.now();
  } else if (task.status === status) return toast('Переставлять внутри колонки можно в режиме «Мой порядок»');
  if (Object.keys(patch).length) await updateDoc(doc(db, 'tasks', task.id), patch).catch((err) => toast(err.message, true));
};
window.moveTask = async (id) => { // для телефонов, где перетаскивание неудобно
  const t = tasks.find((x) => x.id === id), next = t && STATUSES[STATUSES.indexOf(t.status) + 1];
  if (next) await updateDoc(doc(db, 'tasks', id), statusPatch(next)).catch((err) => toast(err.message, true));
};
// ── Окно проекта ──
const modal = () => $('modal');
window.openModal = () => {
  editingTaskId = null; modal().querySelector('h2').textContent = 'Добавить проект';
  ['input-title', 'input-desc', 'input-link', 'input-tags', 'input-shot', 'input-reply'].forEach((i) => { $(i).value = ''; });
  $('input-status').value = 'dev'; $('input-verdict').value = ''; $('admin-form').style.display = 'block'; modal().classList.add('open'); $('input-title').focus();
};
window.openEditModal = (id) => {
  const t = tasks.find((x) => x.id === id); if (!t) return;
  editingTaskId = id; modal().querySelector('h2').textContent = 'Редактировать проект';
  $('input-title').value = t.title || ''; $('input-desc').value = t.desc || ''; $('input-link').value = t.url || ''; $('input-tags').value = (t.tags || []).join(', '); $('input-shot').value = t.shot || ''; $('input-reply').value = t.reply || ''; $('input-verdict').value = t.verdict || ''; $('input-status').value = t.status || 'idea';
  $('admin-form').style.display = 'block'; modal().classList.add('open');
};
window.closeModal = () => modal().classList.remove('open');
window.addTaskAdmin = async () => {
  const data = { title: $('input-title').value.trim(), desc: $('input-desc').value.trim(), url: $('input-link').value.trim(), status: $('input-status').value,
    shot: $('input-shot').value.trim(), verdict: $('input-verdict').value, reply: $('input-reply').value.trim(), tags: $('input-tags').value.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean).slice(0, 6) };
  if (!data.title) return toast('Введите название проекта', true);
  try {
    const old = tasks.find((t) => t.id === editingTaskId), now = Date.now();
    if (editingTaskId) await updateDoc(doc(db, 'tasks', editingTaskId), { ...data, updatedAt: now, ...(old && old.status !== data.status ? { history: arrayUnion({ s: data.status, t: now }) } : {}) });
    else await addDoc(tasksCollection, { ...data, createdAt: now, history: [{ s: data.status, t: now }] });
    closeModal(); toast(editingTaskId ? 'Изменения сохранены' : 'Проект добавлен');
  } catch (err) { toast('Ошибка: ' + err.message, true); }
};
window.deleteTask = (id) => { // удаление с отменой на 6 секунд
  if (!isAdmin) return toast('Только администратор может удалять проекты', true);
  pendingDel.add(id); render();
  const timer = setTimeout(async () => { await deleteDoc(doc(db, 'tasks', id)).catch((err) => toast(err.message, true)); pendingDel.delete(id); }, 6000);
  toast('Проект удалён', false, { label: 'Отменить', fn: () => { clearTimeout(timer); pendingDel.delete(id); render(); } });
};
window.exportData = () => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' }));
  a.download = 'board-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
};
window.importData = async (input) => {
  const f = input.files[0]; input.value = ''; if (!f) return;
  try {
    const arr = JSON.parse(await f.text()); if (!Array.isArray(arr)) throw new Error('нужен массив проектов');
    if (!confirm('Загрузить проектов: ' + arr.length + '? Совпадающие id будут перезаписаны.')) return;
    for (const { id, ...d } of arr) if (id && d.title) await setDoc(doc(db, 'tasks', id), d);
    toast('Импорт завершён');
  } catch (err) { toast('Ошибка импорта: ' + err.message, true); }
};

// ── Статистика (только для админа) ──
const seen = new Set();
function track(id, type) { if (isAdmin || seen.has(type + id)) return; seen.add(type + id); addDoc(eventsCollection, { task: id, type, dev: DEV, t: Date.now() }).catch(() => {}); }
document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[data-track]'); if (a) track(a.dataset.track, 'click'); });
window.openStats = async () => {
  $('modal-stats').classList.add('open'); const b = $('stats-body'); b.textContent = 'Считаю…';
  try {
    const r = {}; (await getDocs(eventsCollection)).forEach((d) => { const e = d.data(), x = (r[e.task] = r[e.task] || { v: 0, c: 0, u: new Set() }); if (e.type === 'view') x.v++; else x.c++; x.u.add(e.dev); });
    const rows = tasks.map((t) => ({ t, x: r[t.id] || { v: 0, c: 0, u: new Set() } })).sort((a, b) => b.x.v - a.x.v);
    b.innerHTML = `<table class="st"><tr><th>Проект</th><th>Просм.</th><th>Людей</th><th>Клики</th><th>▲</th></tr>${rows.map(({ t, x }) => `<tr><td>${esc((t.title || '').slice(0, 40))}</td><td>${x.v}</td><td>${x.u.size}</td><td>${x.c}</td><td>${votes[t.id] || 0}</td></tr>`).join('')}</table>`;
  } catch (err) { b.textContent = 'Ошибка: ' + err.message; }
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
document.addEventListener('click', (e) => { if (e.target.classList && e.target.classList.contains('modal-overlay')) e.target.classList.remove('open'); clearHash(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay.open').forEach((m) => m.classList.remove('open')); clearHash(); return; }
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
  document.querySelectorAll('[data-admin]').forEach((el) => { el.hidden = !isAdmin; });
  if (unsubSug) { unsubSug(); unsubSug = null; } suggestions = [];
  subComments();
  if (isAdmin) unsubSug = onSnapshot(sugCollection, (s) => { suggestions = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.createdAt - b.createdAt); render(); }, (e) => console.error(e));
  render();
});

// ── Идея от гостя ──
window.submitGuestIdea = async () => {
  const idea = $('guest-idea-input').value.trim().slice(0, 280);
  if (!idea) return toast('Напишите вашу идею', true);
  if (Date.now() - store.get('lastIdea', 0) < 3e4) return toast('Подождите полминуты перед следующей идеей', true);
  try {
    await addDoc(sugCollection, { title: idea, createdAt: Date.now(), source: 'guest' }); store.set('lastIdea', Date.now());
    $('guest-idea-input').value = ''; toast('Спасибо! Идея появится на доске после проверки');
  } catch (err) { toast('Ошибка при отправке: ' + err.message, true); }
};
window.approveIdea = async (id) => {
  const s = suggestions.find((x) => x.id === id); if (!s) return;
  try {
    await addDoc(tasksCollection, { title: s.title, desc: '', url: '', status: 'idea', source: 'guest', createdAt: s.createdAt, history: [{ s: 'idea', t: s.createdAt }] });
    await deleteDoc(doc(db, 'suggestions', id)); toast('Идея опубликована');
  } catch (err) { toast(err.message, true); }
};
window.rejectIdea = (id) => deleteDoc(doc(db, 'suggestions', id)).then(() => toast('Идея отклонена')).catch((err) => toast(err.message, true));

// ── Снегопад и искры (лёгкий canvas, без свечения и размытия) ──
let snowOn = store.get('snow', true);
$('snow-btn').setAttribute('aria-pressed', snowOn);
window.toggleSnow = () => { snowOn = !snowOn; store.set('snow', snowOn); $('snow-btn').setAttribute('aria-pressed', snowOn); toast(snowOn ? 'Эффекты включены' : 'Эффекты выключены'); };
const fx = { sparks: [], burst() {}, };
const P = { winter: { c: ['#fff'] }, autumn: { c: ['#e0412f', '#e8892a', '#d8b25a', '#b3341f'], leaf: 1 }, spring: { c: ['#ffc8dc', '#ffe3ec', '#ffb0cc'], leaf: 1 }, summer: { c: ['#e2f78a', '#b8ee7a'], fly: 1 } }[SEASON];
(() => {
  const cv = $('snow'), g = cv.getContext('2d');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let W, H, wind = 0, flakes = [], last = 0;
  const size = () => {
    W = cv.width = innerWidth; H = cv.height = innerHeight;
    flakes = Array.from({ length: Math.min(90, Math.round(W * H / 14000)) }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * .8 + .2, p: Math.random() * 6.28, c: P.c[(Math.random() * P.c.length) | 0] }));
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
      g.fillStyle = f.c; g.beginPath();
      if (P.fly) { // светлячки: плывут вверх и мерцают
        f.y -= f.z * .35; f.x += Math.sin(t / 1200 + f.p) * .5 * f.z; if (f.y < -6) { f.y = H + 6; f.x = Math.random() * W; }
        g.globalAlpha = .2 + .8 * Math.abs(Math.sin(t / 900 + f.p)); g.arc(f.x, f.y, f.z * 2.2, 0, 6.283); g.fill(); continue;
      }
      f.y += f.z * (P.leaf ? .8 : 1.1) + .3; f.x += Math.sin(t / 1500 + f.p) * (P.leaf ? .9 : .4) * f.z + wind * f.z * 1.2;
      if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W; } if (f.x > W + 6) f.x = -6; if (f.x < -6) f.x = W + 6;
      g.globalAlpha = .35 + f.z * .55;
      if (P.leaf) g.ellipse(f.x, f.y, f.z * 4.6, f.z * 2.4, f.p + t / 900 * f.z, 0, 6.283); else g.arc(f.x, f.y, f.z * 2.4, 0, 6.283);
      g.fill();
    }
    fx.sparks = fx.sparks.filter((p) => p.l > 0);
    for (const p of fx.sparks) { p.x += p.vx; p.y += p.vy; p.vy += .07; p.vx *= .985; p.l -= p.d; g.globalAlpha = Math.max(p.l, 0); g.fillStyle = p.c; g.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); }
    g.globalAlpha = 1;
  })(0);
})();
