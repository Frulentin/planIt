/* =====================================================
   LISTE DES JOURS ET VARIABLES GLOBALES
===================================================== */

// Jours de la semaine avec leur index
const DAYS = [
  { value: 0, label: 'Lundi'},
  { value: 1, label: 'Mardi'},
  { value: 2, label: 'Mercredi'},
  { value: 3, label: 'Jeudi'},
  { value: 4, label: 'Vendredi'},
  { value: 5, label: 'Samedi'},
  { value: 6, label: 'Dimanche'}
];

// Clés de stockage local (localStorage)
const STORAGE_TOKEN_KEY = 'planit_token'; // Sauvegarde du jeton JWT
const STORAGE_USER_KEY = 'planit_user';   // Sauvegarde infos utilisateur

const authView = document.querySelector('[data-auth]');
const boardView = document.querySelector('[data-board]');
const logoutButton = document.querySelector('[data-logout]');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginFeedback = document.querySelector('[data-login-feedback]');
const registerFeedback = document.querySelector('[data-register-feedback]');
const greeting = document.querySelector('[data-user-greeting]');
const calendar = document.querySelector('[data-calendar]');
const taskTemplate = document.getElementById('task-template');
const taskDialog = document.querySelector('[data-task-dialog]');
const taskForm = document.getElementById('task-form');
const quickTaskDialog = document.querySelector('[data-quick-task]');
const quickTaskForm = document.getElementById('quick-task-form');
const taskDaySelect = document.getElementById('task-day');
const quickTaskDaySelect = document.getElementById('quick-task-day');
const openDialogButton = document.querySelector('[data-open-task-dialog]');
const openQuickTaskButton = document.querySelector('[data-open-quick-task]');
const closeDialogButtons = document.querySelectorAll('[data-close-dialog]');
const quickTaskInput = document.getElementById('quick-task-input');

// État global de l’application
let state = {
  token: null,                  // Jeton d’authentification
  user: null,                   // Infos utilisateur connecté
  board: createEmptyBoard()     // Tâches organisées par jour
};

// Map pour stocker les colonnes du calendrier
const dayElements = new Map();
// ID de la tâche en cours de déplacement (drag & drop)
let draggingTaskId = null;

init();

/* =====================================================
   INITIALISATION
===================================================== */
function init() {
  createCalendarColumns();  // Crée les colonnes du calendrier
  populateDayOptions();     // Ajoute les jours aux sélecteurs
  registerEventListeners(); // Active les événements
  restoreSession();         // Vérifie si une session utilisateur existe
}

/* =====================================================
   ENREGISTREMENT DES ÉVÉNEMENTS
===================================================== */

function registerEventListeners() {
  // Changement onglet (connexion / inscription)
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });
  // Authentification
  loginForm.addEventListener('submit', handleLogin);
  registerForm.addEventListener('submit', handleRegister);
  logoutButton.addEventListener('click', logout);

  // Ouverture des modales
  openDialogButton.addEventListener('click', () => openTaskDialog());
  openQuickTaskButton.addEventListener('click', () => openQuickTask());

  // Fermeture des modales
  closeDialogButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (taskDialog.open) {
        taskDialog.close();
      }
      if (quickTaskDialog.open) {
        quickTaskDialog.close();
      }
    });
  });
  // Envoi formulaires tâches
  taskForm.addEventListener('submit', handleTaskSubmit);
  quickTaskForm.addEventListener('submit', handleQuickTaskSubmit);
  // Empêcher la fermeture brutale
  taskDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    taskDialog.close();
  });
  quickTaskDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    quickTaskDialog.close();
  });
}

/* =====================================================
   CALENDRIER & AFFICHAGE
===================================================== */

// Création des colonnes (1 par jour)
function createCalendarColumns() {
  calendar.innerHTML = '';
  dayElements.clear();

  DAYS.forEach((day) => {
    const column = document.createElement('div');
    column.className = 'day-column';
    column.dataset.day = day.value;

     // En-tête
    const header = document.createElement('div');
    header.className = 'day-header';

    const title = document.createElement('div');
    const titleLabel = document.createElement('h3');
    titleLabel.textContent = `${day.label}`;
    const count = document.createElement('span');
    count.textContent = 'Aucune tâche';
    title.append(titleLabel, count);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'icon-button';
    addButton.setAttribute('aria-label', `Ajouter une tâche pour ${day.label}`);
    addButton.textContent = '+';
    addButton.addEventListener('click', () => openTaskDialog(day.value));

    header.append(title, addButton);

    // Liste des tâches
    const list = document.createElement('div');
    list.className = 'task-list empty';
    list.dataset.day = String(day.value);
    // Drag & drop
    list.addEventListener('dragover', handleDragOver);
    list.addEventListener('drop', handleDrop);
    list.addEventListener('dragleave', handleDragLeave);

    column.append(header, list);
    calendar.append(column);
    dayElements.set(day.value, { column, list, count });
  });
}

// Remplissage des sélecteurs (jours)
function populateDayOptions() {
  const todayIndex = getTodayIndex();
  DAYS.forEach((day) => {
    const option = new Option(`${day.label}`, day.value);
    const optionQuick = new Option(day.label, day.value);
    taskDaySelect.add(option);
    quickTaskDaySelect.add(optionQuick);
  });
  taskDaySelect.value = String(todayIndex);
  quickTaskDaySelect.value = String(todayIndex);
}

// Bascule connexion / inscription
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  document.querySelectorAll('.form').forEach((form) => {
    form.classList.toggle('active', form.id.startsWith(tabName));
  });
  clearFeedback();
}

/* =====================================================
   AUTHENTIFICATION
===================================================== */

// Connexion
async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const credentials = {
    email: formData.get('email').trim(),
    password: formData.get('password')
  };
  if (!credentials.email || !credentials.password) {
    return displayFeedback(loginFeedback, 'Merci de renseigner vos identifiants.', 'error');
  }
  toggleFormDisabled(loginForm, true);
  displayFeedback(loginFeedback, 'Connexion en cours...');
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: credentials
    });
    persistSession(data);
    await enterBoard();
  } catch (error) {
    const message = error?.data?.error || 'Connexion impossible. Vérifiez vos informations.';
    displayFeedback(loginFeedback, message, 'error');
  } finally {
    toggleFormDisabled(loginForm, false);
  }
}

// Inscription
async function handleRegister(event) {
  event.preventDefault();
  const formData = new FormData(registerForm);
  const payload = {
    name: formData.get('name').trim(),
    email: formData.get('email').trim(),
    password: formData.get('password')
  };
  if (!payload.email || !payload.password) {
    return displayFeedback(registerFeedback, 'Merci de compléter les informations demandées.', 'error');
  }
  toggleFormDisabled(registerForm, true);
  displayFeedback(registerFeedback, 'Création du compte...');
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: payload
    });
    persistSession(data);
    await enterBoard();
  } catch (error) {
    const message = error?.data?.error || 'Inscription impossible pour le moment.';
    displayFeedback(registerFeedback, message, 'error');
  } finally {
    toggleFormDisabled(registerForm, false);
  }
}

// Passage à la vue tableau
async function enterBoard() {
  if (!state.token || !state.user) {
    return;
  }
  authView.classList.add('hidden');
  boardView.classList.remove('hidden');
  logoutButton.classList.remove('hidden');
  updateGreeting();
  await loadTasks();
}

// Message de bienvenue personnalisé avec le prénom de l'utilisateur
function updateGreeting() {
  const now = new Date();
  const hour = now.getHours();
  let message = 'Bonjour';
  if (hour >= 18) {
    message = 'Bonne soirée';
  } else if (hour >= 12) {
    message = 'Bon après-midi';
  } else if (hour < 6) {
    message = 'Bonne nuit';
  }
  const displayName = state.user?.name || state.user?.email || 'Planificateur·rice';
  greeting.textContent = `${message}, ${displayName} !`;
}

/* =====================================================
   GESTION DES TÂCHES
===================================================== */

// Charger les tâches depuis l’API
async function loadTasks() {
  try {
    const data = await api('/api/tasks');
    const tasks = data?.tasks || [];
    state.board = createEmptyBoard();
    tasks.forEach((task) => {
      if (!Array.isArray(state.board[task.day])) {
        state.board[task.day] = [];
      }
      state.board[task.day].push(task);
    });
    normalizeBoard();
    renderBoard();
  } catch (error) {
    console.error('Erreur lors du chargement des tâches', error);
  }
}

// Rendu du tableau avec les tâches
function renderBoard() {
  DAYS.forEach((day) => {
    const elements = dayElements.get(day.value);
    if (!elements) {
      return;
    }
    const tasks = state.board[day.value] || [];
    elements.list.innerHTML = '';
    if (!tasks.length) {
      elements.list.classList.add('empty');
    } else {
      elements.list.classList.remove('empty');
    }
    tasks
      .sort((a, b) => a.position - b.position)
      .forEach((task) => {
        const node = taskTemplate.content.firstElementChild.cloneNode(true);
        node.dataset.id = task.id;
        const titleEl = node.querySelector('h4');
        titleEl.textContent = task.title;
        const notesEl = node.querySelector('.task-notes');
        if (task.description) {
          notesEl.textContent = task.description;
          notesEl.style.display = 'block';
        } else {
          notesEl.textContent = '';
          notesEl.style.display = 'none';
        }
        const deleteButton = node.querySelector('[data-delete-task]');
        deleteButton.addEventListener('click', () => confirmDeleteTask(task));
        node.addEventListener('dragstart', onDragStart);
        node.addEventListener('dragend', onDragEnd);
        elements.list.append(node);
      });
    if (elements.count) {
      elements.count.textContent = formatTaskCount(tasks.length);
    }
  });
}

// Début du drag & drop
function onDragStart(event) {
  const card = event.currentTarget;
  draggingTaskId = card.dataset.id;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggingTaskId);
  requestAnimationFrame(() => {
    card.classList.add('dragging');
  });
}

// Fin du drag & drop
function onDragEnd(event) {
  const card = event.currentTarget;
  card.classList.remove('dragging');
  draggingTaskId = null;
}

// Survol pendant drag & drop
function handleDragOver(event) {
  event.preventDefault();
  const list = event.currentTarget;
  list.classList.add('drag-over');
  event.dataTransfer.dropEffect = 'move';
}

// Sortie de la zone drag
function handleDragLeave(event) {
  const list = event.currentTarget;
  if (!list.contains(event.relatedTarget)) {
    list.classList.remove('drag-over');
  }
}

// Déposer une tâche
function handleDrop(event) {
  event.preventDefault();
  const list = event.currentTarget;
  list.classList.remove('drag-over');
  const day = Number(list.dataset.day);
  const taskId = event.dataTransfer.getData('text/plain') || draggingTaskId;
  if (!taskId && taskId !== 0) {
    return;
  }
  const dropIndex = calculateDropIndex(list, event.clientY);
  moveTask(taskId, day, dropIndex);
}

// Calculer l'index où déposer
function calculateDropIndex(list, clientY) {
  const cards = Array.from(list.querySelectorAll('.task-card:not(.dragging)'));
  if (!cards.length) {
    return 0;
  }
  let index = cards.length;
  for (let i = 0; i < cards.length; i += 1) {
    const rect = cards[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      index = i;
      break;
    }
  }
  return index;
}

// Déplacer une tâche
function moveTask(taskId, targetDay, targetIndex) {
  const sourceDay = findTaskDay(taskId);
  if (sourceDay === null) {
    return;
  }
  const sourceList = state.board[sourceDay];
  const currentIndex = sourceList.findIndex((task) => task.id === taskId);
  if (currentIndex === -1) {
    return;
  }
  const [task] = sourceList.splice(currentIndex, 1);
  task.day = targetDay;
  const destination = state.board[targetDay];
  const clampedIndex = Math.min(Math.max(targetIndex, 0), destination.length);
  destination.splice(clampedIndex, 0, task);
  normalizeBoard();
  renderBoard();
  persistReorder();
}

// Sauvegarder le nouvel ordre des tâches
async function persistReorder() {
  try {
    const payload = {
      tasks: getAllTasks().map((task) => ({ id: task.id, day: task.day, position: task.position }))
    };
    await api('/api/tasks/reorder', {
      method: 'PUT',
      body: payload
    });
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de l\'ordre des tâches', error);
  }
}

// Trouver le jour d’une tâche
function findTaskDay(taskId) {
  for (const day of DAYS) {
    const tasks = state.board[day.value];
    if (tasks.some((task) => task.id === taskId)) {
      return day.value;
    }
  }
  return null;
}

// Ré-indexation des positions
function normalizeBoard() {
  DAYS.forEach((day) => {
    const tasks = state.board[day.value];
    if (!Array.isArray(tasks)) {
      state.board[day.value] = [];
      return;
    }
    tasks.forEach((task, index) => {
      task.position = index;
    });
  });
}

// Ajouter une tâche (formulaire complet)
async function handleTaskSubmit(event) {
  event.preventDefault();
  const formData = new FormData(taskForm);
  const title = (formData.get('title') || '').toString().trim();
  const description = (formData.get('description') || '').toString().trim();
  const day = Number(formData.get('day'));
  if (!title) {
    return;
  }
  const task = { title, description, day };
  try {
    const data = await api('/api/tasks', {
      method: 'POST',
      body: task
    });
    if (data?.task) {
      addTaskToBoard(data.task);
      renderBoard();
    }
    taskDialog.close();
    taskForm.reset();
    taskDaySelect.value = String(task.day);
  } catch (error) {
    console.error('Erreur lors de l\'ajout de la tâche', error);
  }
}

// Ajouter une tâche (ajout rapide)
async function handleQuickTaskSubmit(event) {
  event.preventDefault();
  const formData = new FormData(quickTaskForm);
  const title = (formData.get('title') || '').toString().trim();
  const day = Number(formData.get('day'));
  if (!title) {
    return;
  }
  const task = { title, day };
  try {
    const data = await api('/api/tasks', {
      method: 'POST',
      body: task
    });
    if (data?.task) {
      addTaskToBoard(data.task);
      renderBoard();
    }
    quickTaskDialog.close();
    quickTaskForm.reset();
    quickTaskDaySelect.value = String(task.day);
  } catch (error) {
    console.error('Erreur lors de l\'ajout rapide', error);
  }
}

// Ajouter dans le tableau local
function addTaskToBoard(task) {
  if (!Array.isArray(state.board[task.day])) {
    state.board[task.day] = [];
  }
  state.board[task.day].push(task);
  state.board[task.day].sort((a, b) => a.position - b.position);
  normalizeBoard();
}

// Confirmation suppression
async function confirmDeleteTask(task) {
  const confirmation = window.confirm(`Supprimer la tâche "${task.title}" ?`);
  if (!confirmation) {
    return;
  }
  await deleteTask(task);
}

// Suppression d’une tâche
async function deleteTask(task) {
  try {
    await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
    const tasks = state.board[task.day] || [];
    state.board[task.day] = tasks.filter((item) => item.id !== task.id);
    normalizeBoard();
    renderBoard();
    persistReorder();
  } catch (error) {
    console.error('Erreur lors de la suppression', error);
    await loadTasks();
  }
}

// Ouvrir modale "Nouvelle tâche"
function openTaskDialog(day = getTodayIndex()) {
  taskForm.reset();
  taskDaySelect.value = String(day);
  taskDialog.showModal();
  taskDialog.querySelector('input[name="title"]').focus();
}

// Ouvrir modale "Ajout rapide"
function openQuickTask(day = getTodayIndex()) {
  quickTaskForm.reset();
  quickTaskDaySelect.value = String(day);
  quickTaskDialog.showModal();
  quickTaskInput.focus();
}

/* =====================================================
   OUTILS
===================================================== */

// Créer un tableau vide
function createEmptyBoard() {
  const board = {};
  DAYS.forEach((day) => {
    board[day.value] = [];
  });
  return board;
}

// Récupérer toutes les tâches
function getAllTasks() {
  return DAYS.flatMap((day) => state.board[day.value] || []);
}

// Formater le compteur ("Aucune / 1 / X tâches")
function formatTaskCount(count) {
  if (count === 0) {
    return 'Aucune tâche';
  }
  if (count === 1) {
    return '1 tâche';
  }
  return `${count} tâches`;
}

// Récupérer l’index du jour actuel
function getTodayIndex() {
  const jsDay = new Date().getDay();
  return (jsDay + 6) % 7;
}

// Afficher un message (feedback)
function displayFeedback(element, message, type = 'info') {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.style.color = type === 'error' ? '#e74c3c' : '#24c7d6';
}

// Effacer les feedbacks
function clearFeedback() {
  displayFeedback(loginFeedback, '');
  displayFeedback(registerFeedback, '');
}

// Activer/désactiver un formulaire
function toggleFormDisabled(form, disabled) {
  const inputs = Array.from(form.querySelectorAll('input, button'));
  inputs.forEach((input) => {
    input.disabled = disabled;
  });
}

/* =====================================================
   SESSION
===================================================== */

// Restaurer session depuis localStorage
async function restoreSession() {
  const savedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
  if (!savedToken) {
    return;
  }
  state.token = savedToken;
  try {
    const data = await api('/api/auth/me');
    if (data?.user) {
      state.user = data.user;
      persistLocalUser(state.user);
      await enterBoard();
    } else {
      clearSession();
    }
  } catch (error) {
    console.warn('Session expirée', error);
    clearSession();
  }
}

// Sauvegarder la session
function persistSession(data) {
  if (!data?.token || !data?.user) {
    return;
  }
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem(STORAGE_TOKEN_KEY, state.token);
  persistLocalUser(state.user);
}

// Sauvegarder infos utilisateur
function persistLocalUser(user) {
  if (!user) {
    localStorage.removeItem(STORAGE_USER_KEY);
    return;
  }
  localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
}

// Nettoyer session (déconnexion)
function clearSession() {
  state = {
    token: null,
    user: null,
    board: createEmptyBoard()
  };
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  localStorage.removeItem(STORAGE_USER_KEY);
  boardView.classList.add('hidden');
  authView.classList.remove('hidden');
  logoutButton.classList.add('hidden');
  renderBoard();
}

// Déconnexion
function logout() {
  clearSession();
  loginForm.reset();
  registerForm.reset();
  switchTab('login');
}

/* =====================================================
   APPELS API
===================================================== */

// Fonction générique pour appeler l’API avec gestion JWT
async function api(path, options = {}) {
  const config = { ...options, headers: { ...(options.headers || {}) } };
  if (!config.headers['Content-Type'] && options.body && !(options.body instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
  }
  if (state.token) {
    config.headers.Authorization = `Bearer ${state.token}`;
  }
  if (options.body && config.headers['Content-Type'] === 'application/json') {
    config.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, config);
  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== 204 && contentType.includes('application/json')) {
    data = await response.json();
  }
  if (!response.ok) {
    const error = new Error('Request failed');
    error.data = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

