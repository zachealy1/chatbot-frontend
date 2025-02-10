const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const axios = require('axios');

// LocalStrategy for username/password authentication.
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      // Send login credentials to the Spring Boot backend.
      const response = await axios.post('http://localhost:4550/login/chat', { username, password });

      // If authentication is successful, construct a user object.
      // The response from Spring Boot includes a session token.
      // You can later attach the Spring Boot session cookie to this object.
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

// Serialize the entire user object into the session.
passport.serializeUser((user, done) => {
  done(null, user);
});

// Deserialize the user object from the session.
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

module.exports = passport;
