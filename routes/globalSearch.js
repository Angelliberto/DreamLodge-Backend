const express = require("express");
const router = express.Router();
const { globalSearch } = require("../controllers/globalSearch");

router.get("/", globalSearch);

module.exports = router;
