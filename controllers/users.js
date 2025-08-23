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
    
    userData.password = undefined; // Hides password in response

    const data = {token: tokenSign(userData), user: userData};
    
    return res.send(data); 
  } catch (error) {
    console.error(error);
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
    console.error(error);
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
    console.error(error);
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
    console.error(error);
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



module.exports = {userRegister, userLogin, userDelete,userUpdate, googleCallback}