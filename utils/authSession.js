// Temporary session storage for OAuth callbacks
// Stores tokens securely server-side and provides short-lived codes for exchange

const crypto = require('crypto');

class AuthSessionStore {
  constructor() {
    this.sessions = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000); // Cleanup every 5 minutes
  }

  /**
   * Create a temporary session with token and user data
   * @param {string} token - JWT token
   * @param {object} userData - User data object
   * @returns {string} - Session code (short-lived, expires in 5 minutes)
   */
  createSession(token, userData) {
    const sessionCode = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    
    this.sessions.set(sessionCode, {
      token,
      userData,
      expiresAt,
      createdAt: Date.now()
    });

    return sessionCode;
  }

  /**
   * Retrieve and delete a session by code
   * @param {string} sessionCode - Session code
   * @returns {object|null} - { token, userData } or null if invalid/expired
   */
  getAndDeleteSession(sessionCode) {
    const session = this.sessions.get(sessionCode);
    
    if (!session) {
      return null;
    }

    // Check if expired
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionCode);
      return null;
    }

    // Delete session after retrieval (one-time use)
    this.sessions.delete(sessionCode);
    
    return {
      token: session.token,
      userData: session.userData
    };
  }

  /**
   * Cleanup expired sessions
   */
  cleanup() {
    const now = Date.now();
    for (const [code, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(code);
      }
    }
  }

  /**
   * Get session count (for debugging)
   */
  getSessionCount() {
    return this.sessions.size;
  }
}

// Export singleton instance
module.exports = new AuthSessionStore();
