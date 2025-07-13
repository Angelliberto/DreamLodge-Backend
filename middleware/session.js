const { verifyToken } = require('../utils/handleJwt');
const {} = require('../models');
const { handleHTTPError } = require('../utils/handleHTTPError');

const decodeToken = async (req) => {
    try {
        if (!req.headers.authorization) {
            console.error("Authorization header is missing");
            throw new Error({ message: "Authorization required" }, 401);
        }

        const token = req.headers.authorization.split(" ").pop();
        const tokenData = verifyToken(token);

        if (!tokenData || !tokenData._id) {
            console.error("Invalid token data: ", tokenData);
            throw new Error({ message: "Invalid token" }, 401);
        }
        return tokenData
    } catch (err) {
        throw new Error("Error decoding token")
    }
}


module.exports = {};