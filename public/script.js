
const app = {
  // UI Elements
  loginView: document.getElementById('login-view'),
  registerView: document.getElementById('register-view'),
  dashboard: document.getElementById('dashboard'),
  dashboardMessage: document.getElementById('dashboard-message'),
  message: document.getElementById('message'),

  // Toggle between login and registration views
  toggleView() {
    this.loginView.style.display = this.loginView.style.display === 'none' ? 'block' : 'none';
    this.registerView.style.display = this.registerView.style.display === 'none' ? 'block' : 'none';
    this.message.textContent = ''; // Clear any previous messages
  },

  // Register a new user
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
      this.message.textContent = await response.text();
      if (response.ok) {
          this.toggleView(); // Switch to login view on successful registration
      }
    } catch (error) {
      this.message.textContent = 'Error registering.';
    }
  },

  // Log in a user
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

      if (response.ok) {
        this.showDashboard(username);
      } else {
        this.message.textContent = await response.text();
      }
    } catch (error) {
      this.message.textContent = 'Error logging in.';
    }
  },

  // Log out a user
  async logout() {
    try {
      await fetch('/logout', { method: 'POST' });
      this.showAuthForms();
    } catch (error) {
      this.message.textContent = 'Error logging out.';
    }
  },

  // UI Updates
  showDashboard(username) {
    this.loginView.style.display = 'none';
    this.registerView.style.display = 'none';
    this.dashboard.style.display = 'block';
    this.dashboardMessage.textContent = `Welcome, ${username}!`;
    this.message.textContent = '';
  },

  showAuthForms() {
    this.loginView.style.display = 'block';
    this.registerView.style.display = 'none';
    this.dashboard.style.display = 'none';
    this.message.textContent = 'You have been logged out.';
  }
};
