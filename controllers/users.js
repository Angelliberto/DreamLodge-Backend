const { encryptPassword, comparePassword } = require("../utils/handlePassword");
const { matchedData } = require("express-validator");
const {tokenSign} = require("../utils/handleJwt");
const {handleHTTPError} = require("../utils/handleHTTPError");
const  {UserModel}  = require("../models");
const { sendEmail } = require("../utils/sendMail");
const crypto = require("crypto");


const userRegister = async (req, res) => {
  try {
    const validatedData = matchedData(req); 
    const password = await encryptPassword(validatedData.password);
    
    const newUser = { ...validatedData, password };
    const userData = await UserModel.create(newUser);
    userData.password = undefined; 

    const data = {token: tokenSign(userData), user: userData};
    
    return res.send(data); 
  } catch (error) {
    handleHTTPError(res, error);
  }
};

const userLogin = async (req,res) => {
  try{
    const validatedData = matchedData(req);
    
    const user = await UserModel.findOne({email: validatedData.email});
    if(!user) return res.status(404).json({message: "User not found"}); 

    const isPasswordValid = await comparePassword(validatedData.password, user.password);
    if(!isPasswordValid) return res.status(401).json({message: "Invalid password"});    

    user.password = undefined;
    
    const data = {token: tokenSign(user), user: user};
    console.log(data)
    return res.send(data);

  }
  catch(error){
    handleHTTPError(res, error);
  }
}

const userDelete = async (req,res) => {
  try{
    const id = req.user._id;
    console.log(id)
    const user = await UserModel.findByIdAndDelete(id)
    if(!user) return res.status(404).json({message: "User not found"})
    return res.status(200).json({message: "User deleted"})
  }
  catch(error){
    handleHTTPError(res, error);
  }
}

const userUpdate = async (req,res) => {
  try{

    const id = req.user._id;
    const validatedData = matchedData(req);
    const user = await UserModel.findByIdAndUpdate(id, validatedData, {new: true});  
    if(!user) return res.status(404).json({message: "User not found"})
    return res.status(200).json(user)
  }
  catch(error){
    handleHTTPError(res, error)
  }
}



const googleCallback = async (req, res) => {
  try {
    // Passport attaches the user to req.user after successful authentication
    const user = req.user;
    if (!user) {
      console.error("Google Callback: No user found in req.user");
      return res.status(401).json({ message: "Google authentication failed - no user" });
    }

    // Generate JWT for the user
    let token;
    try {
      token = tokenSign(user);
    } catch (tokenError) {
      console.error("Google Callback: Error generating token:", tokenError);
      return res.status(500).json({ message: "Error generating authentication token" });
    }

    const userData = {
      _id: user._id,
      name: user.name || '',
      email: user.email,
      birthdate: user.birthdate || null
    };

    // Check if redirect_uri is provided (for mobile OAuth flow)
    // Try to get it from query, or from req.redirect_uri (set in route middleware)
    const redirectUri = req.query.redirect_uri || req.redirect_uri;
    
    console.log("Google Callback: Checking redirect_uri");
    console.log("  - req.query.redirect_uri:", req.query.redirect_uri);
    console.log("  - req.redirect_uri:", req.redirect_uri);
    console.log("  - Final redirectUri:", redirectUri);

    // Always redirect if redirect_uri is present (even if it's a deep link)
    // The mobile app will handle the deep link, web browsers will show an error but that's expected
    if (redirectUri) {
      console.log("Google Callback: Redirecting to:", redirectUri);
      try {
        // Redirect to the deep link with token and user data
        const userDataEncoded = encodeURIComponent(JSON.stringify(userData));
        const redirectUrl = `${redirectUri}?token=${token}&user=${userDataEncoded}`;
        console.log("Google Callback: Full redirect URL:", redirectUrl.substring(0, 100) + "...");
        
        // Check if it's a deep link (custom scheme)
        if (redirectUri.startsWith('dreamlodgefrontend://')) {
          // For deep links, redirect to HTML page that will activate the deep link
          // Build backend URL from request
          const protocol = req.protocol || 'https';
          const host = req.get('host') || process.env.BACKEND_URL || 'localhost:3000';
          const backendUrl = `${protocol}://${host}`;
          const htmlRedirectUrl = `${backendUrl}/oauth-redirect?deep_link=${encodeURIComponent(redirectUrl)}`;
          console.log("Google Callback: Redirecting to HTML page for deep link activation");
          console.log("Google Callback: HTML redirect URL:", htmlRedirectUrl);
          return res.redirect(302, htmlRedirectUrl);
        } else {
          // For HTTP URLs (web), redirect directly
          return res.redirect(302, redirectUrl);
        }
      } catch (redirectError) {
        console.error("Error creating redirect URL:", redirectError);
        // Fall back to JSON response if redirect fails
        return res.json({
          token,
          user: userData
        });
      }
    }

    // If no redirect_uri, return JSON (for direct API calls or web testing)
    console.log("Google Callback: No redirect_uri found, returning JSON response");
    return res.json({
      token,
      user: userData
    });
  } catch (error) {
    console.error("Google callback error:", error);
    return handleHTTPError(res, error);
  }
};

const sendPasswordResetEmail = async (req, res) => {
  try {
    const email = req.params.email
    const user = await UserModel.findOne({email: email})
    if (!user) {
      return handleHTTPError(res, {message: "User ID not found."}, 404)
    }

    const passwordResetToken = crypto.randomBytes(32).toString("hex");

    user.resetPasswordToken = passwordResetToken
    user.resetPasswordTokenExpiration = Date.now() + 5 * 60 * 1000;
    await user.save()

    const resetPasswordUrl = `${process.env.FRONTEND_URL}reset-password?token=${passwordResetToken}`;

    sendEmail(user.email,
                "Reset your password",
                "Please click the following link to reset your password",
                resetPasswordUrl,
                "Reset Password"
        );
     res.send({ message: "Password reset email sent successfully. Please check your inbox." });

  } catch (err) {
    return handleHTTPError(res, { message: "Error sending password reset email" }, 500);
  }
}

const checkPasswordResetToken = async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return handleHTTPError(res, { message: "Token is required to check password reset" }, 400);
        }

        const user = await UserModel.findOne({
            resetPasswordToken: token,
            resetPasswordTokenExpiration: { $gt: Date.now() }
        });

        if (!user) {
            console.warn("No valid user found with provided token");
            return handleHTTPError(res, { message: "Invalid or expired password reset token" }, 404);
        }

        res.send({ message: "Valid password reset token" });
    } catch (error) {
    
        return handleHTTPError(res, { message: "Error checking password reset token" }, 500);
    }
};

const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return handleHTTPError(res, { message: "Token and new password are required to reset password" }, 400);
        }

        const user = await UserModel.findOne({
            resetPasswordToken: token,
            resetPasswordTokenExpiration: { $gt: Date.now() }
        });

        if (!user) {
            console.warn("No valid user found with provided token");
            return handleHTTPError(res, { message: "Invalid or expired password reset token" }, 404);
        }   

        user.password = await encrypt(newPassword);
        user.resetPasswordToken = null;
        user.resetPasswordTokenExpiration = null;
        await user.save();

        res.send({ message: "Password reset successfully. You can now log in with your new password." });
    } catch (error) {
        return handleHTTPError(res, { message: "Error resetting password" }, 500);
    }
};




module.exports = {userRegister, userLogin, userDelete,userUpdate, googleCallback, resetPassword,checkPasswordResetToken,sendPasswordResetEmail}