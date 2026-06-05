// --- XSS Sanitizer ---
function sanitize(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
  myJournalLink: document.getElementById('my-journal-link'),
  closeAuthModalBtn: document.querySelector('.close-auth-modal'),

  // Journal modal elements (populated in init after DOM is ready)
  journalModal: null,
  jmAlbumName: null,
  jmArtistName: null,
  jmStars: null,
  jmReview: null,
  jmDate: null,
  jmSubmit: null,
  jmMessage: null,
  jmAlbumId: null,
  jmCoverImage: null,
  jmEntryId: null,
  jmRatingError: null,
  jmDateError: null,
  jmReviewError: null,

  // --- App State ---
  token: null,
  username: null,
  selectedRating: 0,

  // --- App Initialization ---
  init() {
    this.login = this.login.bind(this);
    this.register = this.register.bind(this);
    this.searchAlbums = this.searchAlbums.bind(this);
    this.logout = this.logout.bind(this);
    this.openModal = this.openModal.bind(this);
    this.closeModal = this.closeModal.bind(this);
    this.submitJournalForm = this.submitJournalForm.bind(this);
    this.closeJournalModal = this.closeJournalModal.bind(this);

    // Journal modal elements
    this.journalModal = document.getElementById('journal-modal');
    this.jmAlbumName = document.getElementById('jm-album-name');
    this.jmArtistName = document.getElementById('jm-artist-name');
    this.jmStars = document.getElementById('jm-stars');
    this.jmReview = document.getElementById('jm-review');
    this.jmDate = document.getElementById('jm-date');
    this.jmSubmit = document.getElementById('jm-submit');
    this.jmMessage = document.getElementById('jm-message');
    this.jmAlbumId = document.getElementById('jm-album-id');
    this.jmCoverImage = document.getElementById('jm-cover-image');
    this.jmEntryId = document.getElementById('jm-entry-id');
    this.jmRatingError = document.getElementById('jm-rating-error');
    this.jmDateError = document.getElementById('jm-date-error');
    this.jmReviewError = document.getElementById('jm-review-error');

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
      if (event.target === this.modal) this.closeModal();
      if (event.target === this.journalModal) this.closeJournalModal();
    });
    document.querySelectorAll('.toggle-form').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleView();
      });
    });

    // Journal modal listeners
    document.querySelector('.close-journal-modal').addEventListener('click', this.closeJournalModal);
    this.jmSubmit.addEventListener('click', this.submitJournalForm);

    // Password visibility toggles
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '🙈';
      });
    });

    // Landing page buttons
    const landingSignup = document.getElementById('landing-signup-btn');
    if (landingSignup) landingSignup.addEventListener('click', () => this.showAuthForms(false));
    // login-cta-btn and signup-cta-btn already wired above

    // Mobile: back button closes the slide-over right panel
    const backBtn = document.getElementById('ds-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        const rightPanel = document.getElementById('ds-right-panel');
        if (rightPanel) rightPanel.classList.remove('mobile-open');
      });
    }

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
    const btn = document.getElementById('reg-submit-btn');
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-spinner').style.display = 'inline';
    btn.disabled = true;
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
    } finally {
      btn.querySelector('.btn-text').style.display = 'inline';
      btn.querySelector('.btn-spinner').style.display = 'none';
      btn.disabled = false;
    }
  },

  async login(event) {
    event.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-submit-btn');
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-spinner').style.display = 'inline';
    btn.disabled = true;
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
    } finally {
      btn.querySelector('.btn-text').style.display = 'inline';
      btn.querySelector('.btn-spinner').style.display = 'none';
      btn.disabled = false;
    }
  },

  logout() {
    this.token = null;
    this.username = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    this.showLandingView();
  },

  // --- Album Search ---
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
        this.albumResultsContainer.innerHTML = `<div class="error">${sanitize(data.message) || 'Search failed.'}</div>`;
        if (response.status === 401 || response.status === 403) {
          this.logout();
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
      this.albumResultsContainer.innerHTML = '<div class="ds-empty"><p>No albums found</p></div>';
      return;
    }

    albums.forEach((album, idx) => {
      const row = document.createElement('div');
      row.className = 'ds-track-row';
      row.innerHTML = `
        <span class="ds-track-num">${String(idx + 1).padStart(2, '0')}</span>
        <img class="ds-track-ico" src="${sanitize(album.coverImage)}" alt="">
        <div class="ds-track-info">
          <p class="ds-track-name">${sanitize(album.name)}</p>
          <small>${sanitize(album.artist)}</small>
        </div>
        <span class="ds-track-year">${album.releaseDate ? sanitize(String(album.releaseDate).slice(0,4)) : ''}</span>
      `;
      row.addEventListener('click', () => {
        document.querySelectorAll('.ds-track-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        const vinyl = document.getElementById('ds-vinyl');
        if (vinyl) { vinyl.classList.remove('spinning'); void vinyl.offsetWidth; vinyl.classList.add('spinning'); }
        const np = document.getElementById('ds-now-playing');
        if (np) np.textContent = `${album.name} — ${album.artist}`;
        this.showRightPanel(album);
      });
      this.albumResultsContainer.appendChild(row);
    });
  },

  showRightPanel(album) {
    const empty = document.getElementById('ds-right-empty');
    const detail = document.getElementById('ds-album-detail');
    if (empty) empty.style.display = 'none';
    if (detail) detail.style.display = 'flex';

    const coverA = document.getElementById('ds-cover-a');
    const coverB = document.getElementById('ds-cover-b');
    if (coverA) coverA.style.background = `url('${album.coverImage}') center/cover`;
    if (coverB) coverB.style.background = `url('${album.coverImage}') center/cover, linear-gradient(135deg,#f3e8d0,#d9c8a8)`;

    const artistEl = document.getElementById('ds-detail-artist');
    const titleEl  = document.getElementById('ds-detail-title-el');
    const yearEl   = document.getElementById('ds-detail-year');
    const descEl   = document.getElementById('ds-detail-desc');

    if (artistEl) artistEl.textContent = album.artist.toUpperCase();
    if (titleEl) {
      const firstText = titleEl.childNodes[0];
      if (firstText) firstText.textContent = `Album: ${album.name} `;
    }
    if (yearEl) yearEl.textContent = album.releaseDate ? album.releaseDate.slice(0,4) : '';
    if (descEl) descEl.textContent = `${album.name} by ${album.artist}.${album.releaseDate ? ' Released ' + album.releaseDate.slice(0,4) + '.' : ''} Click "Add to Journal" to log your listen and write a personal review.`;

    const journalBtn = document.getElementById('ds-journal-btn');
    const tracksBtn  = document.getElementById('ds-tracks-btn');
    const heartBtn   = document.getElementById('ds-heart-btn');
    const handler = () => this.openJournalModal({ id: album.id, name: album.name, artist: album.artist, coverImage: album.coverImage });
    if (journalBtn) journalBtn.onclick = handler;
    if (heartBtn)   heartBtn.onclick = handler;
    if (tracksBtn)  tracksBtn.onclick = () => this.openModal(album.id);

    // On mobile: slide up the right panel
    const rightPanel = document.getElementById('ds-right-panel');
    if (rightPanel && window.innerWidth <= 768) {
      rightPanel.classList.add('mobile-open');
    }
  },

  // --- Album Detail Modal ---
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
            <img src="${sanitize(album.coverImage)}" alt="${sanitize(album.name)} cover">
            <div class="vinyl-disc"></div>
          </div>
          <div>
            <h2>${sanitize(album.name)}</h2>
            <p class="artist-name">${sanitize(album.artist)}</p>
            <div class="stats-container">
              <div class="stat-card">
                <p class="stat-title">Total Tracks</p>
                <p class="stat-value">${sanitize(String(album.totalTracks))}</p>
              </div>
              <div class="stat-card">
                <p class="stat-title">Released</p>
                <p class="stat-value" style="font-size:1.4rem;">${sanitize(album.releaseDate || '—')}</p>
              </div>
            </div>
            <div class="track-list-container">
              <h3>Tracklist</h3>
              <ul class="track-list">
                ${album.tracks.map(track => `
                  <li>
                    <span class="track-number">${String(track.track_number).padStart(2, '0')}</span>
                    <span class="track-name">${sanitize(track.name)}</span>
                    <span class="track-duration">${this.formatDuration(track.duration_ms)}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          </div>
        `;
      } else {
        this.modalBody.innerHTML = `<div class="error">${sanitize(album.message) || 'Could not load album details.'}</div>`;
      }
    } catch (error) {
      this.modalBody.innerHTML = '<div class="error">Could not connect to the server.</div>';
    }
  },

  closeModal() {
    this.modal.style.display = 'none';
  },

  // --- Journal Modal ---
  openJournalModal(album) {
    this.jmAlbumName.textContent = album.name;
    this.jmArtistName.textContent = album.artist;
    this.jmAlbumId.value = album.id;
    this.jmCoverImage.value = album.coverImage || '';
    this.jmEntryId.value = '';

    // Show cover art preview
    const preview = document.getElementById('jm-cover-preview');
    if (preview) {
      preview.src = album.coverImage || '';
      preview.style.display = album.coverImage ? 'block' : 'none';
    }

    const today = new Date().toISOString().split('T')[0];
    this.jmDate.value = today;
    this.jmReview.value = '';
    this.jmMessage.textContent = '';
    this.selectedRating = 0;
    this.renderStars(this.jmStars, 0);
    this.clearJournalErrors();
    this.journalModal.style.display = 'flex';
  },

  openEditModal(entry) {
    this.jmAlbumName.textContent = entry.albumName;
    this.jmArtistName.textContent = entry.artist;
    this.jmAlbumId.value = entry.albumId;
    this.jmCoverImage.value = entry.coverImage || '';
    this.jmEntryId.value = entry.entryId; // set = edit mode

    this.jmDate.value = entry.listenedDate;
    this.jmReview.value = entry.review || '';
    this.jmMessage.textContent = '';
    this.selectedRating = entry.rating;
    this.renderStars(this.jmStars, entry.rating);
    this.clearJournalErrors();

    this.journalModal.style.display = 'flex';
  },

  closeJournalModal() {
    this.journalModal.style.display = 'none';
    this.jmReview.value = '';
    this.jmDate.value = '';
    this.jmMessage.textContent = '';
    this.selectedRating = 0;
    this.clearJournalErrors();
  },

  renderStars(container, selectedRating) {
    container.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'star-btn' + (i <= selectedRating ? ' star-selected' : '');
      star.textContent = '★';
      star.dataset.value = i;
      star.addEventListener('click', () => {
        this.selectedRating = i;
        this.renderStars(container, i);
      });
      container.appendChild(star);
    }
  },

  clearJournalErrors() {
    this.jmRatingError.style.display = 'none';
    this.jmDateError.style.display = 'none';
    this.jmReviewError.style.display = 'none';
  },

  async submitJournalForm(event) {
    event.preventDefault();
    this.clearJournalErrors();

    // Validate rating
    if (!this.selectedRating || this.selectedRating < 1 || this.selectedRating > 5) {
      this.jmRatingError.style.display = 'block';
      return;
    }

    // Validate date not in the future
    const listenedDate = this.jmDate.value;
    const today = new Date().toISOString().split('T')[0];
    if (listenedDate > today) {
      this.jmDateError.style.display = 'block';
      return;
    }

    // Validate review length
    const review = this.jmReview.value;
    if (review.length > 2000) {
      this.jmReviewError.style.display = 'block';
      return;
    }

    const entryId = this.jmEntryId.value;
    const isEdit = !!entryId;

    const payload = {
      albumId: this.jmAlbumId.value,
      albumName: this.jmAlbumName.textContent,
      artist: this.jmArtistName.textContent,
      coverImage: this.jmCoverImage.value,
      rating: this.selectedRating,
      review,
      listenedDate
    };

    this.jmSubmit.disabled = true;
    this.jmSubmit.querySelector('.btn-text').style.display = 'none';
    this.jmSubmit.querySelector('.btn-spinner').style.display = 'inline';

    try {
      const url = isEdit ? `/api/journal/${entryId}` : '/api/journal';
      const method = isEdit ? 'PATCH' : 'POST';
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        this.closeJournalModal();
        this.displayMessage(isEdit ? 'Entry updated.' : 'Entry added to your journal.', 'success');
      } else if (response.status === 409) {
        // Duplicate — offer link to edit
        this.jmMessage.innerHTML = `You have already logged this album. 
          <a href="/journal.html?edit=${data.entryId}" class="toggle-form">Edit the existing entry</a>`;
      } else {
        this.jmMessage.textContent = data.message || 'Could not save entry. Please try again.';
      }
    } catch (error) {
      this.jmMessage.textContent = 'Could not connect to the server.';
    } finally {
      this.jmSubmit.disabled = false;
      this.jmSubmit.querySelector('.btn-text').style.display = 'inline';
      this.jmSubmit.querySelector('.btn-spinner').style.display = 'none';
    }
  },

  // --- Helpers ---
  formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
  },

  showDashboard() {
    document.getElementById('landing-page').style.display = 'none';
    document.body.classList.remove('landing-active');
    this.dashboard.style.display = 'flex';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const welcomeEl = document.getElementById('search-welcome');
    if (welcomeEl) welcomeEl.textContent = `${greeting}${this.username ? ', ' + this.username : ''}`;
    const dsUsername = document.getElementById('ds-username');
    if (dsUsername) dsUsername.textContent = this.username || '';
    const dsAvatar = document.getElementById('ds-avatar-initials');
    if (dsAvatar && this.username) dsAvatar.textContent = this.username.charAt(0).toUpperCase();
    const dsSectionTitle = document.getElementById('ds-section-title');
    if (dsSectionTitle) dsSectionTitle.textContent = `${this.username}'s Collection`;
  },

  showLandingView() {
    document.getElementById('landing-page').style.display = 'block';
    document.body.classList.add('landing-active');
    this.dashboard.style.display = 'none';
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

document.addEventListener('DOMContentLoaded', () => app.init());
