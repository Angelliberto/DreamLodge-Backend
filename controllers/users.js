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
      return res.status(401).json({ message: "Google authentication failed" });
    }

    // Generate JWT for the user
    const token = tokenSign(user);

    // You can redirect or send token/user data
    return res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        birthdate: user.birthdate
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Google sign-in error" });
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