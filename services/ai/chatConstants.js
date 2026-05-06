/**
 * Configuración compartida del flujo de chat (Gemini).
 */
const CHAT_GEMINI_OPTS = {
  purpose: "respuesta de chat",
  timeoutMs: 32000,
  generationConfig: {
    temperature: 0.72,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 1400,
  },
};

module.exports = {
  CHAT_GEMINI_OPTS,
};
