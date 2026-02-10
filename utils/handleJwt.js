const jwt = require("jsonwebtoken");
const JWT =  process.env.JWT_SECRET

const tokenSign = (data) => {
  // Build token payload with only existing fields (handles Google users who might not have all fields)
  const payload = {
      _id: data._id,
      name: data.name || '',
      email: data.email,
  };
  
  // Only include optional fields if they exist
  if (data.surname) payload.surname = data.surname;
  if (data.birthdate) payload.birthdate = data.birthdate;
  if (data.gender) payload.gender = data.gender;
  
  const sign = jwt.sign(
    payload,
    JWT,  // Signing secret
    { expiresIn: "365d" } // Expiration time
  );

  return sign;
};


const verifyToken = (tokenJwt) => {
  try{
  return jwt.verify(tokenJwt,JWT)
  }
  catch (err) {
  console.log(err)
  }
}


const checkToken = async (req,res,next) => {
  try{
    const token = req.headers.authorization.split(" ").pop()
    const dataToken = verifyToken(token)
    const id = dataToken._id
    return id
    next()
  }
  catch(error){
    console.log(error)
    handleHttpError(res,"ERROR")
  } 
};



module.exports = {tokenSign,verifyToken, checkToken}