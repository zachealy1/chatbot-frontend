const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const axios = require('axios');

// LocalStrategy for username/password authentication
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      // Send login credentials to the Spring Boot backend
      const response = await axios.post('http://localhost:4550/login/chat', { username, password });

      // If authentication is successful, return the user object from backend
      const user = { username, sessionToken: response.data.sessionToken };
      return done(null, user);
    } catch (error) {
      if (error.response && error.response.status === 401) {
        return done(null, false, { message: 'Invalid username or password.' });
      }
      return done(error);
    }
  })
);

/**
 * Serialize user
 * - Stores only necessary user details in session (e.g., username, sessionToken)
 */
passport.serializeUser((user, done) => {
  done(null, user);
});

/**
 * Deserialize user
 * - Retrieves user from session
 */
passport.deserializeUser((user, done) => {
  if (!user) {
    return done(new Error('User not found'));
  }
  done(null, user);
});

module.exports = passport;
