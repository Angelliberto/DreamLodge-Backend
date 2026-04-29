const express = require("express");
const router = express.Router();
const { authUser } = require("../middleware/session");
const { 
  getArtworkById, 
  getAllArtworks,
  getSimilarArtworks,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
  addToPending,
  removeFromPending,
  getPending,
  addToDisliked,
  removeFromDisliked,
  getDisliked,
  addToSeen,
  removeFromSeen,
  getSeen,
  addToNotInterested,
  removeFromNotInterested,
  getNotInterested,
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

// Rutas de feedback explícito (disliked / seen / not-interested)
router.get("/disliked", authUser, getDisliked);
router.post("/disliked", authUser, addToDisliked);
router.delete("/disliked/:artworkId", authUser, removeFromDisliked);

router.get("/seen", authUser, getSeen);
router.post("/seen", authUser, addToSeen);
router.delete("/seen/:artworkId", authUser, removeFromSeen);

router.get("/not-interested", authUser, getNotInterested);
router.post("/not-interested", authUser, addToNotInterested);
router.delete("/not-interested/:artworkId", authUser, removeFromNotInterested);

// Similares recomendadas por IA para una obra base
// POST /api/artworks/similar
router.post("/similar", getSimilarArtworks);

// Obtener una obra por ID (debe ir al final para no interferir con las rutas anteriores)
// GET /api/artworks/:id
router.get("/:id", getArtworkById);

module.exports = router;
