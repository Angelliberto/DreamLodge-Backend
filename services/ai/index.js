/**
 * Servicio de IA local (Gemini + Mongo). Sustituye el antiguo cliente HTTP al servidor MCP.
 */
const { getAiAgent } = require("./core/dreamLodgeAiAgent");

/**
 * @returns {Promise<{ response: string, toolsUsed: string[], context: object, suggestedTitle: null }>}
 */
async function processChatMessage({
  message,
  userId,
  conversationHistory = [],
  contextItems = [],
  currentTitle = "",
}) {
  const agent = getAiAgent();
  const trimmed = String(message || "").trim();
  const result = await agent.processMessage(trimmed, {
    userId: userId || undefined,
    conversationHistory,
    contextItems,
  });

  // Se desactiva la generación automática de títulos para análisis/chat.
  const suggestedTitle = null;

  return {
    response: result.response,
    toolsUsed: result.toolsUsed,
    context: result.context,
    recommendedItems: result.recommendedItems ?? [],
    suggestedTitle,
  };
}

/**
 * Misma lógica que processChatMessage pero la respuesta final se genera con Gemini en streaming.
 * @param {(cumulativeText: string) => void} onChunk
 * @param {(phase: string) => void} [onPhase] preparing | generating
 */
async function processChatMessageStream(
  { message, userId, conversationHistory = [], contextItems = [], currentTitle = "" },
  onChunk,
  onPhase
) {
  const agent = getAiAgent();
  const trimmed = String(message || "").trim();
  const result = await agent.processMessageStream(
    trimmed,
    {
      userId: userId || undefined,
      conversationHistory,
      contextItems,
    },
    onChunk,
    onPhase
  );
  const suggestedTitle = null;
  return {
    response: result.response,
    toolsUsed: result.toolsUsed,
    context: result.context,
    recommendedItems: result.recommendedItems ?? [],
    suggestedTitle,
  };
}

async function generateArtisticDescription(oceanResult, options) {
  return getAiAgent().generateArtisticDescription(oceanResult, options);
}

async function curatePersonalizedFeed({ oceanResult }) {
  return getAiAgent().curatePersonalizedFeed(oceanResult);
}

async function recommendSimilarWorks(artwork, options = {}) {
  return getAiAgent().recommendSimilarWorks(artwork, options);
}

function isGeminiConfigured() {
  return getAiAgent().configured();
}

module.exports = {
  processChatMessage,
  processChatMessageStream,
  generateArtisticDescription,
  curatePersonalizedFeed,
  recommendSimilarWorks,
  isGeminiConfigured,
};
