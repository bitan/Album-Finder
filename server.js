const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const axios = require('axios');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

const app = express();

// --- Firebase Admin SDK ---
const serviceAccount = require('./firebase-service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firestoreDb = admin.firestore();


// --- Configuration ---
const JWT_SECRET = 'your-super-secret-key-that-should-be-in-an-env-file';

// --- User Database Setup (using lowdb) ---
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ users: [] }).write();

// --- Middleware Setup ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Spotify API ---
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
let spotifyToken = null;

async function getSpotifyToken() {
  if (spotifyToken && spotifyToken.expiration > Date.now()) {
    return spotifyToken.access_token;
  }
  if (!spotifyClientId || !spotifyClientSecret) {
    console.error("Spotify API credentials are not set.");
    return null;
  }
  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', 'grant_type=client_credentials', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + (Buffer.from(spotifyClientId + ':' + spotifyClientSecret).toString('base64'))
      }
    });
    const token = response.data;
    spotifyToken = { access_token: token.access_token, expiration: Date.now() + (token.expires_in * 1000) };
    console.log('Successfully obtained new Spotify token.');
    return spotifyToken.access_token;
  } catch (error) {
    console.error('Error getting Spotify token:', error.response ? error.response.data : error.message);
    return null;
  }
}

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
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required.' });
  }
  if (db.get('users').find({ username }).value()) {
    return res.status(409).json({ message: 'Username already exists.' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now().toString(), username, password: hashedPassword };
    db.get('users').push(newUser).write();
    const userPayload = { id: newUser.id, username: newUser.username };
    const accessToken = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token: accessToken, username: newUser.username });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.get('users').find({ username }).value();
  if (user && await bcrypt.compare(password, user.password)) {
    const userPayload = { id: user.id, username: user.username };
    const accessToken = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });
    res.status(200).json({ token: accessToken, username: user.username });
  } else {
    res.status(401).json({ message: 'Invalid username or password.' });
  }
});

app.get('/api/search', authenticateToken, async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ message: 'Search query required.' });
  }
  const token = await getSpotifyToken();
  if (!token) {
    return res.status(503).json({ message: 'Could not connect to Spotify.' });
  }
  try {
    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: { 'Authorization': `Bearer ${token}` },
      params: { q, type: 'album', limit: 12 }
    });
    const albums = response.data.albums.items.map(item => ({
      id: item.id,
      name: item.name,
      artist: item.artists.map(a => a.name).join(', '),
      coverImage: item.images.length ? item.images[0].url : ''
    }));
    res.status(200).json(albums);
  } catch (error) {
    console.error('Spotify Search Error:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    res.status(500).json({ message: 'Error during search. Check server logs for details.' });
  }
});

app.post('/api/favorites', authenticateToken, async (req, res) => {
    const { albumId, name, artist, coverImage } = req.body;
    const userId = req.user.id; 

    if (!albumId || !name || !artist) {
        return res.status(400).json({ message: 'Missing album information.' });
    }

    try {
        const favorite = {
            userId: userId,
            albumId: albumId,
            name: name,
            artist: artist,
            coverImage: coverImage,
            savedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await firestoreDb.collection('favorites').add(favorite);
        res.status(201).json({ message: 'Album saved to favorites!', id: docRef.id });

    } catch (error) {
        console.error('Error saving to Firestore:', error);
        res.status(500).json({ message: 'Server error while saving favorite.' });
    }
});

app.get('/api/favorites', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const snapshot = await firestoreDb.collection('favorites').where('userId', '==', userId).orderBy('savedAt', 'desc').get();
        if (snapshot.empty) {
            return res.status(200).json([]);
        }

        const favorites = [];
        snapshot.forEach(doc => {
            favorites.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).json(favorites);
    } catch (error) {
        console.error('Error fetching favorites:', error);
        res.status(500).json({ message: 'Server error while fetching favorites.' });
    }
});

app.get('/api/album/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const token = await getSpotifyToken();
  if (!token) {
    return res.status(503).json({ message: 'Could not connect to Spotify.' });
  }

  try {
    const response = await axios.get(`https://api.spotify.com/v1/albums/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const album = response.data;
    const albumDetails = {
      id: album.id,
      name: album.name,
      artist: album.artists.map(a => a.name).join(', '),
      coverImage: album.images.length ? album.images[0].url : '',
      releaseDate: album.release_date,
      popularity: album.popularity,
      totalTracks: album.total_tracks,
      tracks: album.tracks.items.map(track => ({ name: track.name, duration: track.duration_ms, track_number: track.track_number }))
    };

    res.status(200).json(albumDetails);
  } catch (error) {
    console.error(`Error fetching album details for ${id}:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    res.status(500).json({ message: 'Error fetching album details.' });
  }
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  getSpotifyToken();
});
