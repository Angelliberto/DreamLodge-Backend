/**
 * Agente IA Dream Lodge: Gemini + herramientas Mongo (orquestador).
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { normalizeWorkCandidateRows, chatGeminiCandidates } = require("./agentUtils");
const { generateArtisticDescription } = require("./artisticProfileService");
const { curatePersonalizedFeed } = require("./feedCurationService");
const {
  generateWithGemini: geminiGenerate,
  generateWithGeminiStream: geminiGenerateStream,
} = require("./geminiGeneration");
const { buildChatFullPrompt } = require("./chatPromptBuilder");
const { prepareChatTurn, buildChatProcessReturn } = require("./prepareChatTurn");
const messageIntent = require("./messageIntent");
const { executeTools: runAgentTools } = require("./agentTools");
const { logIaRecommendedWorks } = require("./iaLogRecommendedWorks");
const { recommendSimilarWorks: runRecommendSimilarWorks } = require("./recommendSimilarWorks");
const { CHAT_GEMINI_OPTS } = require("./chatConstants");

class DreamLodgeAIAgent {
  constructor() {
    this.apiKey = String(process.env.GEMINI_API_KEY || "").trim();
    this._genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
  }

  configured() {
    return Boolean(this._genAI && this.apiKey);
  }

  /**
   * @param {string} prompt
   * @param {{ purpose?: string, timeoutMs?: number, generationConfig?: object }} [options]
   */
  async generateWithGemini(prompt, options = {}) {
    return geminiGenerate(this._genAI, prompt, options);
  }

  /**
   * @param {string} prompt
   * @param {{ purpose?: string, timeoutMs?: number, generationConfig?: object }} [options]
   * @param {(cumulative: string) => void} [onChunk]
   */
  async generateWithGeminiStream(prompt, options = {}, onChunk) {
    return geminiGenerateStream(this._genAI, prompt, options, onChunk);
  }

  extractSearchParams(message) {
    return messageIntent.extractSearchParams(message);
  }

  extractArtworkId(message, contextItems) {
    return messageIntent.extractArtworkId(message, contextItems);
  }

  analyzeMessageAndSelectTools(userMessage, contextItems) {
    return messageIntent.analyzeMessageAndSelectTools(userMessage, contextItems);
  }

  async executeTools(tools, userMessage, ctx) {
    return runAgentTools(tools, userMessage, ctx);
  }

  async generateResponse(userMessage, systemPrompt, conversationHistory, toolResults) {
    const fullPrompt = buildChatFullPrompt(
      userMessage,
      systemPrompt,
      conversationHistory,
      toolResults
    );
    return this.generateWithGemini(fullPrompt, {
      ...CHAT_GEMINI_OPTS,
      modelCandidates: chatGeminiCandidates(),
    });
  }

  async generateResponseStream(
    userMessage,
    systemPrompt,
    conversationHistory,
    toolResults,
    onChunk
  ) {
    const fullPrompt = buildChatFullPrompt(
      userMessage,
      systemPrompt,
      conversationHistory,
      toolResults
    );
    return this.generateWithGeminiStream(fullPrompt, {
      ...CHAT_GEMINI_OPTS,
      modelCandidates: chatGeminiCandidates(),
    }, onChunk);
  }

  async processMessage(userMessage, { userId, conversationHistory, contextItems } = {}) {
    const prep = await prepareChatTurn(userMessage, {
      userId,
      conversationHistory,
      contextItems,
    });
    if (!this.configured()) {
      throw new Error(
        "El servicio de IA no está configurado (Gemini no disponible). Configura GEMINI_API_KEY."
      );
    }
    const aiResponse = await this.generateResponse(
      userMessage,
      prep.systemPrompt,
      prep.hist,
      prep.toolResults
    );
    return buildChatProcessReturn(prep, aiResponse);
  }

  async processMessageStream(
    userMessage,
    { userId, conversationHistory, contextItems } = {},
    onChunk
  ) {
    const prep = await prepareChatTurn(userMessage, {
      userId,
      conversationHistory,
      contextItems,
    });
    if (!this.configured()) {
      throw new Error(
        "El servicio de IA no está configurado (Gemini no disponible). Configura GEMINI_API_KEY."
      );
    }
    const aiResponse = await this.generateResponseStream(
      userMessage,
      prep.systemPrompt,
      prep.hist,
      prep.toolResults,
      onChunk
    );
    return buildChatProcessReturn(prep, aiResponse);
  }

  async generateConversationTitle({
    userMessage,
    assistantMessage = "",
    currentTitle = "",
  }) {
    const fallback = "Nueva conversación";
    const um = String(userMessage || "").trim();
    if (!um) return fallback;
    if (!this.configured()) {
      const ct = String(currentTitle || "").trim();
      return ct || um.slice(0, 40);
    }

    const prompt = [
      "Genera o mejora un título MUY corto en español para una conversación de chat.",
      "Reglas:",
      "- Máximo 5 palabras.",
      "- Sin comillas, sin emojis, sin punto final.",
      "- Debe sonar natural y específico al contexto.",
      currentTitle ? `Título actual: "${currentTitle}"` : "Título actual: (sin título útil aún)",
      `Último mensaje del usuario: "${um}"`,
      assistantMessage
        ? `Última respuesta del asistente: "${String(assistantMessage).slice(0, 240)}"`
        : "",
      "Devuelve SOLO el título.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const text = await this.generateWithGemini(prompt, {
        purpose: "título de conversación",
        timeoutMs: 12000,
      });
      let cleaned = String(text || "")
        .trim()
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
      return cleaned || currentTitle || um.slice(0, 40);
    } catch {
      return currentTitle || um.slice(0, 40);
    }
  }

  async generateArtisticDescription(oceanResult, options = {}) {
    return generateArtisticDescription(this, oceanResult, options, {
      logger: console,
      logIaRecommendedWorks,
    });
  }

  async curatePersonalizedFeed(oceanResult, artisticProfile) {
    return curatePersonalizedFeed(this, oceanResult, artisticProfile, {
      logger: console,
      logIaRecommendedWorks,
    });
  }

  async recommendSimilarWorks(artwork, options = {}) {
    return runRecommendSimilarWorks(this, artwork, options);
  }
}

let _agent = null;

function getAiAgent() {
  if (!_agent) _agent = new DreamLodgeAIAgent();
  return _agent;
}

module.exports = {
  DreamLodgeAIAgent,
  getAiAgent,
  normalizeWorkCandidateRows,
  logIaRecommendedWorks,
};
