const { handleHTTPError } = require("../utils/handleHTTPError");
const aiAgent = require("../services/aiAgent");
const { UserModel } = require("../models");

/**
 * Enviar un mensaje al agente IA
 * POST /api/chat/message
 */
const sendMessage = async (req, res) => {
  try {
    const { message, conversationId, contextItems = [] } = req.body;
    const userId = req.user?._id || null;

    if (!message || !message.trim()) {
      return handleHTTPError(res, { message: "El mensaje es requerido" }, 400);
    }

    // Obtener historial de conversación si existe (por ahora lo dejamos vacío)
    // En el futuro, se puede almacenar en MongoDB
    const conversationHistory = [];

    // Procesar el mensaje con el agente IA
    const result = await aiAgent.processMessage(message.trim(), {
      userId: userId?.toString(),
      conversationHistory,
      contextItems: contextItems || [],
    });

    return res.status(200).json({
      message: "Mensaje procesado correctamente",
      data: {
        response: result.response,
        toolsUsed: result.toolsUsed,
        context: result.context,
      },
    });
  } catch (error) {
    console.error("Error procesando mensaje:", error);
    return handleHTTPError(res, {
      message: "Error al procesar el mensaje",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    }, 500);
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

    const result = await aiAgent.processMessage(message, {
      userId: userId.toString(),
      conversationHistory: [],
      contextItems: [],
    });

    return res.status(200).json({
      message: "Recomendaciones generadas correctamente",
      data: result,
    });
  } catch (error) {
    console.error("Error generando recomendaciones:", error);
    return handleHTTPError(res, {
      message: "Error al generar recomendaciones",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    }, 500);
  }
};

module.exports = {
  sendMessage,
  getRecommendations,
};
