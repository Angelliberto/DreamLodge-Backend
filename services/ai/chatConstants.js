/**
 * Configuración compartida del flujo de chat (Gemini).
 */
const CHAT_GEMINI_OPTS = {
  purpose: "respuesta de chat",
  timeoutMs: 90000,
  generationConfig: {
    temperature: 0.65,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 8192,
  },
};

module.exports = {
  CHAT_GEMINI_OPTS,
};
