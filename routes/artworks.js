const express = require("express");
const router = express.Router();
const { getArtworkById, getAllArtworks } = require("../controllers/artworks");

// Obtener todas las obras (con filtros opcionales)
// GET /api/artworks?page=1&limit=20&category=cine&source=TMDB
router.get("/", getAllArtworks);

// Obtener una obra por ID
// GET /api/artworks/:id
router.get("/:id", getArtworkById);

module.exports = router;
