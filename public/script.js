const app = {
  // --- UI Elements ---
  authContainer: document.getElementById('auth-container'),
  loginView: document.getElementById('login-view'),
  registerView: document.getElementById('register-view'),
  dashboard: document.getElementById('dashboard'),
  dashboardMessage: document.getElementById('dashboard-message'),
  message: document.getElementById('message'),
  albumResultsContainer: document.getElementById('album-results'),
  loginForm: document.getElementById('login-form'),
  regForm: document.getElementById('reg-form'),
  searchForm: document.getElementById('search-form'),

  // --- App State ---
  token: null,
  username: null,

  // --- App Initialization ---
  init() {
    this.login = this.login.bind(this);
    this.register = this.register.bind(this);
    this.searchAlbums = this.searchAlbums.bind(this);
    this.logout = this.logout.bind(this);

    // Add event listeners
    this.loginForm.addEventListener('submit', this.login);
    this.regForm.addEventListener('submit', this.register);
    document.getElementById('logout-button').addEventListener('click', this.logout);
    this.searchForm.addEventListener('submit', this.searchAlbums);
    
    document.querySelectorAll('.toggle-form').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleView();
      });
    });

    // Re-enable the token check on application start
    this.checkForToken();
  },

  // --- Authentication (JWT) ---
  checkForToken() {
    this.token = localStorage.getItem('authToken');
    this.username = localStorage.getItem('username');
    if (this.token && this.username) {
      this.showDashboard(this.username);
    } else {
      this.showAuthForms(false);
    }
  },

  async register(event) {
    event.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;

    try {
      const response = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();

      if (response.ok) {
        this.regForm.reset();
        this.token = data.token;
        this.username = data.username;
        localStorage.setItem('authToken', this.token);
        localStorage.setItem('username', this.username);
        this.showDashboard(this.username);
      } else {
        this.displayMessage(data.message || 'Registration failed.', 'error');
      }
    } catch (error) {
      this.displayMessage('Could not connect to the server.', 'error');
    }
  },

  async login(event) {
    event.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();

      if (response.ok) {
        this.loginForm.reset();
        this.token = data.token;
        this.username = data.username;
        localStorage.setItem('authToken', this.token);
        localStorage.setItem('username', this.username);
        this.showDashboard(this.username);
      } else {
        this.displayMessage(data.message || 'Login failed.', 'error');
      }
    } catch (error) {
      this.displayMessage('Could not connect to the server.', 'error');
    }
  },

  logout() {
    this.token = null;
    this.username = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    this.showAuthForms(true);
  },

  // --- API Interaction ---
  async searchAlbums(event) {
    event.preventDefault();

    const query = document.getElementById('search-query').value;
    this.albumResultsContainer.innerHTML = '<div class="loading">Searching...</div>';

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });
      const data = await response.json();

      if (response.ok) {
        this.displayAlbums(data);
      } else {
        this.albumResultsContainer.innerHTML = `<div class="error">${data.message || 'Search failed.'}</div>`;
        if (response.status === 401 || response.status === 403) {
          this.logout();
          this.displayMessage('Your session has expired. Please log in again.', 'error');
        }
      }
    } catch (error) {
      this.albumResultsContainer.innerHTML = '<div class="error">Could not connect to the server.</div>';
    }
  },

  // --- UI Updates ---
  displayAlbums(albums) {
    this.albumResultsContainer.innerHTML = '';
    if (!albums || albums.length === 0) {
      this.albumResultsContainer.innerHTML = '<div class="no-results">No albums found.</div>';
      return;
    }

    albums.forEach(album => {
      const albumCard = document.createElement('div');
      albumCard.className = 'album-card';
      albumCard.innerHTML = `
        <img src="${album.coverImage || ''}" alt="${album.name} cover">
        <div class="album-info">
          <h3>${album.name}</h3>
          <p>${album.artist}</p>
        </div>
      `;
      this.albumResultsContainer.appendChild(albumCard);
    });
  },

  showDashboard(username) {
    this.authContainer.style.display = 'none';
    this.dashboard.style.display = 'block';
    this.dashboardMessage.textContent = `Welcome, ${username}!`;
    this.displayMessage('');
  },

  showAuthForms(showLogoutMessage) {
    this.dashboard.style.display = 'none';
    this.authContainer.style.display = 'block';
    this.loginView.style.display = 'block';
    this.registerView.style.display = 'none';
    this.albumResultsContainer.innerHTML = '';
    if (showLogoutMessage) {
      this.displayMessage('You have been logged out successfully.', 'success');
    } else {
      this.displayMessage('');
    }
  },

  toggleView() {
    this.loginView.style.display = this.loginView.style.display === 'none' ? 'block' : 'none';
    this.registerView.style.display = this.registerView.style.display === 'none' ? 'block' : 'none';
    this.displayMessage('');
  },

  displayMessage(text, type = 'message') {
    this.message.textContent = text;
    this.message.className = type;
  }
};

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => app.init());
