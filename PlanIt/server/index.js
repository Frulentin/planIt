// -----------------------------
// Import des modules Node.js
// -----------------------------
const http = require('http');      // Création du serveur HTTP
const { URL } = require('url');    // Pour parser les URL
const path = require('path');      // Gestion des chemins de fichiers
const fs = require('fs');          // Lecture/écriture fichiers
const crypto = require('crypto');  // Pour le hachage et tokens

// -----------------------------
// Constantes & chemins
// -----------------------------
const CLIENT_DIR = path.join(__dirname, '..', 'client');       // Dossier du front
const DATA_FILE = path.join(__dirname, 'data', 'data.json');   // Fichier "base de données"
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret'; // Clé secrète JWT
const PORT = process.env.PORT || 4000;                         // Port du serveur

// Types MIME pour les fichiers statiques
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// S’assure que le fichier data.json existe
ensureDataFile();

// -----------------------------
// Création du serveur HTTP
// -----------------------------
const server = http.createServer(async (req, res) => {
  enableCors(req, res); // Active le CORS

  // Réponse immédiate aux pré-requêtes OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  // Vérifie si c’est un appel API ou un fichier statique
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  if (requestUrl.pathname.startsWith('/api/')) {
    await handleApiRequest(req, res, requestUrl); // Requête API
    return;
  }

  serveStaticFile(req, res, requestUrl); // Sinon → fichier du front
});

// Lancement du serveur
server.listen(PORT, () => {
  console.log(`PlanIt API running on port ${PORT}`);
});

// -----------------------------
// Fonctions utilitaires globales
// -----------------------------

// Active CORS (pour permettre au front d’appeler l’API)
function enableCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Crée data.json si absent
function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], tasks: [] }, null, 2));
  }
}

// Lecture & écriture de la "base de données" JSON
function readDatabase() {
  const content = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(content);
}

function writeDatabase(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// -----------------------------
// Gestion des routes API
// -----------------------------

async function handleApiRequest(req, res, requestUrl) {
  try {
    const { pathname } = requestUrl;

    // Authentification
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      return await handleRegister(req, res);
    }
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      return await handleLogin(req, res);
    }
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      return await handleCurrentUser(req, res);
    }

    // Tâches
    if (pathname === '/api/tasks' && req.method === 'GET') {
      return await handleGetTasks(req, res);
    }
    if (pathname === '/api/tasks' && req.method === 'POST') {
      return await handleCreateTask(req, res);
    }
    if (pathname.startsWith('/api/tasks/') && req.method === 'DELETE') {
      const taskId = pathname.split('/').pop();
      return await handleDeleteTask(req, res, taskId);
    }
    if (pathname.startsWith('/api/tasks/') && req.method === 'PUT') {
      const parts = pathname.split('/');
      const action = parts[3];
      if (action === 'reorder') {
        return await handleReorderTasks(req, res);
      }
      const taskId = parts.pop();
      return await handleUpdateTask(req, res, taskId);
    }

    // Si aucune route trouvée
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  } catch (error) {
    console.error('API error', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

// -----------------------------
// Gestion des comptes utilisateurs
// -----------------------------

// Inscription
async function handleRegister(req, res) {
  const body = await parseJsonBody(req, res);
  if (!body) {
    return;
  }
  const { email, password, name } = body;
  if (!email || !password) {
    return respondJson(res, 400, { error: 'Email et mot de passe requis.' });
  }

  const db = readDatabase();
  // Vérifie si l’email existe déjà
  const existing = db.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return respondJson(res, 400, { error: 'Un compte avec cet e-mail existe déjà.' });
  }

  // Crée le nouvel utilisateur
  const { salt, hash } = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    name: name?.trim() || null,
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  writeDatabase(db);

  // Génère un token JWT
  const token = generateToken({ id: user.id, email: user.email });
  return respondJson(res, 201, {
    token,
    user: sanitizeUser(user)
  });
}

// Connexion
async function handleLogin(req, res) {
  const body = await parseJsonBody(req, res);
  if (!body) {
    return;
  }
  const { email, password } = body;
  if (!email || !password) {
    return respondJson(res, 400, { error: 'Identifiants invalides.' });
  }
  const db = readDatabase();
  const user = db.users.find((item) => item.email === email.toLowerCase());
  if (!user || !verifyPassword(password, user)) {
    return respondJson(res, 401, { error: 'Identifiants invalides.' });
  }

  const token = generateToken({ id: user.id, email: user.email });
  return respondJson(res, 200, {
    token,
    user: sanitizeUser(user)
  });
}

// Récupérer l’utilisateur courant (profil)
async function handleCurrentUser(req, res) {
  const user = authenticateRequest(req, res);
  if (!user) {
    return;
  }
  return respondJson(res, 200, { user: sanitizeUser(user) });
}

// -----------------------------
// Gestion des tâches
// -----------------------------

// Lire toutes les tâches utilisateur
async function handleGetTasks(req, res) {
  const user = authenticateRequest(req, res);
  if (!user) {
    return;
  }
  const db = readDatabase();
  const tasks = db.tasks
    .filter((task) => task.userId === user.id)
    .sort((a, b) => (a.day - b.day) || (a.position - b.position));
  respondJson(res, 200, { tasks });
}

// Créer une tâche
async function handleCreateTask(req, res) {
  const user = authenticateRequest(req, res);
  if (!user) {
    return;
  }
  const body = await parseJsonBody(req, res);
  if (!body) {
    return;
  }
  const { title, description, day } = body;
  if (!title || typeof title !== 'string') {
    return respondJson(res, 400, { error: 'Le titre est requis.' });
  }
  if (typeof day !== 'number' || day < 0 || day > 6) {
    return respondJson(res, 400, { error: 'Le jour est invalide.' });
  }

  const db = readDatabase();
  const userTasks = db.tasks.filter((task) => task.userId === user.id && task.day === day);
  const position = userTasks.length;
  const task = {
    id: crypto.randomUUID(),
    userId: user.id,
    title: title.trim(),
    description: description?.trim() || '',
    day,
    position,
    createdAt: new Date().toISOString()
  };
  db.tasks.push(task);
  writeDatabase(db);
  respondJson(res, 201, { task });
}

// Modifier une tâche
async function handleUpdateTask(req, res, taskId) {
  const user = authenticateRequest(req, res);
  if (!user) {
    return;
  }
  const body = await parseJsonBody(req, res);
  if (!body) {
    return;
  }
  const db = readDatabase();
  const task = db.tasks.find((item) => item.id === taskId && item.userId === user.id);
  if (!task) {
    return respondJson(res, 404, { error: 'Tâche introuvable.' });
  }
  if (body.title && typeof body.title === 'string') {
    task.title = body.title.trim();
  }
  if (typeof body.description === 'string') {
    task.description = body.description.trim();
  }
  if (typeof body.day === 'number' && body.day >= 0 && body.day <= 6) {
    task.day = body.day;
  }
  if (typeof body.position === 'number' && body.position >= 0) {
    task.position = body.position;
  }
  writeDatabase(db);
  respondJson(res, 200, { task });
}

// Supprimer une tâche
async function handleDeleteTask(req, res, taskId) {
  const user = authenticateRequest(req, res);
  if (!user) {
    return;
  }
  const db = readDatabase();
  const index = db.tasks.findIndex((item) => item.id === taskId && item.userId === user.id);
  if (index === -1) {
    return respondJson(res, 404, { error: 'Tâche introuvable.' });
  }
  db.tasks.splice(index, 1);
  writeDatabase(db);
  respondJson(res, 204, null);
}

// Réordonner les tâches (drag & drop)
async function handleReorderTasks(req, res) {
  const user = authenticateRequest(req, res);
  if (!user) {
    return;
  }
  const body = await parseJsonBody(req, res);
  if (!body) {
    return;
  }
  const { tasks } = body;
  if (!Array.isArray(tasks)) {
    return respondJson(res, 400, { error: 'Format de données invalide.' });
  }

  const db = readDatabase();
  const userTaskMap = new Map();
  for (const task of db.tasks) {
    if (task.userId === user.id) {
      userTaskMap.set(task.id, task);
    }
  }

  for (const update of tasks) {
    const current = userTaskMap.get(update.id);
    if (!current) {
      continue;
    }
    if (typeof update.day === 'number' && update.day >= 0 && update.day <= 6) {
      current.day = update.day;
    }
    if (typeof update.position === 'number' && update.position >= 0) {
      current.position = update.position;
    }
  }

  writeDatabase(db);
  respondJson(res, 200, { success: true });
}

// -----------------------------
// Gestion des fichiers statiques (front)
// -----------------------------
function serveStaticFile(req, res, requestUrl) {
  const safePath = path.normalize(decodeURIComponent(requestUrl.pathname));
  let filePath = path.join(CLIENT_DIR, safePath);
  if (safePath === '/' || safePath === '\\') {
    filePath = path.join(CLIENT_DIR, 'index.html');
  }

  // Empêche l’accès aux fichiers en dehors du dossier client
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Accès refusé');
    return;
  }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallback = path.join(CLIENT_DIR, 'index.html');
      fs.readFile(fallback, (fallbackErr, content) => {
        if (fallbackErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Fichier introuvable');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Erreur serveur');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

// -----------------------------
// Fonctions liées à la sécurité
// -----------------------------

// Nettoie les données utilisateur (supprime password & salt)
function sanitizeUser(user) {
  const { passwordHash, salt, ...rest } = user;
  return rest;
}

// Parse un body JSON
function parseJsonBody(req, res) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Requête trop volumineuse.' }));
        req.connection.destroy();
        resolve(null);
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(data);
        resolve(parsed);
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'JSON invalide.' }));
        resolve(null);
      }
    });
  });
}

// Hachage et vérification des mots de passe
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  const hash = crypto.pbkdf2Sync(password, user.salt, 310000, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passwordHash, 'hex'));
}

// Génération et vérification des tokens JWT
function generateToken(payload) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const body = { ...payload, exp };
  const encodedPayload = base64UrlEncode(JSON.stringify(body));
  const signature = sign(`${header}.${encodedPayload}`);
  return `${header}.${encodedPayload}.${signature}`;
}

function sign(content) {
  return crypto.createHmac('sha256', JWT_SECRET).update(content).digest('base64url');
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function authenticateRequest(req, res) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    respondJson(res, 401, { error: 'Authentification requise.' });
    return null;
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    respondJson(res, 401, { error: 'Session invalide ou expirée.' });
    return null;
  }
  const db = readDatabase();
  const user = db.users.find((item) => item.id === payload.id);
  if (!user) {
    respondJson(res, 401, { error: 'Compte introuvable.' });
    return null;
  }
  return user;
}

function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [headerB64, payloadB64, signature] = parts;
  const expectedSignature = sign(`${headerB64}.${payloadB64}`);
  if (!timingSafeCompare(signature, expectedSignature)) {
    return null;
  }
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson);
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }
    return payload;
  } catch (error) {
    return null;
  }
}

// Comparaison sécurisée pour éviter les attaques par timing
function timingSafeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Réponse JSON standardisée
function respondJson(res, statusCode, body) {
  if (body === null) {
    res.writeHead(statusCode);
    res.end();
    return;
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}