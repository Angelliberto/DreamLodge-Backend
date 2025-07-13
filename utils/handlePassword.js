const bcryptjs = require("bcryptjs");

const encryptPassword = async (password) => {
    return await bcryptjs.hash(password, 10);
};

const comparePassword = async (password, hashedPassword) => {
    return await bcryptjs.compare(password, hashedPassword);
};

module.exports = { encryptPassword, comparePassword };