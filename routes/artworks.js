const express = require("express");
const router = express.Router();
const { authUser } = require("../middleware/session");
const { 
  getArtworkById, 
  getAllArtworks,
  postTranslateArtworkDescription,
  postEnrichSpotifyAlbumDescription,
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

// Rutas de guardados (pending en API; requieren autenticación)
// GET /api/artworks/pending - Obras guardadas del usuario
router.get("/pending", authUser, getPending);

// POST /api/artworks/pending - Añadir obra a guardados
router.post("/pending", authUser, addToPending);

// DELETE /api/artworks/pending/:artworkId - Quitar obra de guardados
router.delete("/pending/:artworkId", authUser, removeFromPending);

// Rutas de feedback explícito (disliked / seen / not-interested = ocultar en feed)
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

// Traducir descripción al español (Gemini) si no lo está ya
// POST /api/artworks/translate-description
router.post("/translate-description", postTranslateArtworkDescription);

// Descripción breve álbum Spotify (POST; dos segmentos para no confundir con GET /:id)
// POST /api/artworks/spotify/album-enrich  (recomendado)
router.post("/spotify/album-enrich", postEnrichSpotifyAlbumDescription);
router.get("/spotify/album-enrich", (req, res) => {
  console.warn("[artworks] GET /spotify/album-enrich ignorado; usar POST con body { artwork }");
  res.status(405).set("Allow", "POST").json({
    message: "Este recurso solo admite POST",
    hint: "POST /api/artworks/spotify/album-enrich con JSON { artwork }",
  });
});

// Alias histórico: un solo segmento — GET aquí antes caía en GET /:id y devolvía 404 confuso
router.post("/enrich-spotify-album", postEnrichSpotifyAlbumDescription);
router.get("/enrich-spotify-album", (req, res) => {
  console.warn(
    "[artworks] GET /enrich-spotify-album (antes resolvía a /:id y 404). Usa POST /api/artworks/spotify/album-enrich"
  );
  res.status(405).set("Allow", "POST").json({
    message: "Este recurso solo admite POST",
    hint: "POST /api/artworks/spotify/album-enrich con JSON { artwork }",
  });
});

// Obtener una obra por ID (debe ir al final para no interferir con las rutas anteriores)
// GET /api/artworks/:id
router.get("/:id", getArtworkById);

module.exports = router;
