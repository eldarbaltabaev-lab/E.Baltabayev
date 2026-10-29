import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// ═══════════════════════════════════════════════════════════
// 1. ⬇️ ВСТАВЬ СЮДА СВОЙ КОД ИЗ FIREBASE ⬇️
// ══════════════════════════════════════════════════════════
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyCFNCEiyo3bQXbeDr17RBnps9Nclw-Bf3k',
  authDomain: 'meprtf-261b5.firebaseapp.com',
  projectId: 'meprtf-261b5',
  storageBucket: 'meprtf-261b5.firebasestorage.app',
  messagingSenderId: '455250051170',
  appId: '1:455250051170:web:8ed8da93386265fe14d13b',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

//══════════════════════════════════════════════
// 2. ⬆️ КОНЕЦ ВСТАВКИ (ниже ничего не меняй) ⬆️
// ═══════════════════════════════════════════════════════════

// Инициализация базы (сработает, когда ты вставишь конфиг выше)
const db = getFirestore(app);
const tasksCollection = collection(db, 'tasks');
const auth = getAuth(app);
let isAdmin = false; // По умолчанию мы гости

let tasks = [];
let draggedId = null;
let editingTaskId = null;

// Подписка на изменения в базе данных (Realtime)
onSnapshot(tasksCollection, (snapshot) => {
  console.log('📥 Получено документов из базы:', snapshot.size);

  tasks = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    console.log('Задача:', data.title, '| Статус:', data.status);
    tasks.push({ id: doc.id, ...data });
  });
  render();
});

function render() {
  // 1. Очищаем колонки (добавил проверку, чтобы не было ошибки)
  ['idea', 'dev', 'test', 'done'].forEach((status) => {
    const list = document.getElementById(`list-${status}`);
    const count = document.getElementById(`count-${status}`);
    if (list) list.innerHTML = '';
    if (count) count.innerText = '0';
  });

  const counts = { idea: 0, dev: 0, test: 0, done: 0 };

  // 2. Рисуем карточки
  tasks.forEach((task) => {
    // Проверка, чтобы не рисовать задачи с неизвестным статусом
    if (counts[task.status] === undefined) return;

    counts[task.status]++;

    const container = document.getElementById(`list-${task.status}`);
    if (!container) return; // Если колонки нет, пропускаем

    const card = document.createElement('div');
    card.className = 'card';
    card.draggable = true;
    card.ondragstart = (e) => dragStart(e, task.id);

    card.innerHTML = `
    <div class="card-actions">
      ${isAdmin ? `<button class="edit-btn" onclick="openEditModal('${task.id}')" title="Редактировать">✎</button>` : ''}
      <button class="delete-btn" onclick="deleteTask('${task.id}')" title="Удалить">✕</button>
    </div>
    <div class="card-title">${task.title}</div>
    <div class="card-desc">${task.desc || ''}</div>
    ${task.url ? `<a href="${task.url}" target="_blank" class="card-link">🔗 Открыть проект</a>` : ''}
  `;

    container.appendChild(card);
  });

  // 3. Обновляем счетчики
  ['idea', 'dev', 'test', 'done'].forEach((status) => {
    const count = document.getElementById(`count-${status}`);
    if (count) count.innerText = counts[status];
  });
}
// Drag & Drop
window.dragStart = (e, id) => {
  draggedId = id;
  e.target.classList.add('dragging');
};

window.allowDrop = (e) => {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
};

window.dragLeave = (e) => {
  e.currentTarget.classList.remove('drag-over');
};

window.drop = async (e) => {
  if (!isAdmin) return alert('Только администратор может перемещать карточки!');
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  if (draggedId) {
    const newStatus = e.currentTarget.dataset.status;
    const task = tasks.find((t) => t.id === draggedId);

    if (task && task.status !== newStatus) {
      await updateDoc(doc(db, 'tasks', draggedId), { status: newStatus });
    }
    draggedId = null;
  }
};

window.openModal = () => {
  editingTaskId = null; // Сбрасываем режим редактирования
  document.querySelector('#modal h2').innerText = 'Добавить проект'; // Возвращаем заголовок
  
  // Очищаем поля
  document.getElementById('input-title').value = '';
  document.getElementById('input-desc').value = '';
  document.getElementById('input-link').value = '';
  
  document.getElementById('admin-form').style.display = 'block';
  document.getElementById('modal').classList.add('open');
};
// Функция для закрытия модального окна добавления проекта
window.closeModal = () => {
  const modal = document.getElementById('modal');
  if (modal) {
    modal.classList.remove('open');
  }
};

window.openEditModal = (id) => {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  editingTaskId = id; // Запоминаем, что мы редактируем
  document.querySelector('#modal h2').innerText = 'Редактировать проект'; // Меняем заголовок
  
  // Заполняем поля текущими данными
  document.getElementById('input-title').value = task.title || '';
  document.getElementById('input-desc').value = task.desc || '';
  document.getElementById('input-link').value = task.url || '';
  document.getElementById('input-status').value = task.status || 'idea';
  
  document.getElementById('admin-form').style.display = 'block';
  document.getElementById('modal').classList.add('open');
};window.openEditModal = (id) => {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  editingTaskId = id; // Запоминаем, что мы редактируем
  document.querySelector('#modal h2').innerText = 'Редактировать проект'; // Меняем заголовок
  
  // Заполняем поля текущими данными
  document.getElementById('input-title').value = task.title || '';
  document.getElementById('input-desc').value = task.desc || '';
  document.getElementById('input-link').value = task.url || '';
  document.getElementById('input-status').value = task.status || 'idea';
  
  document.getElementById('admin-form').style.display = 'block';
  document.getElementById('modal').classList.add('open');
};

// --- БЕЗОПАСНЫЕ ОБРАБОТЧИКИ КЛИКОВ ПО ФОНУ ---
// Эта проверка предотвратит ошибку на строке 240
document.addEventListener('click', function(e) {
  // Закрытие окна добавления проекта
  if (e.target.id === 'modal') {
    window.closeModal();
  }
  // Закрытие окна авторизации
  if (e.target.id === 'modal-auth') {
    window.closeAuthModal(); // Убедись, что эта функция тоже есть ниже
  }
});

// Добавление (Админ)
window.openEditModal = (id) => {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  editingTaskId = id; // Запоминаем, что мы редактируем
  document.querySelector('#modal h2').innerText = 'Редактировать проект'; // Меняем заголовок
  
  // Заполняем поля текущими данными
  document.getElementById('input-title').value = task.title || '';
  document.getElementById('input-desc').value = task.desc || '';
  document.getElementById('input-link').value = task.url || '';
  document.getElementById('input-status').value = task.status || 'idea';
  
  document.getElementById('admin-form').style.display = 'block';
  document.getElementById('modal').classList.add('open');
};

// Удаление
window.deleteTask = async (id) => {
  if (!isAdmin) return alert('Только администратор может удалять проекты!');
  if (confirm('Удалить этот проект с доски?')) {
    await deleteDoc(doc(db, 'tasks', id));
  }
};
window.toggleAuth = () => {
  const authModal = document.getElementById('modal-auth');
  
  if (isAdmin) {
    signOut(auth).then(() => alert("Вы вышли из режима администратора"));
  } else {
    if (authModal) {
      authModal.classList.add('open');
    } else {
      alert("Ошибка: HTML-окно для входа (id='modal-auth') не найдено на странице!");
    }
  }
};

window.closeAuthModal = () => {
  const authModal = document.getElementById('modal-auth');
  if (authModal) authModal.classList.remove('open');
};

// Безопасное закрытие модалки по клику на фон
document.addEventListener('click', function(e) {
  if (e.target.id === 'modal-auth') {
    window.closeAuthModal();
  }
  if (e.target.id === 'modal') {
    window.closeModal();
  }
});

// А эта функция (toggleAuth) остается без изменений
window.toggleAuth = () => {
  if (isAdmin) {
    signOut(auth).then(() => alert("Вы вышли из режима администратора"));
  } else {
    document.getElementById('modal-auth').classList.add('open');
  }
};
document.getElementById('modal-auth').addEventListener('click', function(e) {
  if (e.target === this) closeAuthModal();
});

window.addTaskGuest = async () => {
  const idea = document.getElementById('input-guest-idea').value.trim();

  if (!idea) return alert('Пожалуйста, напишите вашу идею!');

  try {
    // Отправляем идею в базу. Название = сама идея, статус = idea, остальное пустое.
    await addDoc(tasksCollection, {
      title: idea, 
      desc: 'Предложено посетителем сайта',
      url: '',
      status: 'idea',
      createdAt: Date.now()
    });

    document.getElementById('input-guest-idea').value = '';
    closeModal();
    alert("Спасибо! Ваша идея отправлена разработчику.");
  } catch (error) {
    alert("Ошибка при отправке: " + error.message);
    console.error(error);
  }
}
// --- БЛОК АВТОРИЗАЦИИ ---

// Функция для кнопки "Войти" / "Выйти" в шапке
window.toggleAuth = () => {
  const authModal = document.getElementById('modal-auth');
  if (isAdmin) {
    signOut(auth).then(() => alert("Вы вышли из режима администратора"));
  } else {
    if (authModal) authModal.classList.add('open');
  }
};

// Функция для закрытия окна ввода пароля
window.closeAuthModal = () => {
  const authModal = document.getElementById('modal-auth');
  if (authModal) authModal.classList.remove('open');
};

// Сама функция входа (проверка логина и пароля)
window.login = async () => {
  const email = document.getElementById('auth-email').value;
  const pass = document.getElementById('auth-pass').value;
  
  try {
    // Пытаемся войти через Firebase
    await signInWithEmailAndPassword(auth, email, pass);
    // Если успешно — закрываем окно
    window.closeAuthModal();
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-pass').value = '';
  } catch (error) {
    alert("Ошибка входа: " + error.message);
  }
};
window.submitGuestIdea = async () => {
  const idea = document.getElementById('guest-idea-input').value.trim();
  if (!idea) return alert('Пожалуйста, напишите вашу идею!');

  try {
    await addDoc(tasksCollection, {
      title: idea, 
      desc: 'Предложено посетителем сайта',
      url: '',
      status: 'idea',
      createdAt: Date.now()
    });

    document.getElementById('guest-idea-input').value = '';
    alert("Спасибо! Ваша идея успешно отправлена.");
  } catch (error) {
    alert("Ошибка при отправке: " + error.message);
  }
};

// Слушатель, который следит, вошел ты или нет
onAuthStateChanged(auth, (user) => {
  const addBtn = document.getElementById('add-btn');
  const authBtn = document.getElementById('auth-btn');
  const guestSection = document.getElementById('guest-idea-section');

  if (user) {
    // АДМИН
    isAdmin = true;
    if (authBtn) {
      authBtn.innerText = "Выйти";
      authBtn.classList.remove('btn-cancel');
      authBtn.classList.add('btn');
    }
    // Показываем кнопку создания проекта
    if (addBtn) addBtn.style.display = 'inline-block';
    // Скрываем нижнюю форму для гостей
    if (guestSection) guestSection.style.display = 'none';
    
  } else {
    // ГОСТЬ
    isAdmin = false;
    if (authBtn) {
      authBtn.innerText = "Войти";
      authBtn.classList.add('btn-cancel');
      authBtn.classList.remove('btn');
    }
    // СКРЫВАЕМ верхнюю кнопку
    if (addBtn) addBtn.style.display = 'none';
    // ПОКАЗЫВАЕМ нижнюю форму для идей
    if (guestSection) guestSection.style.display = 'block';
  }
  // --- ДОБАВЛЕНИЕ И РЕДАКТИРОВАНИЕ ПРОЕКТА (АДМИН) ---
window.addTaskAdmin = async () => {
  const title = document.getElementById('input-title').value.trim();
  const desc = document.getElementById('input-desc').value.trim();
  const url = document.getElementById('input-link').value.trim();
  const status = document.getElementById('input-status').value;

  if (!title) return alert('Введите название проекта!');

  try {
    // Если мы редактируем существующий проект
    if (typeof editingTaskId !== 'undefined' && editingTaskId) {
      const taskRef = doc(db, 'tasks', editingTaskId);
      await updateDoc(taskRef, {
        title: title,
        desc: desc,
        url: url,
        status: status
      });
    } else {
      // Если создаем новый
      await addDoc(tasksCollection, {
        title: title,
        desc: desc,
        url: url,
        status: status,
        createdAt: Date.now()
      });
    }

    // Закрываем окно после успешного сохранения
    if (window.closeModal) window.closeModal();
    
  } catch (error) {
    alert("Ошибка при сохранении: " + error.message);
    console.error(error);
  }
};
  
  render(); 
});
