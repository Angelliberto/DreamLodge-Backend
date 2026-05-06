const express = require("express");
const router = express.Router();
const {
  sendMessage,
  sendMessageStream,
  getRecommendations,
  listChatConversations,
  getChatMessages,
  deleteChatConversation,
} = require("../controllers/chat");
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
if (typeof listChatConversations !== 'function') {
  console.error('ERROR: listChatConversations no es una función.');
  throw new Error('listChatConversations debe ser una función');
}
if (typeof getChatMessages !== 'function') {
  console.error('ERROR: getChatMessages no es una función.');
  throw new Error('getChatMessages debe ser una función');
}
if (typeof deleteChatConversation !== 'function') {
  console.error('ERROR: deleteChatConversation no es una función.');
  throw new Error('deleteChatConversation debe ser una función');
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

/** Igual que POST /message pero respuesta NDJSON con chunks (texto acumulado). Requiere stream en cliente. */
router.post("/message/stream", authUser, sendMessageStream);

/** GET lista de conversaciones persistidas para el usuario */
router.get("/conversations", authUser, listChatConversations);

/** GET mensajes; :conversationRef = Mongo _id (24 hex) o clientKey (p. ej. conv_…) */
router.get("/conversations/:conversationRef/messages", authUser, getChatMessages);

/** DELETE borrado suave */
router.delete("/conversations/:conversationRef", authUser, deleteChatConversation);

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
