const { handleHTTPError } = require("../utils/handleHTTPError");
const { UserModel } = require("../models");

// Cargar aiAgent de forma segura
let aiAgent;
try {
  aiAgent = require("../services/aiAgent");
} catch (error) {
  console.error('Error cargando aiAgent:', error);
  // Crear un objeto mock para evitar que el módulo falle completamente
  aiAgent = {
    processMessage: async () => {
      return {
        response: 'El servicio de IA no está disponible en este momento.',
        toolsUsed: [],
        context: {}
      };
    }
  };
}

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

    // Procesar el mensaje con el agente IA
    const result = await aiAgent.processMessage(trimmedMessage, {
      userId: userId?.toString(),
      conversationHistory,
      contextItems: contextItems || [],
    });

    let suggestedTitle = null;
    try {
      if (typeof aiAgent.generateConversationTitle === 'function') {
        suggestedTitle = await aiAgent.generateConversationTitle({
          userMessage: trimmedMessage,
          assistantMessage: result.response,
          currentTitle
        });
      }
    } catch (titleError) {
      console.warn('No se pudo generar título de conversación:', titleError?.message);
    }

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
    const message = error && typeof error.message === 'string' ? error.message : 'Error al generar recomendaciones';
    return handleHTTPError(res, message, 500);
  }
};

module.exports = {
  sendMessage,
  getRecommendations,
};
