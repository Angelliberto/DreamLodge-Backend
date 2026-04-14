const { encryptPassword, comparePassword } = require("../utils/handlePassword");
const { matchedData } = require("express-validator");
const {tokenSign} = require("../utils/handleJwt");
const {handleHTTPError} = require("../utils/handleHTTPError");
const  {UserModel}  = require("../models");
const { sendEmail, sendVerificationEmail, generateVerificationCode } = require("../utils/sendMail");
const crypto = require("crypto");
const { OAuth2Client } = require('google-auth-library');
const authSessionStore = require("../utils/authSession");

const userRegister = async (req, res) => {
  try {
    const validatedData = matchedData(req);
    const lowerEmail = validatedData.email.toLowerCase();

    const existingUser = await UserModel.findOne({ email: lowerEmail });

    if (existingUser && existingUser.validated_email) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const password = await encryptPassword(validatedData.password);
    const verificationCode = generateVerificationCode();
    const expirationDate = new Date(Date.now() + 10 * 60 * 1000);

    let userData;

    if (existingUser && !existingUser.validated_email) {
      existingUser.name = validatedData.name;
      existingUser.birthdate = validatedData.birthdate || existingUser.birthdate;
      existingUser.password = password;
      existingUser.emailValidationCode = verificationCode;
      existingUser.emailValidationCodeExpiration = expirationDate;
      existingUser.emailValidationAttempts = 0;

      await existingUser.save();
      userData = existingUser;
    } else {
      const newUser = {
        ...validatedData,
        email: lowerEmail,
        password,
        validated_email: false,
        emailValidationCode: verificationCode,
        emailValidationCodeExpiration: expirationDate,
        emailValidationAttempts: 0
      };

      userData = await UserModel.create(newUser);
    }

    await sendVerificationEmail(userData.email, verificationCode);

    userData.password = undefined;
    userData.emailValidationCode = undefined;
    userData.emailValidationCodeExpiration = undefined;
    userData.emailValidationAttempts = undefined;

    const data = {
      token: tokenSign(userData),
      user: userData,
      message: "User registered. Please verify your email."
    };

    return res.status(201).send(data);
  } catch (error) {
    console.error("userRegister error:", error);
    handleHTTPError(res, error);
  }
};

const userLogin = async (req,res) => {
  try{
    const validatedData = matchedData(req);
    
    const user = await UserModel.findOne({email: validatedData.email});
    if(!user) return res.status(404).json({message: "User not found"}); 
    if (!user.validated_email) {
      return res.status(403).json({ message: "Email not verified" });
    }
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

    // Always redirect if redirect_uri is present
    if (redirectUri) {
      console.log("Google Callback: Redirecting to:", redirectUri);
      try {
        // Check if this is a web redirect (HTTP/HTTPS) or a deep link
        const isWebRedirect = redirectUri.startsWith('http://') || redirectUri.startsWith('https://');
        
        if (isWebRedirect) {
          // For web redirects, use secure session-based approach
          // Create a temporary session and redirect with a code instead of the token
          const sessionCode = authSessionStore.createSession(token, userData);
          const redirectUrl = `${redirectUri}?session=${sessionCode}`;
          console.log("Google Callback: Using secure session-based redirect for web");
          return res.redirect(302, redirectUrl);
        } else {
          // For deep links (mobile apps), use the direct approach
          // Mobile apps can handle tokens in deep links more securely
          const userDataEncoded = encodeURIComponent(JSON.stringify(userData));
          const redirectUrl = `${redirectUri}?token=${token}&user=${userDataEncoded}`;
          console.log("Google Callback: Using direct redirect for deep link");
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

const verifyEmailCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const lowerEmail = email.toLowerCase();

    const user = await UserModel.findOne({ email: lowerEmail });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.validated_email) {
      return res.status(200).json({ message: "Email already verified" });
    }

    if (!user.emailValidationCode || !user.emailValidationCodeExpiration) {
      return res.status(400).json({ message: "No verification code found" });
    }

    if (user.emailValidationAttempts >= 10) {
      return res.status(429).json({ message: "Too many attempts" });
    }

    if (user.emailValidationCodeExpiration < new Date()) {
      return res.status(400).json({ message: "Verification code expired" });
    }

    if (user.emailValidationCode !== code) {
      user.emailValidationAttempts += 1;
      await user.save();
      return res.status(400).json({ message: "Invalid verification code" });
    }

    user.validated_email = true;
    user.emailValidationCode = null;
    user.emailValidationCodeExpiration = null;
    user.emailValidationAttempts = 0;

    await user.save();

    return res.status(200).json({
      message: "Email verified successfully"
    });
  } catch (error) {
    console.error("verifyEmailCode error:", error);
    return handleHTTPError(res, error);
  }
};

const resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const lowerEmail = email.toLowerCase();
    const user = await UserModel.findOne({ email: lowerEmail });

    if (!user) {
      return res.status(200).json({
        message: "If the email exists, a new code has been sent"
      });
    }

    if (user.validated_email) {
      return res.status(400).json({ message: "Email already verified" });
    }

    const verificationCode = generateVerificationCode();
    const expirationDate = new Date(Date.now() + 10 * 60 * 1000);

    user.emailValidationCode = verificationCode;
    user.emailValidationCodeExpiration = expirationDate;
    user.emailValidationAttempts = 0;

    await user.save();

    await sendVerificationEmail(user.email, verificationCode);

    return res.status(200).json({
      message: "Verification code sent"
    });
  } catch (error) {
    console.error("resendVerificationCode error:", error);
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

    // Para mobile apps, usamos directamente el deep link de la app
    // El formato es: dreamlodgefrontend://reset-password?token=...
    // Cuando el usuario hace clic en el enlace del correo en su móvil,
    // el sistema operativo abrirá la app automáticamente
    const resetPasswordUrl = `dreamlodgefrontend://reset-password?token=${passwordResetToken}`;
    console.log('📧 Password reset deep link generated:', resetPasswordUrl);

    try {
      await sendEmail(
        user.email,
        "Restablece tu contraseña - Dream Lodge",
        "Haz clic en el siguiente enlace para restablecer tu contraseña. Este enlace expirará en 5 minutos.",
                resetPasswordUrl,
        "Restablecer Contraseña"
      );
      console.log(`Password reset email sent successfully to ${user.email}`);
      return res.status(200).json({ message: "Si el email existe, se enviará un correo con instrucciones para restablecer tu contraseña." });
    } catch (emailError) {
      console.error("Error sending password reset email:", emailError);
      // Si falla el envío del correo, limpiar el token para que el usuario pueda intentar de nuevo
      user.resetPasswordToken = null;
      user.resetPasswordTokenExpiration = null;
      await user.save();
      
      // Retornar error específico según el tipo de error
      if (emailError.message && emailError.message.includes("EMAIL_USER")) {
        return res.status(500).json({ 
          message: "Error de configuración del servidor de correo. Por favor contacta al administrador." 
        });
      }
      
      // Error de autenticación de Gmail
      if (emailError.code === 'EAUTH' || emailError.responseCode === 535) {
        console.error("⚠️  CREDENCIALES DE GMAIL INVÁLIDAS");
        console.error("   Revisa las instrucciones en los logs del servidor para configurar Gmail correctamente.");
        return res.status(500).json({ 
          message: "Error de configuración del servidor de correo. Las credenciales de Gmail no son válidas. Por favor contacta al administrador." 
        });
      }
      
      return res.status(500).json({ 
        message: "Error al enviar el correo. Por favor intenta nuevamente más tarde." 
      });
    }

  } catch (err) {
    console.error("Error in sendPasswordResetEmail:", err);
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

const exchangeAuthSession = async (req, res) => {
  try {
    const { session } = req.query;
    
    if (!session) {
      return res.status(400).json({ 
        message: "Session code is required",
        error: "Missing 'session' parameter"
      });
    }

    // Retrieve and delete the session (one-time use)
    const sessionData = authSessionStore.getAndDeleteSession(session);
    
    if (!sessionData) {
      return res.status(400).json({ 
        message: "Invalid or expired session code",
        error: "The session code is invalid, expired, or has already been used"
      });
    }

    // Return token and user data
    return res.json({
      token: sessionData.token,
      user: sessionData.userData
    });
  } catch (error) {
    console.error("Error exchanging auth session:", error);
    return handleHTTPError(res, error);
  }
};

module.exports = {userRegister, 
  userLogin, userDelete,userUpdate, 
  googleCallback, googleSignInWithToken, 
  resetPassword,checkPasswordResetToken,
  sendPasswordResetEmail, exchangeAuthSession, 
  verifyEmailCode,resendVerificationCode}