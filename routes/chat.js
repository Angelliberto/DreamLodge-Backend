const express = require("express");
const router = express.Router();
const { sendMessage, getRecommendations } = require("../controllers/chat");
const { sessionMiddleware } = require("../middleware/session");

/**
 * @swagger
 * /api/chat/message:
 *   post:
 *     summary: Enviar un mensaje al agente IA
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: Mensaje del usuario
 *               conversationId:
 *                 type: string
 *                 description: ID de la conversación (opcional)
 *               contextItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: Items de contexto (obras culturales)
 *     responses:
 *       200:
 *         description: Mensaje procesado correctamente
 *       400:
 *         description: Error en la petición
 *       500:
 *         description: Error del servidor
 */
router.post("/message", sessionMiddleware, sendMessage);

/**
 * @swagger
 * /api/chat/recommendations:
 *   get:
 *     summary: Obtener recomendaciones personalizadas
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [cine, música, literatura, arte-visual, videojuegos]
 *         description: Categoría de las recomendaciones
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Número máximo de recomendaciones
 *     responses:
 *       200:
 *         description: Recomendaciones generadas correctamente
 *       401:
 *         description: Usuario no autenticado
 *       500:
 *         description: Error del servidor
 */
router.get("/recommendations", sessionMiddleware, getRecommendations);

module.exports = router;
