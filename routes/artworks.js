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

/**
 * @swagger
 * tags:
 *   name: Artworks
 *   description: Gestión de obras culturales
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Artwork:
 *       type: object
 *       required:
 *         - id
 *         - originalId
 *         - source
 *         - title
 *         - category
 *         - imageUrl
 *         - creator
 *       properties:
 *         id:
 *           type: string
 *           description: ID único lógico de la obra
 *         originalId:
 *           type: string
 *           description: ID original de la fuente (TMDB, Spotify, etc.)
 *         source:
 *           type: string
 *           description: Fuente de la obra (TMDB, Spotify, IGDB, etc.)
 *         title:
 *           type: string
 *           description: Título de la obra
 *         category:
 *           type: string
 *           enum: [cine, musica, literatura, videojuegos, arte-visual]
 *           description: Categoría de la obra
 *         imageUrl:
 *           type: string
 *           description: URL de la imagen
 *         creator:
 *           type: string
 *           description: Autor, director o artista
 *         year:
 *           type: number
 *           description: Año de lanzamiento
 *         description:
 *           type: string
 *           description: Descripción de la obra
 *         rating:
 *           type: number
 *           description: Puntuación
 *         metadata:
 *           type: object
 *           description: Metadatos adicionales
 */

/**
 * @swagger
 * /artworks:
 *   get:
 *     summary: Obtener todas las obras
 *     tags: [Artworks]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Límite de resultados por página
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [cine, musica, literatura, videojuegos, arte-visual]
 *         description: Filtrar por categoría
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *         description: Filtrar por fuente (TMDB, Spotify, etc.)
 *     responses:
 *       200:
 *         description: Lista de obras obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Artwork'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       500:
 *         description: Error del servidor
 */
router.get("/", getAllArtworks);

/**
 * @swagger
 * /artworks/favorites:
 *   get:
 *     summary: Obtener obras favoritas del usuario
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de favoritos obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Artwork'
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 *   post:
 *     summary: Añadir obra a favoritos
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               artwork:
 *                 $ref: '#/components/schemas/Artwork'
 *     responses:
 *       200:
 *         description: Obra añadida a favoritos correctamente
 *       400:
 *         description: Datos de la obra requeridos
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 */
router.get("/favorites", authUser, getFavorites);
router.post("/favorites", authUser, addToFavorites);

/**
 * @swagger
 * /artworks/favorites/{artworkId}:
 *   delete:
 *     summary: Remover obra de favoritos
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: artworkId
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId de la obra
 *     responses:
 *       200:
 *         description: Obra removida de favoritos correctamente
 *       400:
 *         description: ID inválido
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 */
router.delete("/favorites/:artworkId", authUser, removeFromFavorites);

/**
 * @swagger
 * /artworks/pending:
 *   get:
 *     summary: Obtener obras guardadas del usuario
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de guardados obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Artwork'
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 *   post:
 *     summary: Añadir obra a guardados
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               artwork:
 *                 $ref: '#/components/schemas/Artwork'
 *     responses:
 *       200:
 *         description: Obra añadida a guardados correctamente
 *       400:
 *         description: Datos de la obra requeridos
 *       401:
 *         description: No autenticado
 */
router.get("/pending", authUser, getPending);
router.post("/pending", authUser, addToPending);

/**
 * @swagger
 * /artworks/pending/{artworkId}:
 *   delete:
 *     summary: Quitar obra de guardados
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: artworkId
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId de la obra
 *     responses:
 *       200:
 *         description: Obra quitada de guardados correctamente
 *       400:
 *         description: ID inválido
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 */
router.delete("/pending/:artworkId", authUser, removeFromPending);

/**
 * @swagger
 * /artworks/disliked:
 *   get:
 *     summary: Obtener obras que no gustaron al usuario
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista obtenida correctamente
 *       401:
 *         description: No autenticado
 *   post:
 *     summary: Añadir obra a no me gustó
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               artwork:
 *                 $ref: '#/components/schemas/Artwork'
 *     responses:
 *       200:
 *         description: Obra añadida correctamente
 *       401:
 *         description: No autenticado
 */
router.get("/disliked", authUser, getDisliked);
router.post("/disliked", authUser, addToDisliked);

/**
 * @swagger
 * /artworks/disliked/{artworkId}:
 *   delete:
 *     summary: Remover obra de no me gustó
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: artworkId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Obra removida correctamente
 *       401:
 *         description: No autenticado
 */
router.delete("/disliked/:artworkId", authUser, removeFromDisliked);

/**
 * @swagger
 * /artworks/seen:
 *   get:
 *     summary: Obtener obras marcadas como ya vistas
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista obtenida correctamente
 *       401:
 *         description: No autenticado
 *   post:
 *     summary: Marcar obra como ya vista
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               artwork:
 *                 $ref: '#/components/schemas/Artwork'
 *     responses:
 *       200:
 *         description: Obra marcada correctamente
 *       401:
 *         description: No autenticado
 */
router.get("/seen", authUser, getSeen);
router.post("/seen", authUser, addToSeen);

/**
 * @swagger
 * /artworks/seen/{artworkId}:
 *   delete:
 *     summary: Remover obra de ya vistas
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: artworkId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Obra removida correctamente
 *       401:
 *         description: No autenticado
 */
router.delete("/seen/:artworkId", authUser, removeFromSeen);

/**
 * @swagger
 * /artworks/not-interested:
 *   get:
 *     summary: Obtener obras ocultas del feed
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista obtenida correctamente
 *       401:
 *         description: No autenticado
 *   post:
 *     summary: Ocultar obra del feed
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               artwork:
 *                 $ref: '#/components/schemas/Artwork'
 *     responses:
 *       200:
 *         description: Obra ocultada correctamente
 *       401:
 *         description: No autenticado
 */
router.get("/not-interested", authUser, getNotInterested);
router.post("/not-interested", authUser, addToNotInterested);

/**
 * @swagger
 * /artworks/not-interested/{artworkId}:
 *   delete:
 *     summary: Mostrar obra de nuevo en el feed
 *     tags: [Artworks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: artworkId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Obra mostrada de nuevo correctamente
 *       401:
 *         description: No autenticado
 */
router.delete("/not-interested/:artworkId", authUser, removeFromNotInterested);

/**
 * @swagger
 * /artworks/similar:
 *   post:
 *     summary: Obtener obras similares recomendadas por IA
 *     tags: [Artworks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - artwork
 *             properties:
 *               artwork:
 *                 $ref: '#/components/schemas/Artwork'
 *               limit:
 *                 type: integer
 *                 default: 3
 *                 minimum: 1
 *                 maximum: 6
 *                 description: Número de obras similares a devolver
 *               targetCategory:
 *                 type: string
 *                 enum: [cine, musica, literatura, videojuegos, arte-visual]
 *                 description: Categoría objetivo de las obras similares
 *     responses:
 *       200:
 *         description: Obras similares obtenidas correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Artwork'
 *                     cached:
 *                       type: boolean
 *       400:
 *         description: title y category son requeridos
 *       500:
 *         description: Error del servidor
 */
router.post("/similar", getSimilarArtworks);

/**
 * @swagger
 * /artworks/translate-description:
 *   post:
 *     summary: Traducir descripción al español usando IA
 *     tags: [Artworks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: Texto a traducir
 *     responses:
 *       200:
 *         description: Texto traducido correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     text:
 *                       type: string
 *                     alreadySpanish:
 *                       type: boolean
 *       400:
 *         description: text es requerido
 *       413:
 *         description: Texto demasiado largo
 *       503:
 *         description: Servicio de IA no disponible
 */
router.post("/translate-description", postTranslateArtworkDescription);

/**
 * @swagger
 * /artworks/spotify/album-enrich:
 *   post:
 *     summary: Generar descripción de álbum de Spotify usando IA
 *     tags: [Artworks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - artwork
 *             properties:
 *               artwork:
 *                 type: object
 *                 properties:
 *                   title:
 *                     type: string
 *                   creator:
 *                     type: string
 *                   category:
 *                     type: string
 *                   source:
 *                     type: string
 *                   description:
 *                     type: string
 *                   year:
 *                     type: number
 *                   metadata:
 *                     type: object
 *     responses:
 *       200:
 *         description: Descripción generada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     description:
 *                       type: string
 *       400:
 *         description: artwork es requerido
 *       500:
 *         description: Error del servidor
 */
router.post("/spotify/album-enrich", postEnrichSpotifyAlbumDescription);
router.get("/spotify/album-enrich", (req, res) => {
  console.warn("[artworks] GET /spotify/album-enrich ignorado; usar POST con body { artwork }");
  res.status(405).set("Allow", "POST").json({
    message: "Este recurso solo admite POST",
    hint: "POST /api/artworks/spotify/album-enrich con JSON { artwork }",
  });
});

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

/**
 * @swagger
 * /artworks/{id}:
 *   get:
 *     summary: Obtener una obra por su ID
 *     tags: [Artworks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID lógico o ObjectId de la obra
 *     responses:
 *       200:
 *         description: Obra obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Artwork'
 *       400:
 *         description: ID es requerido
 *       404:
 *         description: Obra no encontrada
 *       500:
 *         description: Error del servidor
 */
router.get("/:id", getArtworkById);

module.exports = router;