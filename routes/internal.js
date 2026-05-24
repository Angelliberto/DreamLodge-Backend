const express = require("express");
const router = express.Router();
const { mcpInternalOnly } = require("../middleware/mcpInternalAuth");
const { getMediaCatalogCredentials } = require("../controllers/internalMcp");

/**
 * @swagger
 * tags:
 *   name: Internal
 *   description: Endpoints internos para MCP (requieren cabecera secreta)
 */

/**
 * @swagger
 * /internal/mcp/media-catalog-credentials:
 *   get:
 *     summary: Obtener credenciales de APIs de medios para MCP
 *     tags: [Internal]
 *     description: >
 *       Devuelve tokens de corta duración y claves para TMDB, Spotify e IGDB.
 *       Requiere la cabecera `X-MCP-Internal-Secret` con el valor correcto.
 *       Solo accesible desde servicios internos.
 *     parameters:
 *       - in: header
 *         name: X-MCP-Internal-Secret
 *         required: true
 *         schema:
 *           type: string
 *         description: Clave secreta interna para autenticar la petición
 *     responses:
 *       200:
 *         description: Credenciales obtenidas correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 tmdbApiKey:
 *                   type: string
 *                   description: Clave de API de TMDB
 *                   example: "abc123"
 *                 spotifyAccessToken:
 *                   type: string
 *                   description: Token de acceso de Spotify
 *                   example: "BQD..."
 *                 spotifyExpiresIn:
 *                   type: integer
 *                   description: Segundos hasta que expira el token de Spotify
 *                   example: 3600
 *                 igdbAccessToken:
 *                   type: string
 *                   description: Token de acceso de IGDB (Twitch)
 *                   example: "abc..."
 *                 igdbClientId:
 *                   type: string
 *                   description: Client ID de IGDB
 *                   example: "xyz..."
 *                 igdbExpiresIn:
 *                   type: integer
 *                   description: Segundos hasta que expira el token de IGDB
 *                   example: 3600
 *       401:
 *         description: Cabecera secreta incorrecta o ausente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized"
 *       500:
 *         description: Error preparando credenciales
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Error preparando credenciales"
 */
router.get("/mcp/media-catalog-credentials", mcpInternalOnly, getMediaCatalogCredentials);

module.exports = router;