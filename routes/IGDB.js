// routes/igdb.js
const express = require("express");
const router = express.Router();
const { searchGames } = require("../controllers/IGDB");

// POST http://localhost:3000/api/igdb/search
router.post("/search", searchGames);

module.exports = router;