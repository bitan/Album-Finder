require('dotenv').config();

// --- Environment Validation (must run before anything else) ---
// GOOGLE_APPLICATION_CREDENTIALS is only required in local dev mode
// (when FIREBASE_SERVICE_ACCOUNT_JSON is not set)
const REQUIRED_ENV = ['JWT_SECRET'];
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  REQUIRED_ENV.push('GOOGLE_APPLICATION_CREDENTIALS');
}
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length) {
  missingEnv.forEach(k => console.error(`Missing required environment variable: ${k}`));
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}

const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const rateLimit = require('express-rate-limit');

const app = express();

// --- Rate Limiters ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // max 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in 15 minutes.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' }
});

// --- Firebase Admin SDK ---
// Supports both file path (local dev) and inline JSON (production/cloud deploy)
let firebaseCredential;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    firebaseCredential = admin.credential.cert(serviceAccount);
  } catch (e) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
    process.exit(1);
  }
} else {
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS file path for local dev
  firebaseCredential = admin.credential.applicationDefault();
}

admin.initializeApp({ credential: firebaseCredential });

const firestoreDb = admin.firestore();

// --- Configuration ---
const JWT_SECRET = process.env.JWT_SECRET;

// --- Middleware Setup ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// --- iTunes Search API ---
// No credentials needed — iTunes API is free and open.

app.get('/api/search', apiLimiter, authenticateToken, async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ message: 'Search query required.' });
  }
  try {
    const response = await axios.get('https://itunes.apple.com/search', {
      params: {
        term: q,
        media: 'music',
        entity: 'album',
        limit: 12
      }
    });

    const albums = response.data.results.map(item => ({
      id: String(item.collectionId),
      name: item.collectionName,
      artist: item.artistName,
      coverImage: item.artworkUrl100
        ? item.artworkUrl100.replace('100x100bb', '600x600bb')
        : ''
    }));

    res.status(200).json(albums);
  } catch (error) {
    console.error('iTunes Search Error:', error.message);
    res.status(500).json({ message: 'Error during search. Check server logs for details.' });
  }
});

app.get('/api/album/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    // Fetch album info + tracks in parallel
    const [albumRes, tracksRes] = await Promise.all([
      axios.get('https://itunes.apple.com/lookup', {
        params: { id, entity: 'album' }
      }),
      axios.get('https://itunes.apple.com/lookup', {
        params: { id, entity: 'song' }
      })
    ]);

    const albumInfo = albumRes.data.results.find(r => r.wrapperType === 'collection');
    if (!albumInfo) {
      return res.status(404).json({ message: 'Album not found.' });
    }

    const tracks = tracksRes.data.results
      .filter(r => r.wrapperType === 'track')
      .map((track, idx) => ({
        name: track.trackName,
        duration_ms: track.trackTimeMillis || 0,
        track_number: track.trackNumber || idx + 1
      }));

    const albumDetails = {
      id: String(albumInfo.collectionId),
      name: albumInfo.collectionName,
      artist: albumInfo.artistName,
      coverImage: albumInfo.artworkUrl100
        ? albumInfo.artworkUrl100.replace('100x100bb', '600x600bb')
        : '',
      releaseDate: albumInfo.releaseDate
        ? albumInfo.releaseDate.split('T')[0]
        : '',
      popularity: null,
      totalTracks: albumInfo.trackCount || tracks.length,
      tracks
    };

    res.status(200).json(albumDetails);
  } catch (error) {
    console.error(`iTunes album lookup error for ${id}:`, error.message);
    res.status(500).json({ message: 'Error fetching album details.' });
  }
});

// --- JWT Authentication Middleware ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// --- Routes ---
app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/register', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required.' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ message: 'Username must be between 3 and 30 characters.' });
  }
  if (password.length < 6 || password.length > 72) {
    return res.status(400).json({ message: 'Password must be between 6 and 72 characters.' });
  }
  try {
    // Check for existing username in Firestore
    const existing = await firestoreDb.collection('users').where('username', '==', username).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ message: 'Username already exists.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const docRef = await firestoreDb.collection('users').add({
      username,
      password: hashedPassword,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    // Use Firestore doc ID as the user id
    await docRef.update({ id: docRef.id });
    const userPayload = { id: docRef.id, username };
    const accessToken = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token: accessToken, username });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Database error. Please try again.' });
  }
});

app.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  try {
    const snapshot = await firestoreDb.collection('users').where('username', '==', username).limit(1).get();
    if (snapshot.empty) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }
    const userDoc = snapshot.docs[0];
    const user = userDoc.data();
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }
    const userPayload = { id: userDoc.id, username: user.username };
    const accessToken = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });
    res.status(200).json({ token: accessToken, username: user.username });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Database error. Please try again.' });
  }
});



// --- Journal API ---

app.post('/api/journal', authenticateToken, async (req, res) => {
  const { albumId, albumName, artist, coverImage, rating, review, listenedDate } = req.body;
  const userId = req.user.id;

  // Validate required fields
  if (!albumId || !albumName || !artist || !rating || !listenedDate) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }
  const ratingNum = parseInt(rating, 10);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ message: 'Rating must be an integer between 1 and 5.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(listenedDate) || isNaN(new Date(listenedDate).getTime())) {
    return res.status(400).json({ message: 'listenedDate must be a valid YYYY-MM-DD date.' });
  }
  if (review && review.length > 2000) {
    return res.status(400).json({ message: 'Review must be 2000 characters or fewer.' });
  }

  try {
    // Duplicate check
    const duplicate = await firestoreDb.collection('journal')
      .where('userId', '==', userId)
      .where('albumId', '==', albumId)
      .limit(1)
      .get();
    if (!duplicate.empty) {
      return res.status(409).json({
        message: 'You have already logged this album.',
        entryId: duplicate.docs[0].id
      });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = await firestoreDb.collection('journal').add({
      userId,
      albumId,
      albumName,
      artist,
      coverImage: coverImage || '',
      rating: ratingNum,
      review: review || '',
      listenedDate,
      createdAt: now,
      updatedAt: now
    });

    res.status(201).json({ entryId: docRef.id, message: 'Entry saved.' });
  } catch (error) {
    console.error('Error creating journal entry:', error);
    res.status(500).json({ message: 'Database error. Please try again.' });
  }
});

app.get('/api/journal', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const snapshot = await firestoreDb.collection('journal')
      .where('userId', '==', userId)
      .orderBy('listenedDate', 'desc')
      .get();

    const entries = [];
    snapshot.forEach(doc => {
      entries.push({ entryId: doc.id, ...doc.data() });
    });

    res.status(200).json(entries);
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    res.status(500).json({ message: 'Database error. Please try again.' });
  }
});

app.patch('/api/journal/:entryId', authenticateToken, async (req, res) => {
  const { entryId } = req.params;
  const userId = req.user.id;
  const { rating, review, listenedDate } = req.body;

  if (rating === undefined && review === undefined && listenedDate === undefined) {
    return res.status(400).json({ message: 'At least one field (rating, review, listenedDate) must be provided.' });
  }

  try {
    const docRef = firestoreDb.collection('journal').doc(entryId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'Entry not found.' });
    }
    if (doc.data().userId !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (rating !== undefined) {
      const ratingNum = parseInt(rating, 10);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({ message: 'Rating must be an integer between 1 and 5.' });
      }
      updates.rating = ratingNum;
    }
    if (review !== undefined) updates.review = review;
    if (listenedDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(listenedDate) || isNaN(new Date(listenedDate).getTime())) {
        return res.status(400).json({ message: 'listenedDate must be a valid YYYY-MM-DD date.' });
      }
      updates.listenedDate = listenedDate;
    }
    if (review !== undefined && review.length > 2000) {
      return res.status(400).json({ message: 'Review must be 2000 characters or fewer.' });
    }

    await docRef.update(updates);
    res.status(200).json({ message: 'Entry updated.' });
  } catch (error) {
    console.error('Error updating journal entry:', error);
    res.status(500).json({ message: 'Database error. Please try again.' });
  }
});

app.delete('/api/journal/:entryId', authenticateToken, async (req, res) => {
  const { entryId } = req.params;
  const userId = req.user.id;

  try {
    const docRef = firestoreDb.collection('journal').doc(entryId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'Entry not found.' });
    }
    if (doc.data().userId !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await docRef.delete();
    res.status(200).json({ message: 'Entry deleted.' });
  } catch (error) {
    console.error('Error deleting journal entry:', error);
    res.status(500).json({ message: 'Database error. Please try again.' });
  }
});

// --- 404 Handler ---
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// --- Server Startup ---
function getPort() {
  const portArg = process.argv.indexOf('--port');
  if (portArg !== -1 && process.argv[portArg + 1]) {
    return parseInt(process.argv[portArg + 1], 10);
  }
  return process.env.PORT || 3000;
}

const PORT = getPort();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
