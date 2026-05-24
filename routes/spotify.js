const express = require('express');
const router = express.Router();
const spotifyController = require('../controllers/spotify');

/**
 * @swagger
 * tags:
 *   name: Spotify
 *   description: Integración con Spotify
 */

/**
 * @swagger
 * /spotify/token:
 *   get:
 *     summary: Obtener token de acceso de Spotify
 *     tags: [Spotify]
 *     description: >
 *       Obtiene un token de acceso de Spotify usando Client Credentials Flow.
 *       Este token permite al frontend acceder a la API de Spotify sin autenticación de usuario.
 *     responses:
 *       200:
 *         description: Token obtenido correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                   description: Token de acceso de Spotify
 *                   example: "BQD..."
 *                 token_type:
 *                   type: string
 *                   example: "Bearer"
 *                 expires_in:
 *                   type: integer
 *                   description: Segundos hasta que expira el token
 *                   example: 3600
 *       500:
 *         description: Error al obtener el token
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   description: Error de variables de entorno
 *                   properties:
 *                     error:
 *                       type: string
 *                       example: "ENVIRONMENT_ERROR"
 *                     details:
 *                       type: string
 *                       example: "Client ID o Client Secret no están cargados en el backend. Revisa tu archivo .env."
 *                 - type: object
 *                   description: Error al contactar Spotify
 *                   properties:
 *                     error:
 *                       type: string
 *                       example: "TOKEN_FETCH_FAILED"
 *                     details:
 *                       type: object
 *                     status:
 *                       type: integer
 */
router.get('/token', spotifyController.getAppAccessToken);

module.exports = router;