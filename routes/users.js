const express = require('express');
const router = express.Router();
const {authUser} = require("../middleware/session")
const passport = require("../middleware/googleAuth");
const {
  userRegister,
  userLogin,
  userDelete,
  userUpdate,
  googleCallback} = require("../controllers/users")
const {
  userRegisterValidator,
  userLoginValidator,
  userUpdateValidator,
  googleSignInValidator} = require("../validators/users")
  


router.post("/register", userRegisterValidator, userRegister);
router.post("/login", userLoginValidator,userLogin);
router.delete("/delete", authUser,userDelete);
router.patch("/update",authUser,userUpdateValidator,userUpdate);


router.get("/google", (req, res, next) => {
  // Store redirect_uri in session or pass via state
  const redirectUri = req.query.redirect_uri;
  if (redirectUri) {
    // Pass redirect_uri through state parameter
    // Google OAuth will preserve this state and return it in the callback
    const state = Buffer.from(JSON.stringify({ redirect_uri: redirectUri })).toString('base64');
    console.log("Google OAuth: Starting with redirect_uri:", redirectUri.substring(0, 50) + "...");
    passport.authenticate("google", { 
      scope: ["profile", "email"],
      state: state
    })(req, res, next);
  } else {
    console.log("Google OAuth: No redirect_uri provided");
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  }
});

router.get("/google/callback", (req, res, next) => {
  // Validate that we have an authorization code
  if (!req.query.code) {
    console.error("Google Callback: No authorization code provided");
    return res.status(400).json({ 
      message: "Authorization code is required",
      error: "Missing 'code' parameter in callback URL"
    });
  }

  // Check if code is a placeholder (for testing)
  if (req.query.code === 'AUTHORIZATION_CODE' || req.query.code === '') {
    console.error("Google Callback: Invalid authorization code provided");
    return res.status(400).json({ 
      message: "Invalid authorization code",
      error: "Please use a valid authorization code from Google OAuth flow"
    });
  }

  // Extract redirect_uri from state if present
  let redirectUri = null;
  if (req.query.state) {
    try {
      const stateData = JSON.parse(Buffer.from(req.query.state, 'base64').toString());
      redirectUri = stateData.redirect_uri;
      // Store in req for later use, but don't modify req.query as it might interfere with passport
      req.redirect_uri = redirectUri;
      console.log("Google Callback Route: Extracted redirect_uri from state:", redirectUri ? redirectUri.substring(0, 50) + "..." : "none");
    } catch (e) {
      // If state parsing fails, continue without redirect_uri
      console.error("Error parsing state:", e);
    }
  } else {
    console.log("Google Callback Route: No state parameter found");
  }
  
  passport.authenticate("google", { 
    session: false,
    failureRedirect: undefined // Don't redirect on failure, handle in callback
  }, (err, user, info) => {
    if (err) {
      console.error("Google OAuth authentication error:", err);
      console.error("Error name:", err.name);
      console.error("Error message:", err.message);
      
      // Handle specific OAuth errors
      if (err.name === 'TokenError' || err.message.includes('auth code')) {
        return res.status(400).json({ 
          message: "Invalid or expired authorization code",
          error: "The authorization code is invalid, expired, or has already been used. Please try signing in again.",
          details: err.message
        });
      }
      
      return res.status(500).json({ 
        message: "Google authentication failed", 
        error: err.message,
        errorType: err.name
      });
    }
    if (!user) {
      console.error("Google OAuth: No user returned from strategy");
      return res.status(401).json({ 
        message: "Google authentication failed - no user", 
        info: info 
      });
    }
    req.user = user;
    // Restore redirect_uri if we extracted it from state
    if (redirectUri) {
      req.query.redirect_uri = redirectUri;
    }
    next();
  })(req, res, next);
}, googleCallback);


module.exports = router;
