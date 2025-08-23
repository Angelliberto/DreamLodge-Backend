const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { UserModel } = require('../models');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,       // Add to your .env
    clientSecret: process.env.GOOGLE_CLIENT_SECRET, // Add to your .env
    callbackURL: process.env.CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await UserModel.findOne({ email: profile.emails[0].value });
      if (!user) {
        user = await UserModel.create({
          name: profile.displayName,
          email: profile.emails[0].value,
          password: '', // You may want to mark this as a Google account
        });
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  const user = await UserModel.findById(id);
  done(null, user);
});

module.exports = passport;