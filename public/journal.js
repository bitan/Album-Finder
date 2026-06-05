// --- XSS Sanitizer ---
function sanitize(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(isoString) {
  if (!isoString) return '';
  const [year, month, day] = isoString.split('-').map(Number);
  return new Date(year, month - 1, day)
    .toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function starsHtml(rating) {
  return Array.from({ length: 5 }, (_, i) =>
    `<span style="color:${i < rating ? '#e84a3a' : '#3a3a44'}">★</span>`
  ).join('');
}

function computeStats(entries) {
  const total = entries.length;
  let average = '0.0';
  if (total > 0) {
    const sum = entries.reduce((a, e) => a + (e.rating || 0), 0);
    average = (sum / total).toFixed(1);
  }
  let topRated = null;
  if (total > 0) {
    topRated = entries.reduce((best, e) => {
      if (!best) return e;
      if (e.rating > best.rating) return e;
      if (e.rating === best.rating && e.listenedDate > best.listenedDate) return e;
      return best;
    }, null);
  }
  const now = new Date();
  const cy = now.getFullYear(), cm = now.getMonth();
  const seenMonth = new Set();
  entries.forEach(e => {
    if (!e.listenedDate) return;
    const [y, m] = e.listenedDate.split('-').map(Number);
    if (y === cy && m - 1 === cm) seenMonth.add(e.albumId);
  });
  return { total, average, topRated, monthlyCount: seenMonth.size };
}

const journalApp = {
  token: null, username: null,
  entries: [], selectedRating: 0, pendingDeleteId: null,
  journalContainer: null, logoutButton: null,
  journalModal: null, confirmModal: null,
  jmAlbumName: null, jmArtistName: null, jmStars: null,
  jmReview: null, jmDate: null, jmSubmit: null, jmMessage: null,
  jmAlbumId: null, jmCoverImage: null, jmEntryId: null,
  jmRatingError: null, jmDateError: null, jmReviewError: null,

  init() {
    this.token    = localStorage.getItem('authToken');
    this.username = localStorage.getItem('username');
    if (!this.token || !this.username) { window.location.href = '/'; return; }

    // Populate header
    const avatar = document.getElementById('jn-avatar');
    if (avatar) avatar.textContent = this.username.charAt(0).toUpperCase();
    const uname = document.getElementById('jn-username');
    if (uname) uname.textContent = this.username;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const greetEl = document.getElementById('jn-greeting');
    if (greetEl) greetEl.textContent = `${greeting}, ${this.username}`;

    // Cache refs
    this.journalContainer = document.getElementById('journal-container');
    this.logoutButton     = document.getElementById('logout-button');
    this.journalModal     = document.getElementById('journal-modal');
    this.confirmModal     = document.getElementById('confirm-modal');
    this.jmAlbumName      = document.getElementById('jm-album-name');
    this.jmArtistName     = document.getElementById('jm-artist-name');
    this.jmStars          = document.getElementById('jm-stars');
    this.jmReview         = document.getElementById('jm-review');
    this.jmDate           = document.getElementById('jm-date');
    this.jmSubmit         = document.getElementById('jm-submit');
    this.jmMessage        = document.getElementById('jm-message');
    this.jmAlbumId        = document.getElementById('jm-album-id');
    this.jmCoverImage     = document.getElementById('jm-cover-image');
    this.jmEntryId        = document.getElementById('jm-entry-id');
    this.jmRatingError    = document.getElementById('jm-rating-error');
    this.jmDateError      = document.getElementById('jm-date-error');
    this.jmReviewError    = document.getElementById('jm-review-error');

    this.submitEdit       = this.submitEdit.bind(this);
    this.closeJournalModal = this.closeJournalModal.bind(this);

    this.logoutButton.addEventListener('click', () => {
      localStorage.clear(); window.location.href = '/';
    });
    document.querySelector('.close-journal-modal').addEventListener('click', this.closeJournalModal);
    window.addEventListener('click', e => {
      if (e.target === this.journalModal) this.closeJournalModal();
      if (e.target === this.confirmModal) this.cancelDelete();
    });
    this.jmSubmit.addEventListener('click', this.submitEdit);
    document.getElementById('confirm-delete-btn').addEventListener('click', () => this.deleteEntry(this.pendingDeleteId));
    document.getElementById('cancel-delete-btn').addEventListener('click', () => this.cancelDelete());
    document.getElementById('jn-back-btn').addEventListener('click', () => window.location.href = '/');

    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    this.loadJournal().then(() => {
      if (editId) {
        const e = this.entries.find(x => x.entryId === editId);
        if (e) this.openEditModal(e);
      }
    });
  },

  async loadJournal() {
    this.journalContainer.innerHTML = '<div class="ds-empty"><p>Loading…</p></div>';
    try {
      const res = await fetch('/api/journal', { headers: { Authorization: `Bearer ${this.token}` } });
      if (res.status === 401 || res.status === 403) { localStorage.clear(); window.location.href = '/'; return; }
      if (!res.ok) { this.journalContainer.innerHTML = '<div class="ds-empty"><p>Could not load journal</p></div>'; return; }
      this.entries = await res.json();
      this.renderEntries(this.entries);
      this.renderStats(this.entries);
    } catch {
      this.journalContainer.innerHTML = '<div class="ds-empty"><p>Connection error</p></div>';
    }
  },

  renderEntries(entries) {
    this.journalContainer.innerHTML = '';
    if (!entries || entries.length === 0) {
      this.journalContainer.innerHTML = '<div class="ds-empty"><p>No entries yet — log an album!</p></div>';
      return;
    }
    entries.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'ds-track-row';
      row.innerHTML = `
        <span class="ds-track-num">${String(idx + 1).padStart(2, '0')}</span>
        <img class="ds-track-ico" src="${sanitize(entry.coverImage)}" alt="">
        <div class="ds-track-info">
          <p class="ds-track-name">${sanitize(entry.albumName)}</p>
          <small>${sanitize(entry.artist)}</small>
        </div>
        <span class="ds-track-year" style="color:#e84a3a;font-size:11px;">${'★'.repeat(entry.rating || 0)}</span>
      `;
      row.addEventListener('click', () => {
        document.querySelectorAll('.ds-track-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        // spin vinyl
        const vinyl = document.getElementById('jn-vinyl');
        if (vinyl) { vinyl.classList.remove('spinning'); void vinyl.offsetWidth; vinyl.classList.add('spinning'); }
        // update now playing
        const np = document.getElementById('jn-now-playing');
        if (np) np.textContent = `${entry.albumName} — ${entry.artist}`;
        this.showEntryDetail(entry);
      });
      this.journalContainer.appendChild(row);
    });
  },

  showEntryDetail(entry) {
    document.getElementById('jn-right-empty').style.display = 'none';
    const detail = document.getElementById('jn-entry-detail');
    detail.style.display = '';

    // covers
    const coverA = document.getElementById('jn-detail-cover-a');
    const coverB = document.getElementById('jn-detail-cover-b');
    if (coverA) coverA.style.background = `url('${entry.coverImage}') center/cover`;
    if (coverB) coverB.style.background = `url('${entry.coverImage}') center/cover`;

    document.getElementById('jn-detail-artist').textContent = entry.artist.toUpperCase();
    document.getElementById('jn-detail-title').textContent  = entry.albumName;
    document.getElementById('jn-detail-rating').textContent = '★'.repeat(entry.rating || 0) + ` ${entry.rating}/5`;
    document.getElementById('jn-detail-date').textContent   = formatDate(entry.listenedDate);
    document.getElementById('jn-detail-review').textContent = entry.review || 'No review written.';

    document.getElementById('jn-edit-btn').onclick   = () => this.openEditModal(entry);
    document.getElementById('jn-delete-btn').onclick = () => this.confirmDelete(entry.entryId);
  },

  renderStats(entries) {
    const { total, average, topRated, monthlyCount } = computeStats(entries);
    document.getElementById('stat-total').textContent   = total;
    document.getElementById('stat-avg').textContent     = average;
    document.getElementById('stat-monthly').textContent = monthlyCount;

    const badge = document.getElementById('jn-total-badge');
    if (badge) badge.textContent = total;

    // update right panel empty state with top-rated
    if (topRated) {
      const ct = document.getElementById('jn-cover-top');
      if (ct) ct.style.background = `url('${topRated.coverImage}') center/cover`;
      const tn = document.getElementById('jn-top-album-name');
      if (tn) { tn.childNodes[0].textContent = topRated.albumName + ' '; }
      const ty = document.getElementById('jn-top-album-year');
      if (ty) ty.textContent = topRated.listenedDate ? topRated.listenedDate.slice(0,4) : '';
    }
  },

  openEditModal(entry) {
    this.jmAlbumName.textContent   = entry.albumName;
    this.jmArtistName.textContent  = entry.artist;
    this.jmAlbumId.value           = entry.albumId;
    this.jmCoverImage.value        = entry.coverImage || '';
    this.jmEntryId.value           = entry.entryId;
    this.jmDate.value              = entry.listenedDate;
    this.jmReview.value            = entry.review || '';
    this.jmMessage.textContent     = '';
    this.selectedRating            = entry.rating;
    const preview = document.getElementById('jm-cover-preview');
    if (preview) { preview.src = entry.coverImage || ''; preview.style.display = entry.coverImage ? 'block' : 'none'; }
    this.renderStars(this.jmStars, entry.rating);
    this.clearErrors();
    this.journalModal.style.display = 'flex';
  },

  closeJournalModal() {
    this.journalModal.style.display = 'none';
    this.jmMessage.textContent = '';
    this.selectedRating = 0;
    this.clearErrors();
  },

  renderStars(container, sel) {
    container.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'star-btn' + (i <= sel ? ' star-selected' : '');
      s.textContent = '★';
      s.addEventListener('click', () => { this.selectedRating = i; this.renderStars(container, i); });
      container.appendChild(s);
    }
  },

  clearErrors() {
    this.jmRatingError.style.display = 'none';
    this.jmDateError.style.display   = 'none';
    this.jmReviewError.style.display = 'none';
  },

  async submitEdit(event) {
    event.preventDefault();
    this.clearErrors();
    if (!this.selectedRating || this.selectedRating < 1 || this.selectedRating > 5) { this.jmRatingError.style.display = 'block'; return; }
    const listenedDate = this.jmDate.value;
    if (listenedDate > new Date().toISOString().split('T')[0]) { this.jmDateError.style.display = 'block'; return; }
    const review = this.jmReview.value;
    if (review.length > 2000) { this.jmReviewError.style.display = 'block'; return; }

    const entryId = this.jmEntryId.value;
    const btnText = this.jmSubmit.querySelector('.btn-text');
    const btnSpin = this.jmSubmit.querySelector('.btn-spinner');
    this.jmSubmit.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (btnSpin) btnSpin.style.display = 'inline';

    try {
      const res = await fetch(`/api/journal/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ rating: this.selectedRating, review, listenedDate })
      });
      const data = await res.json();
      if (res.ok) {
        const idx = this.entries.findIndex(e => e.entryId === entryId);
        if (idx !== -1) this.entries[idx] = { ...this.entries[idx], rating: this.selectedRating, review, listenedDate };
        this.closeJournalModal();
        this.renderEntries(this.entries);
        this.renderStats(this.entries);
      } else {
        this.jmMessage.textContent = data.message || 'Could not update entry.';
      }
    } catch { this.jmMessage.textContent = 'Connection error.'; }
    finally {
      this.jmSubmit.disabled = false;
      if (btnText) btnText.style.display = 'inline';
      if (btnSpin) btnSpin.style.display = 'none';
    }
  },

  confirmDelete(entryId) { this.pendingDeleteId = entryId; this.confirmModal.style.display = 'flex'; },
  cancelDelete()          { this.pendingDeleteId = null;    this.confirmModal.style.display = 'none'; },

  async deleteEntry(entryId) {
    this.confirmModal.style.display = 'none';
    try {
      const res = await fetch(`/api/journal/${entryId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${this.token}` }
      });
      if (res.ok) {
        this.entries = this.entries.filter(e => e.entryId !== entryId);
        // reset right panel
        document.getElementById('jn-right-empty').style.display = '';
        document.getElementById('jn-entry-detail').style.display = 'none';
        this.renderEntries(this.entries);
        this.renderStats(this.entries);
      } else {
        const d = await res.json();
        alert(d.message || 'Could not delete.');
      }
    } catch { alert('Connection error.'); }
    finally { this.pendingDeleteId = null; }
  }
};

document.addEventListener('DOMContentLoaded', () => journalApp.init());
