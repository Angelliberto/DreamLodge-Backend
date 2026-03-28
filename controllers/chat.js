const { handleHTTPError } = require("../utils/handleHTTPError");
const mcpAi = require("../utils/mcpAiClient");

/**
 * Enviar un mensaje al agente IA
 * POST /api/chat/message
 */
const sendMessage = async (req, res) => {
  try {
    const { message, conversationId, contextItems = [], currentTitle = '' } = req.body;
    const userId = req.user?._id || null;

    if (!message || !message.trim()) {
      return handleHTTPError(res, { message: "El mensaje es requerido" }, 400);
    }

    // Obtener historial de conversación si existe (por ahora lo dejamos vacío)
    // En el futuro, se puede almacenar en MongoDB
    const conversationHistory = [];

    console.log('📨 Procesando mensaje del usuario:', message.substring(0, 100));
    console.log('👤 UserId:', userId?.toString() || 'No autenticado');
    console.log('📦 ContextItems:', contextItems?.length || 0);

    const trimmedMessage = message.trim();

    let result;
    try {
      result = await mcpAi.processChatMessage({
        message: trimmedMessage,
        userId: userId?.toString(),
        conversationHistory,
        contextItems: contextItems || [],
        currentTitle: currentTitle || '',
      });
    } catch (mcpErr) {
      console.error('Error MCP IA (chat):', mcpErr?.message || mcpErr);
      const msg =
        mcpErr?.response?.data?.error ||
        mcpErr?.message ||
        'El servicio de IA no está disponible.';
      return handleHTTPError(
        res,
        { message: msg },
        mcpErr.statusCode || mcpErr?.response?.status || 502
      );
    }

    const suggestedTitle = result.suggestedTitle ?? null;

    console.log('✅ Respuesta generada, enviando al cliente');
    console.log('📊 Contexto:', result.context);

    return res.status(200).json({
      message: "Mensaje procesado correctamente",
      data: {
        response: result.response,
        toolsUsed: result.toolsUsed,
        context: result.context,
        suggestedTitle,
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

    // Procesar solicitud de recomendaciones
    const message = category
      ? `Recomiéndame ${limit} obras de la categoría ${category}`
      : `Recomiéndame ${limit} obras culturales`;

    let result;
    try {
      result = await mcpAi.processChatMessage({
        message,
        userId: userId.toString(),
        conversationHistory: [],
        contextItems: [],
        currentTitle: '',
      });
    } catch (mcpErr) {
      console.error('Error MCP IA (recommendations):', mcpErr?.message || mcpErr);
      const msg =
        mcpErr?.response?.data?.error ||
        mcpErr?.message ||
        'El servicio de IA no está disponible.';
      return handleHTTPError(
        res,
        { message: msg },
        mcpErr.statusCode || mcpErr?.response?.status || 502
      );
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

module.exports = {
  sendMessage,
  getRecommendations,
};
