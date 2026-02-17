const express = require("express");
const router = express.Router();
const { authUser } = require("../middleware/session");
const { 
  getArtworkById, 
  getAllArtworks,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
  addToPending,
  removeFromPending,
  getPending
} = require("../controllers/artworks");

// Obtener todas las obras (con filtros opcionales)
// GET /api/artworks?page=1&limit=20&category=cine&source=TMDB
router.get("/", getAllArtworks);

// Rutas de favoritos (requieren autenticación)
// GET /api/artworks/favorites - Obtener todas las obras favoritas del usuario
router.get("/favorites", authUser, getFavorites);

// POST /api/artworks/favorites - Agregar una obra a favoritos
router.post("/favorites", authUser, addToFavorites);

// DELETE /api/artworks/favorites/:artworkId - Remover una obra de favoritos
router.delete("/favorites/:artworkId", authUser, removeFromFavorites);

// Rutas de pendientes (requieren autenticación)
// GET /api/artworks/pending - Obtener todas las obras pendientes del usuario
router.get("/pending", authUser, getPending);

// POST /api/artworks/pending - Agregar una obra a pendientes
router.post("/pending", authUser, addToPending);

// DELETE /api/artworks/pending/:artworkId - Remover una obra de pendientes
router.delete("/pending/:artworkId", authUser, removeFromPending);

// Obtener una obra por ID (debe ir al final para no interferir con las rutas anteriores)
// GET /api/artworks/:id
router.get("/:id", getArtworkById);

module.exports = router;
