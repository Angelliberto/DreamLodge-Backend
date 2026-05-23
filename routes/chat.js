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
 * tags:
 *   name: Chat
 *   description: Chat con agente IA y gestión de conversaciones
 */

/**
 * @swagger
 * /chat/message:
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
 *               currentTitle:
 *                 type: string
 *                 description: Título actual de la conversación
 *     responses:
 *       200:
 *         description: Mensaje procesado correctamente
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
 *                     response:
 *                       type: string
 *                     toolsUsed:
 *                       type: array
 *                       items:
 *                         type: string
 *                     context:
 *                       type: object
 *                     suggestedTitle:
 *                       type: string
 *                     serverConversationId:
 *                       type: string
 *       400:
 *         description: El mensaje es requerido
 *       502:
 *         description: Servicio de IA no disponible
 *       500:
 *         description: Error del servidor
 */
router.post("/message", authUser, sendMessage);

/**
 * @swagger
 * /chat/message/stream:
 *   post:
 *     summary: Enviar un mensaje al agente IA con respuesta en streaming (NDJSON)
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
 *                 description: Items de contexto
 *               currentTitle:
 *                 type: string
 *                 description: Título actual de la conversación
 *     responses:
 *       200:
 *         description: Stream NDJSON con chunks de texto y evento done al final
 *         content:
 *           application/x-ndjson:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   enum: [status, chunk, done, error]
 *                 text:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: El mensaje es requerido
 *       502:
 *         description: Servicio de IA no disponible
 */
router.post("/message/stream", authUser, sendMessageStream);

/**
 * @swagger
 * /chat/conversations:
 *   get:
 *     summary: Listar conversaciones del usuario
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 80
 *         description: Número máximo de conversaciones a devolver
 *     responses:
 *       200:
 *         description: Lista de conversaciones obtenida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                       updatedAt:
 *                         type: string
 *       401:
 *         description: Usuario no autenticado
 *       500:
 *         description: Error del servidor
 */
router.get("/conversations", authUser, listChatConversations);

/**
 * @swagger
 * /chat/conversations/{conversationRef}/messages:
 *   get:
 *     summary: Obtener mensajes de una conversación
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationRef
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId de Mongo o clientKey de la conversación
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 500
 *         description: Número máximo de mensajes a devolver
 *     responses:
 *       200:
 *         description: Mensajes obtenidos correctamente
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
 *                     conversation:
 *                       type: object
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                             enum: [user, assistant]
 *                           content:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *       400:
 *         description: Identificador de conversación requerido
 *       401:
 *         description: Usuario no autenticado
 *       404:
 *         description: Conversación no encontrada
 *       500:
 *         description: Error del servidor
 */
router.get("/conversations/:conversationRef/messages", authUser, getChatMessages);

/**
 * @swagger
 * /chat/conversations/{conversationRef}:
 *   delete:
 *     summary: Eliminar una conversación (borrado suave)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationRef
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId de Mongo o clientKey de la conversación
 *     responses:
 *       200:
 *         description: Conversación eliminada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Usuario no autenticado
 *       404:
 *         description: Conversación no encontrada
 *       500:
 *         description: Error del servidor
 */
router.delete("/conversations/:conversationRef", authUser, deleteChatConversation);

/**
 * @swagger
 * /chat/recommendations:
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       401:
 *         description: Usuario no autenticado
 *       502:
 *         description: Servicio de IA no disponible
 *       500:
 *         description: Error del servidor
 */
router.get("/recommendations", authUser, getRecommendations);

module.exports = router;