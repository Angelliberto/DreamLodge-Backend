// Imports
const express = require("express")
const fs = require("fs")
const router = express.Router()

// Define function and redirect
const removeExtension = (fileName) => {
    /* Get file name by removing extension */
    return fileName.split(".").shift();
};

fs.readdirSync(__dirname).filter((file) => {
    /* Redirect to file name */
    const name = removeExtension(file);
    if (name !== "index") {
        router.use("/" + name, require("./" + name));
    };
});

// Exports
module.exports = router