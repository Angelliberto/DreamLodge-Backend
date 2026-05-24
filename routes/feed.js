const express = require("express");
const router = express.Router();
const { authUser } = require("../middleware/session");
const {
  getPersonalizedFeedCurated,
  getPersonalizedFeedBuildStatus,
  rebuildPersonalizedFeed,
} = require("../controllers/feed");

/**
 * @swagger
 * tags:
 *   name: Feed
 *   description: Feed personalizado de obras culturales
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     FeedItem:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         title:
 *           type: string
 *         category:
 *           type: string
 *           enum: [cine, musica, literatura, videojuegos, arte-visual]
 *         creator:
 *           type: string
 *         imageUrl:
 *           type: string
 *         description:
 *           type: string
 *         rating:
 *           type: number
 *         metadata:
 *           type: object
 *     FeedResponse:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FeedItem'
 *         oceanItems:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FeedItem'
 *         recommendationMode:
 *           type: string
 *           enum: [ocean, favorites]
 *         webSearchUsed:
 *           type: boolean
 *         reason:
 *           type: string
 *         cached:
 *           type: boolean
 *         buildStatus:
 *           type: string
 *           enum: [ready, building, failed]
 *         buildId:
 *           type: string
 *         buildVersion:
 *           type: integer
 *         generatedAt:
 *           type: integer
 */

/**
 * @swagger
 * /feed/personalized:
 *   get:
 *     summary: Obtener feed personalizado curado por IA
 *     tags: [Feed]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: force
 *         schema:
 *           type: string
 *           enum: ["0", "1"]
 *         description: Forzar regeneración ignorando caché
 *       - in: query
 *         name: anchorsOnly
 *         schema:
 *           type: string
 *           enum: ["0", "1"]
 *         description: Devolver solo obras del perfil artístico sin curación IA
 *       - in: query
 *         name: preferFavorites
 *         schema:
 *           type: string
 *           enum: ["0", "1"]
 *         description: Modo favoritos, recomienda obras similares a los favoritos del usuario
 *       - in: query
 *         name: async
 *         schema:
 *           type: string
 *           enum: ["0", "1"]
 *         description: Modo async, devuelve respuesta inmediata y construye el feed en segundo plano
 *     responses:
 *       200:
 *         description: Feed obtenido correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/FeedResponse'
 *       401:
 *         description: No autenticado
 *       502:
 *         description: Error del servicio de IA
 *   post:
 *     summary: Obtener feed personalizado curado por IA (alias POST)
 *     tags: [Feed]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               force:
 *                 type: boolean
 *                 description: Forzar regeneración ignorando caché
 *               preferFavorites:
 *                 type: boolean
 *                 description: Modo favoritos
 *               async:
 *                 type: boolean
 *                 description: Modo async
 *     responses:
 *       200:
 *         description: Feed obtenido correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/FeedResponse'
 *       401:
 *         description: No autenticado
 *       502:
 *         description: Error del servicio de IA
 */
router.get("/personalized", authUser, getPersonalizedFeedCurated);
router.post("/personalized", authUser, getPersonalizedFeedCurated);

/**
 * @swagger
 * /feed/personalized/status:
 *   get:
 *     summary: Consultar el estado del build del feed
 *     tags: [Feed]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: preferFavorites
 *         schema:
 *           type: string
 *           enum: ["0", "1"]
 *         description: Consultar estado del feed en modo favoritos
 *     responses:
 *       200:
 *         description: Estado del build obtenido correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     buildId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [ready, running, failed]
 *                     version:
 *                       type: integer
 *                     startedAt:
 *                       type: integer
 *                     finishedAt:
 *                       type: integer
 *                     error:
 *                       type: string
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.get("/personalized/status", authUser, getPersonalizedFeedBuildStatus);

/**
 * @swagger
 * /feed/personalized/rebuild:
 *   post:
 *     summary: Iniciar reconstrucción del feed en segundo plano
 *     tags: [Feed]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: preferFavorites
 *         schema:
 *           type: string
 *           enum: ["0", "1"]
 *         description: Reconstruir el feed en modo favoritos
 *     responses:
 *       202:
 *         description: Rebuild iniciado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: accepted
 *                 data:
 *                   type: object
 *                   properties:
 *                     buildStatus:
 *                       type: string
 *                     buildId:
 *                       type: string
 *                     buildVersion:
 *                       type: integer
 *       200:
 *         description: No hay perfil OCEAN, no se puede reconstruir
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.post("/personalized/rebuild", authUser, rebuildPersonalizedFeed);

module.exports = router;