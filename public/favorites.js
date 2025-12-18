
document.addEventListener('DOMContentLoaded', () => {
  const favoritesContainer = document.getElementById('favorites-container');
  const logoutButton = document.getElementById('logout-button');
  const token = localStorage.getItem('authToken');
  const username = localStorage.getItem('username');

  if (!token || !username) {
    window.location.href = '/';
    return;
  }
  
  // Show logout button if logged in
  logoutButton.style.display = 'block';

  logoutButton.addEventListener('click', () => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');
      window.location.href = '/';
  });


  async function loadFavorites() {
    favoritesContainer.innerHTML = '<div class="loading">Loading your favorite albums...</div>';

    try {
      const response = await fetch('/api/favorites', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        window.location.href = '/';
        return;
      }

      const data = await response.json();

      if (response.ok) {
        displayFavorites(data);
      } else {
        favoritesContainer.innerHTML = `<div class="error">${data.message || 'Could not load favorites.'}</div>`;
      }
    } catch (error) {
      favoritesContainer.innerHTML = '<div class="error">Could not connect to the server.</div>';
    }
  }

  function displayFavorites(albums) {
    favoritesContainer.innerHTML = '';

    if (!albums || albums.length === 0) {
      favoritesContainer.innerHTML = '<div class="no-results">You haven\'t saved any favorite albums yet.</div>';
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
      favoritesContainer.appendChild(albumCard);
    });
  }

  loadFavorites();
});
