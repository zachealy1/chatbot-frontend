const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

// Example in-memory user object
const testUser = {
  id: 1,
  username: 'admin',
  password: 'password'
};

// LocalStrategy for username/password
passport.use(
  new LocalStrategy((username, password, done) => {
    if (username !== testUser.username) {
      return done(null, false, { message: 'Incorrect username.' });
    }
    if (password !== testUser.password) {
      return done(null, false, { message: 'Incorrect password.' });
    }
    return done(null, testUser);
  })
);

/**
 * Serialize user
 * - This is called when the user logs in (or is already logged in)
 * - You save just the user.id into the session.
 */
passport.serializeUser((user, done) => {
  // user is the testUser object from above
  // store just the id in the session
  done(null, user.id);
});

/**
 * Deserialize user
 * - This is called on every request that has an active login session
 * - We use the id to find the user and restore req.user
 */
passport.deserializeUser((id, done) => {
  // For a single in-memory user, just compare the ID
  if (id === testUser.id) {
    return done(null, testUser);
  }
  // If we can’t find the user, error or pass null
  return done(new Error('User not found'));
});

module.exports = passport; // or export default passport for ESM
