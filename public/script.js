
const app = {
  // --- UI Elements ---
  authContainer: document.getElementById('auth-container'),
  loginView: document.getElementById('login-view'),
  registerView: document.getElementById('register-view'),
  dashboard: document.getElementById('dashboard'),
  message: document.getElementById('message'),
  albumResultsContainer: document.getElementById('album-results'),
  loginForm: document.getElementById('login-form'),
  regForm: document.getElementById('reg-form'),
  searchForm: document.getElementById('search-form'),
  modal: document.getElementById('album-modal'),
  modalBody: document.getElementById('modal-body'),
  closeButton: document.querySelector('.close-button'),
  loginCtaBtn: document.getElementById('login-cta-btn'),
  signupCtaBtn: document.getElementById('signup-cta-btn'),
  logoutButton: document.getElementById('logout-button'),
  closeAuthModalBtn: document.querySelector('.close-auth-modal'),

  // --- App State ---
  token: null,
  username: null,

  // --- App Initialization ---
  init() {
    this.login = this.login.bind(this);
    this.register = this.register.bind(this);
    this.searchAlbums = this.searchAlbums.bind(this);
    this.logout = this.logout.bind(this);
    this.saveFavorite = this.saveFavorite.bind(this);
    this.openModal = this.openModal.bind(this);
    this.closeModal = this.closeModal.bind(this);

    // Event Listeners
    this.loginForm.addEventListener('submit', this.login);
    this.regForm.addEventListener('submit', this.register);
    this.searchForm.addEventListener('submit', this.searchAlbums);
    this.logoutButton.addEventListener('click', this.logout);
    this.loginCtaBtn.addEventListener('click', () => this.showAuthForms(true));
    this.signupCtaBtn.addEventListener('click', () => this.showAuthForms(false));
    this.closeAuthModalBtn.addEventListener('click', () => this.hideAuthForms());
    this.authContainer.addEventListener('click', (e) => {
        if (e.target === this.authContainer) this.hideAuthForms();
    });
    this.closeButton.addEventListener('click', this.closeModal);
    window.addEventListener('click', (event) => {
      if (event.target == this.modal) this.closeModal();
    });
    document.querySelectorAll('.toggle-form').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleView();
      });
    });

    this.checkForToken();
  },

  // --- Authentication (JWT) ---
  checkForToken() {
    this.token = localStorage.getItem('authToken');
    this.username = localStorage.getItem('username');
    if (this.token && this.username) {
      this.showDashboard();
    } else {
      this.showLandingView();
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
        this.showDashboard();
        this.hideAuthForms();
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
        this.showDashboard();
        this.hideAuthForms();
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
    this.showLandingView();
  },

  // --- API Interaction ---
   async searchAlbums(event) {
    event.preventDefault();
    const query = document.getElementById('search-query').value;
    this.albumResultsContainer.innerHTML = '<div class="loading">Searching...</div>';

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const data = await response.json();

      if (response.ok) {
        this.displayAlbums(data);
      } else {
        this.albumResultsContainer.innerHTML = `<div class="error">${data.message || 'Search failed.'}</div>`;
        if (response.status === 401 || response.status === 403) {
          this.logout();
        }
      }
    } catch (error) {
      this.albumResultsContainer.innerHTML = '<div class="error">Could not connect to the server.</div>';
    }
  },
  
  async saveFavorite(event) {
    event.stopPropagation();
    const button = event.target;
    const albumData = {
        albumId: button.dataset.albumId,
        name: button.dataset.name,
        artist: button.dataset.artist,
        coverImage: button.dataset.coverImage,
    };

    button.disabled = true;
    button.textContent = 'Saving...';

    try {
        const response = await fetch('/api/favorites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify(albumData)
        });
        if (response.ok) {
            button.textContent = 'Saved!';
        } else {
            const data = await response.json();
            this.displayMessage(data.message || 'Could not save album.', 'error');
            button.disabled = false;
            button.textContent = 'Save';
        }
    } catch (error) {
        this.displayMessage('Could not connect to the server.', 'error');
        button.disabled = false;
        button.textContent = 'Save';
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
        <button class="save-btn" 
                data-album-id="${album.id}" 
                data-name="${album.name}" 
                data-artist="${album.artist}" 
                data-cover-image="${album.coverImage}">
          Save
        </button>
      `;
      albumCard.addEventListener('click', (e) => {
          if (!e.target.classList.contains('save-btn')) {
              this.openModal(album.id)
          }
      });
      this.albumResultsContainer.appendChild(albumCard);
    });
    
    this.albumResultsContainer.querySelectorAll('.save-btn').forEach(button => {
        button.addEventListener('click', this.saveFavorite);
    });
  },

  async openModal(albumId) {
    this.modal.style.display = 'flex';
    this.modalBody.innerHTML = '<div class="loading">Loading details...</div>';

    try {
      const response = await fetch(`/api/album/${albumId}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      const album = await response.json();

      if (response.ok) {
        this.modalBody.innerHTML = `
           <div class="album-art-container">
            <img src="${album.coverImage}" alt="${album.name} cover">
            <div class="vinyl-disc"></div>
          </div>
          <div>
            <h2>${album.name}</h2>
            <p class="artist-name">${album.artist}</p>
            <div class="stats-container">
              <div class="stat-card">
                <p class="stat-title">Total Tracks</p>
                <p class="stat-value">${album.totalTracks}</p>
              </div>
              <div class="stat-card">
                <p class="stat-title">Popularity</p>
                <p class="stat-value">${album.popularity}%</p>
              </div>
            </div>
            <div class="track-list-container">
              <h3>Tracklist</h3>
              <ul class="track-list">
                ${album.tracks.map(track => `
                  <li>
                    <span class="track-number">${String(track.track_number).padStart(2, '0')}</span>
                    <span class="track-name">${track.name}</span>
                    <span class="track-duration">${this.formatDuration(track.duration_ms)}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          </div>
        `;
      } else {
        this.modalBody.innerHTML = `<div class="error">${album.message || 'Could not load album details.'}</div>`;
      }
    } catch (error) {
      this.modalBody.innerHTML = '<div class="error">Could not connect to the server.</div>';
    }
  },

  closeModal() {
    this.modal.style.display = 'none';
  },
  
  formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
  },

  showDashboard() {
    this.dashboard.style.display = 'block';
    this.loginCtaBtn.style.display = 'none';
    this.signupCtaBtn.style.display = 'none';
    this.logoutButton.style.display = 'block';
  },

  showLandingView() {
    this.dashboard.style.display = 'none';
    this.loginCtaBtn.style.display = 'block';
    this.signupCtaBtn.style.display = 'block';
    this.logoutButton.style.display = 'none';
  },

  showAuthForms(isLogin) {
    this.authContainer.style.display = 'flex';
    if (isLogin) {
        this.loginView.style.display = 'block';
        this.registerView.style.display = 'none';
    } else {
        this.loginView.style.display = 'none';
        this.registerView.style.display = 'block';
    }
    this.displayMessage('');
  },

  hideAuthForms() {
    this.authContainer.style.display = 'none';
  },

  toggleView() {
    const isLoginVisible = this.loginView.style.display === 'block';
    this.loginView.style.display = isLoginVisible ? 'none' : 'block';
    this.registerView.style.display = isLoginVisible ? 'block' : 'none';
    this.displayMessage('');
  },

  displayMessage(text, type = 'message') {
    this.message.textContent = text;
    this.message.className = `message ${type}`;
  }
};

// Initialize the app when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => app.init());
