const { handleHTTPError } = require("../utils/handleHTTPError");
const ai = require("../services/ai");
const chatPersistence = require("../services/chatPersistence");

/**
 * Enviar un mensaje al agente IA
 * POST /api/chat/message
 */
const sendMessage = async (req, res) => {
  try {
    const { message, conversationId, contextItems = [], currentTitle = "" } = req.body;
    const userId = req.user?._id || null;

    if (!message || !message.trim()) {
      return handleHTTPError(res, "El mensaje es requerido", 400);
    }

    const trimmedMessage = message.trim();
    let conversationHistory = [];
    let serverConversation = null;

    if (userId && conversationId && String(conversationId).trim()) {
      serverConversation = await chatPersistence.upsertConversationByClientKey(
        userId,
        conversationId,
        { title: currentTitle || "", contextItems: contextItems || [] }
      );
      if (serverConversation) {
        conversationHistory = await chatPersistence.getRecentHistory(
          serverConversation._id,
          14
        );
      }
    }

    console.log("📨 Procesando mensaje del usuario:", message.substring(0, 100));
    console.log("👤 UserId:", userId?.toString() || "No autenticado");
    console.log("📦 ContextItems:", contextItems?.length || 0);
    console.log("💬 Mensajes histórico (persistido):", conversationHistory?.length ?? 0);

    let result;
    try {
      result = await ai.processChatMessage({
        message: trimmedMessage,
        userId: userId?.toString(),
        conversationHistory,
        contextItems: contextItems || [],
        currentTitle: currentTitle || "",
      });
    } catch (aiErr) {
      console.error("Error IA (chat):", aiErr?.message || aiErr);
      const msg =
        aiErr?.response?.data?.error ||
        aiErr?.message ||
        "El servicio de IA no está disponible.";
      return handleHTTPError(res, msg, aiErr.statusCode || aiErr?.response?.status || 502);
    }

    const aiResponse =
      typeof result?.response === "string" ? result.response.trim() : "";
    if (!aiResponse) {
      return handleHTTPError(res, "La IA devolvió una respuesta vacía.", 502);
    }

    if (userId && serverConversation) {
      try {
        await chatPersistence.appendMessage(
          serverConversation._id,
          userId,
          "user",
          trimmedMessage
        );
        await chatPersistence.appendMessage(
          serverConversation._id,
          userId,
          "assistant",
          aiResponse
        );
      } catch (persistErr) {
        console.error("Error persistiendo mensajes del chat:", persistErr?.message || persistErr);
      }
    }

    const suggestedTitle = result.suggestedTitle ?? null;

    console.log("✅ Respuesta generada, enviando al cliente");
    console.log("📊 Contexto:", result.context);

    return res.status(200).json({
      message: "Mensaje procesado correctamente",
      data: {
        response: aiResponse,
        toolsUsed: result.toolsUsed,
        context: result.context,
        suggestedTitle,
        serverConversationId: serverConversation
          ? String(serverConversation._id)
          : undefined,
      },
    });
  } catch (error) {
    console.error("Error procesando mensaje:", error);
    const message = error && typeof error.message === 'string' ? error.message : 'Error al procesar el mensaje';
    return handleHTTPError(res, message, 500);
  }
};

/**
 * Obtener recomendaciones personalizadas para el usuario
 * GET /api/chat/recommendations
 */
const getRecommendations = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return handleHTTPError(res, { message: "Usuario no autenticado" }, 401);
    }

    const { category, limit = 10 } = req.query;

    const message = category
      ? `Recomiéndame ${limit} obras de la categoría ${category}`
      : `Recomiéndame ${limit} obras culturales`;

    let result;
    try {
      result = await ai.processChatMessage({
        message,
        userId: userId.toString(),
        conversationHistory: [],
        contextItems: [],
        currentTitle: '',
      });
    } catch (aiErr) {
      console.error('Error IA (recommendations):', aiErr?.message || aiErr);
      const msg =
        aiErr?.response?.data?.error ||
        aiErr?.message ||
        'El servicio de IA no está disponible.';
      return handleHTTPError(res, msg, aiErr.statusCode || aiErr?.response?.status || 502);
    }

    return res.status(200).json({
      message: "Recomendaciones generadas correctamente",
      data: result,
    });
  } catch (error) {
    console.error("Error generando recomendaciones:", error);
    const message = error && typeof error.message === 'string' ? error.message : 'Error al generar recomendaciones';
    return handleHTTPError(res, message, 500);
  }
};

/**
 * GET /api/chat/conversations
 * Lista conversaciones del usuario (persistidas).
 */
const listChatConversations = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return handleHTTPError(res, "Usuario no autenticado", 401);
    }
    const limit = req.query.limit != null ? Number(req.query.limit) : 80;
    const data = await chatPersistence.listConversations(userId, { limit });
    return res.status(200).json({ message: "ok", data });
  } catch (error) {
    console.error("Error listando conversaciones:", error);
    return handleHTTPError(
      res,
      error?.message || "Error al listar conversaciones",
      500
    );
  }
};

/**
 * GET /api/chat/conversations/:conversationRef/messages
 * conversationRef = ObjectId Mongo o clientKey del cliente.
 */
const getChatMessages = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return handleHTTPError(res, "Usuario no autenticado", 401);
    }
    const { conversationRef } = req.params;
    if (!conversationRef || !String(conversationRef).trim()) {
      return handleHTTPError(res, "Identificador de conversación requerido", 400);
    }
    const limit = req.query.limit != null ? Number(req.query.limit) : 500;
    const { conversation, messages } = await chatPersistence.listMessages(
      userId,
      conversationRef,
      { limit }
    );
    if (!conversation) {
      return handleHTTPError(res, "Conversación no encontrada", 404);
    }
    return res.status(200).json({ message: "ok", data: { conversation, messages } });
  } catch (error) {
    console.error("Error obteniendo mensajes del chat:", error);
    return handleHTTPError(
      res,
      error?.message || "Error al obtener mensajes",
      500
    );
  }
};

/**
 * DELETE /api/chat/conversations/:conversationRef
 */
const deleteChatConversation = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return handleHTTPError(res, "Usuario no autenticado", 401);
    }
    const { conversationRef } = req.params;
    const ok = await chatPersistence.softDeleteConversation(userId, conversationRef);
    if (!ok) {
      return handleHTTPError(res, "Conversación no encontrada", 404);
    }
    return res.status(200).json({ message: "Conversación eliminada" });
  } catch (error) {
    console.error("Error eliminando conversación:", error);
    return handleHTTPError(
      res,
      error?.message || "Error al eliminar conversación",
      500
    );
  }
};

module.exports = {
  sendMessage,
  getRecommendations,
  listChatConversations,
  getChatMessages,
  deleteChatConversation,
};
