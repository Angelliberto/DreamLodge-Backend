const jwt = require("jsonwebtoken");
const JWT =  process.env.JWT_SECRET

const tokenSign = (data) => {
  const sign = jwt.sign(
    {
      _id: data._id,
      name: data.name,
      surname: data.surname,
      email: data.email,
      birthdate: data.birthdate,
      gender: data.gender,
    },
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