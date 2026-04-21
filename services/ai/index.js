/**
 * Servicio de IA local (Gemini + Mongo + Serper). Sustituye el antiguo cliente HTTP al servidor MCP.
 */
const { getAiAgent } = require("./dreamLodgeAiAgent");

/**
 * @returns {Promise<{ response: string, toolsUsed: string[], context: object, suggestedTitle: string|null }>}
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

  let suggestedTitle = null;
  try {
    suggestedTitle = await agent.generateConversationTitle({
      userMessage: trimmed,
      assistantMessage: result.response || "",
      currentTitle: currentTitle || "",
    });
  } catch {
    suggestedTitle = (currentTitle || trimmed.slice(0, 40)) || null;
  }

  return {
    response: result.response,
    toolsUsed: result.toolsUsed,
    context: result.context,
    suggestedTitle,
  };
}

async function generateArtisticDescription(oceanResult, options) {
  return getAiAgent().generateArtisticDescription(oceanResult, options);
}

async function curatePersonalizedFeed({ oceanResult, artisticProfile }) {
  return getAiAgent().curatePersonalizedFeed(oceanResult, artisticProfile);
}

async function recommendSimilarWorks(artwork, options = {}) {
  return getAiAgent().recommendSimilarWorks(artwork, options);
}

function isGeminiConfigured() {
  return getAiAgent().configured();
}

module.exports = {
  processChatMessage,
  generateArtisticDescription,
  curatePersonalizedFeed,
  recommendSimilarWorks,
  isGeminiConfigured,
};
