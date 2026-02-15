const { encryptPassword, comparePassword } = require("../utils/handlePassword");
const { matchedData } = require("express-validator");
const {tokenSign} = require("../utils/handleJwt");
const {handleHTTPError} = require("../utils/handleHTTPError");
const  {UserModel}  = require("../models");
const { sendEmail } = require("../utils/sendMail");
const crypto = require("crypto");
const { OAuth2Client } = require('google-auth-library');


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
        
        // Always redirect directly to the redirectUri (deep link or web URL)
        // The WebView in the app will intercept the deep link
        console.log("Google Callback: Redirecting directly to:", redirectUrl);
        return res.redirect(302, redirectUrl);
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
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "El email es requerido" });
    }
    const user = await UserModel.findOne({email: email})
    if (!user) {
      // Por seguridad, no revelamos si el email existe o no
      return res.status(200).json({ message: "Si el email existe, se enviará un correo con instrucciones para restablecer tu contraseña." });
    }

    const passwordResetToken = crypto.randomBytes(32).toString("hex");

    user.resetPasswordToken = passwordResetToken
    user.resetPasswordTokenExpiration = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos
    await user.save()

    // Para mobile apps, necesitamos un deep link o URL que la app pueda manejar
    // Usaremos un formato que la app pueda interceptar
    const resetPasswordUrl = `${process.env.FRONTEND_URL || 'dreamlodgefrontend://'}reset-password?token=${passwordResetToken}`;

    sendEmail(user.email,
                "Restablece tu contraseña - Dream Lodge",
                "Haz clic en el siguiente enlace para restablecer tu contraseña. Este enlace expirará en 5 minutos.",
                resetPasswordUrl,
                "Restablecer Contraseña"
        );
     res.status(200).json({ message: "Si el email existe, se enviará un correo con instrucciones para restablecer tu contraseña." });

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

        user.password = await encryptPassword(newPassword);
        user.resetPasswordToken = null;
        user.resetPasswordTokenExpiration = null;
        await user.save();

        res.send({ message: "Password reset successfully. You can now log in with your new password." });
    } catch (error) {
        return handleHTTPError(res, { message: "Error resetting password" }, 500);
    }
};




const googleSignInWithToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: "Google ID token is required" });
    }

    // Verify the Google ID token
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (verifyError) {
      console.error("Google token verification error:", verifyError);
      return res.status(401).json({ 
        message: "Invalid Google token",
        error: verifyError.message 
      });
    }

    const payload = ticket.getPayload();
    
    if (!payload || !payload.email) {
      return res.status(400).json({ message: "Invalid Google token - no email found" });
    }

    const email = payload.email;
    const name = payload.name || payload.given_name || 'User';
    
    // Check if user already exists
    let user = await UserModel.findOne({ email: email });
    
    if (!user) {
      // Create new user
      user = await UserModel.create({
        name: name,
        email: email,
        password: undefined, // Google account - no password needed
      });
    }

    // Generate JWT token
    const jwtToken = tokenSign(user);
    
    const userData = {
      _id: user._id,
      name: user.name || '',
      email: user.email,
      birthdate: user.birthdate || null
    };

    return res.json({
      token: jwtToken,
      user: userData
    });
  } catch (error) {
    console.error("Google sign-in with token error:", error);
    return handleHTTPError(res, error);
  }
};

module.exports = {userRegister, userLogin, userDelete,userUpdate, googleCallback, googleSignInWithToken, resetPassword,checkPasswordResetToken,sendPasswordResetEmail}