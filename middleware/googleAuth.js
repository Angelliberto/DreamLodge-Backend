const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { UserModel } = require('../models');

// Validate required environment variables
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.CALLBACK_URL) {
  console.error('Google OAuth: Missing required environment variables');
  console.error('Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CALLBACK_URL');
}

console.log('Google OAuth Strategy initialized with callback URL:', process.env.CALLBACK_URL);

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,       // Add to your .env
    clientSecret: process.env.GOOGLE_CLIENT_SECRET, // Add to your .env
    callbackURL: process.env.CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if email exists in profile
      if (!profile.emails || !profile.emails[0] || !profile.emails[0].value) {
        console.error('Google OAuth: No email found in profile');
        return done(new Error('No email found in Google profile'), null);
      }

      const email = profile.emails[0].value;
      console.log(`Google OAuth: Processing authentication for email: ${email}`);
      
      // Check if user already exists (login case)
      let user = await UserModel.findOne({ email: email });
      
      if (user) {
        // User exists - login case
        console.log(`Google OAuth: User found with email ${email}, logging in`);
        return done(null, user);
      }
      
      // User doesn't exist - registration case
      console.log(`Google OAuth: User not found with email ${email}, creating new user`);
      const userName = profile.displayName || 
                      (profile.name ? `${profile.name.givenName || ''} ${profile.name.familyName || ''}`.trim() : '') || 
                      'User';
      
      user = await UserModel.create({
        name: userName,
        email: email,
        password: undefined, // Google account - no password needed (undefined instead of empty string)
      });
      
      console.log(`Google OAuth: New user created successfully with email ${email}`);
      return done(null, user);
    } catch (err) {
      console.error('Google OAuth Strategy Error:', err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        keyPattern: err.keyPattern,
        keyValue: err.keyValue
      });
      
      // Handle duplicate key error (email already exists - race condition)
      if (err.code === 11000) {
        console.log('Google OAuth: Duplicate key error, attempting to find existing user');
        try {
          const email = profile.emails[0].value;
          const existingUser = await UserModel.findOne({ email: email });
          if (existingUser) {
            console.log('Google OAuth: Found existing user after duplicate key error');
            return done(null, existingUser);
          }
        } catch (findErr) {
          console.error('Google OAuth: Error finding user after duplicate key error:', findErr);
        }
      }
      
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  // Use _id for MongoDB
  done(null, user._id || user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const user = await UserModel.findById(id);
    if (!user) {
      return done(new Error('User not found'), null);
    }
    done(null, user);
  } catch (err) {
    console.error('Deserialize user error:', err);
    done(err, null);
  }
});

module.exports = passport;