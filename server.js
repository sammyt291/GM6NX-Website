const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const https = require('https');
const http = require('http');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SSL_PORT = Number(process.env.SSL_PORT || 3443);
const SSL_KEY = process.env.SSL_KEY;
const SSL_CERT = process.env.SSL_CERT;
const SESSION_SECRET = process.env.SESSION_SECRET || 'gm6nx-session-secret';

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PAGES_FILE = path.join(DATA_DIR, 'pages.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
      cb(null, `${Date.now()}-${safeName}`);
    },
  }),
});

async function ensureDataFiles() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });

  try {
    await fsp.access(USERS_FILE);
  } catch {
    const passwordHash = await bcrypt.hash('gm6nx!$', 10);
    const defaultUsers = [{ username: 'gm6nx', passwordHash }];
    await fsp.writeFile(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
  }

  try {
    await fsp.access(PAGES_FILE);
  } catch {
    const defaultPages = {
      items: [
        {
          id: 'home',
          type: 'page',
          title: 'Home',
          slug: 'home',
          content: '<h1>Welcome to GM6NX</h1><p>Edit this page in the editor.</p>',
          children: [],
        },
      ],
    };
    await fsp.writeFile(PAGES_FILE, JSON.stringify(defaultPages, null, 2));
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2));
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

app.get('/api/session', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }
  const users = await readJson(USERS_FILE, []);
  const user = users.find((u) => u.username === username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.user = { username: user.username };
  return res.json({ user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admins', requireAuth, async (req, res) => {
  const users = await readJson(USERS_FILE, []);
  res.json({ users: users.map((u) => ({ username: u.username })) });
});

app.post('/api/admins', requireAuth, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }
  const users = await readJson(USERS_FILE, []);
  if (users.some((u) => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  users.push({ username, passwordHash });
  await writeJson(USERS_FILE, users);
  res.json({ ok: true });
});

app.put('/api/admins/:username', requireAuth, async (req, res) => {
  const { password } = req.body;
  const username = req.params.username;
  if (!password) {
    return res.status(400).json({ error: 'Missing password' });
  }
  const users = await readJson(USERS_FILE, []);
  const user = users.find((u) => u.username === username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  user.passwordHash = await bcrypt.hash(password, 10);
  await writeJson(USERS_FILE, users);
  res.json({ ok: true });
});

app.delete('/api/admins/:username', requireAuth, async (req, res) => {
  const username = req.params.username;
  const users = await readJson(USERS_FILE, []);
  const filtered = users.filter((u) => u.username !== username);
  if (filtered.length === users.length) {
    return res.status(404).json({ error: 'User not found' });
  }
  await writeJson(USERS_FILE, filtered);
  res.json({ ok: true });
});

app.get('/api/nav', async (req, res) => {
  const pages = await readJson(PAGES_FILE, { items: [] });
  res.json({ items: pages.items || [] });
});

app.put('/api/nav', requireAuth, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Invalid nav items' });
  }
  const pages = await readJson(PAGES_FILE, { items: [] });
  pages.items = items;
  await writeJson(PAGES_FILE, pages);
  res.json({ ok: true });
});

app.get('/api/pages/:slug', async (req, res) => {
  const pages = await readJson(PAGES_FILE, { items: [] });
  const findPage = (items) => {
    for (const item of items) {
      if (item.type === 'page' && item.slug === req.params.slug) return item;
      if (item.children?.length) {
        const found = findPage(item.children);
        if (found) return found;
      }
    }
    return null;
  };
  const page = findPage(pages.items || []);
  if (!page) {
    return res.status(404).json({ error: 'Page not found' });
  }
  res.json({ page });
});

app.post('/api/pages', requireAuth, async (req, res) => {
  const { title, slug, content } = req.body;
  if (!title || !slug) {
    return res.status(400).json({ error: 'Missing title or slug' });
  }
  const pages = await readJson(PAGES_FILE, { items: [] });
  const exists = JSON.stringify(pages.items).includes(`"slug":"${slug}"`);
  if (exists) {
    return res.status(409).json({ error: 'Slug already exists' });
  }
  pages.items.push({
    id: slug,
    type: 'page',
    title,
    slug,
    content: content || '',
    children: [],
  });
  await writeJson(PAGES_FILE, pages);
  res.json({ ok: true });
});

app.put('/api/pages/:slug', requireAuth, async (req, res) => {
  const { title, content } = req.body;
  const pages = await readJson(PAGES_FILE, { items: [] });
  const updatePage = (items) => {
    for (const item of items) {
      if (item.type === 'page' && item.slug === req.params.slug) {
        if (title) item.title = title;
        if (typeof content === 'string') item.content = content;
        return true;
      }
      if (item.children?.length && updatePage(item.children)) return true;
    }
    return false;
  };
  const updated = updatePage(pages.items);
  if (!updated) {
    return res.status(404).json({ error: 'Page not found' });
  }
  await writeJson(PAGES_FILE, pages);
  res.json({ ok: true });
});

app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

function startHttpServer() {
  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
  });
}

function startHttpsServer() {
  if (!SSL_KEY || !SSL_CERT) {
    return null;
  }
  let httpsServer = null;

  const createServer = () => {
    const key = fs.readFileSync(SSL_KEY);
    const cert = fs.readFileSync(SSL_CERT);
    const server = https.createServer({ key, cert }, app);
    server.listen(SSL_PORT, () => {
      console.log(`HTTPS server listening on port ${SSL_PORT}`);
    });
    return server;
  };

  try {
    httpsServer = createServer();
  } catch (error) {
    console.error('Failed to start HTTPS server:', error.message);
    return null;
  }

  const restart = () => {
    if (httpsServer) {
      httpsServer.close(() => {
        console.log('HTTPS server restarting after certificate change...');
        try {
          httpsServer = createServer();
        } catch (error) {
          console.error('Failed to restart HTTPS server:', error.message);
        }
      });
    }
  };

  fs.watchFile(SSL_KEY, { interval: 1000 }, restart);
  fs.watchFile(SSL_CERT, { interval: 1000 }, restart);

  return httpsServer;
}

ensureDataFiles().then(() => {
  startHttpServer();
  startHttpsServer();
});
