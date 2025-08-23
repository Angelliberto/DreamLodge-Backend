const {verifyToken} = require("../utils/handleJwt");
const {handleHTTPError} = require("../utils/handleHTTPError");

const {UserModel} = require("../models");

const authUser = async (req, res, next) => {
  // Check for authorization header
  if (!req.headers.authorization) {
    return handleHTTPError(res, "No token provided", 401);
  }

  try {
    // Extract token from the authorization header (Bearer <token>)
    const token = req.headers.authorization.split(" ").pop();
    // Verify token and extract user data (e.g., _id)
    const dataToken = verifyToken(token);
  
    const id = dataToken._id;

    // Find the user by id
    const user = await UserModel.findById(id);
    if (!user) {
      return handleHTTPError(res, "User not found", 404);
    }

    // Attach the user data to the request object
    req.user = user;

    // Proceed to the next middleware or route handler
    next();

  } catch (error) {
    console.error("Authentication Error:", error.message);
    // Handle token verification failure (e.g., invalid/expired token)
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return handleHTTPError(res, "Invalid or expired token", 401);
    }
    // General error handling
    handleHTTPError(res, "Authentication failed", 500);
    console.error(error);
  }
};

module.exports = { authUser };