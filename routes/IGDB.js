// routes/igdb.js
const express = require("express");
const router = express.Router();
const { searchGames } = require("../controllers/IGDB");

router.post("/search", searchGames);

module.exports = router;