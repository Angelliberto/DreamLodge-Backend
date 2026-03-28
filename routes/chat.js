const express = require("express");
const router = express.Router();
const { sendMessage, getRecommendations } = require("../controllers/chat");
const { authUser } = require("../middleware/session");

// Validar que las funciones existan antes de usarlas
if (typeof sendMessage !== 'function') {
  console.error('ERROR: sendMessage no es una función. Tipo:', typeof sendMessage);
  throw new Error('sendMessage debe ser una función');
}
if (typeof getRecommendations !== 'function') {
  console.error('ERROR: getRecommendations no es una función. Tipo:', typeof getRecommendations);
  throw new Error('getRecommendations debe ser una función');
}
if (typeof authUser !== 'function') {
  console.error('ERROR: authUser no es una función. Tipo:', typeof authUser);
  throw new Error('authUser debe ser una función');
}

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
 *       502:
 *         description: Servicio de IA (MCP) no disponible o error al contactarlo
 */
router.post("/message", authUser, sendMessage);

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
 *       502:
 *         description: Servicio de IA (MCP) no disponible o error al contactarlo
 */
router.get("/recommendations", authUser, getRecommendations);

module.exports = router;
