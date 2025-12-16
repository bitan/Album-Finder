
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();

// In-memory user store (for demonstration purposes)
const users = [];

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'your_secret_key', // Replace with a real secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware to protect routes
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).send('You are not authorized to view this page.');
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// User registration
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ id: Date.now().toString(), username, password: hashedPassword });
    res.status(201).send('User registered successfully.');
  } catch {
    res.status(500).send('Error registering user.');
  }
});

// User login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  if (user && await bcrypt.compare(password, user.password)) {
    req.session.userId = user.id;
    res.send('Logged in successfully.');
  } else {
    res.status(400).send('Invalid username or password.');
  }
});

// User logout
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Failed to log out.');
    }
    res.send('Logged out successfully.');
  });
});

// Protected route example
app.get('/dashboard', isAuthenticated, (req, res) => {
  res.send(`Welcome, user! This is your dashboard.`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
