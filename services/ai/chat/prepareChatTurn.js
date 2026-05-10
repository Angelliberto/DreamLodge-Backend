/**
 * Carga perfil, ejecuta herramientas y enriquece toolResults para un turno de chat.
 */
const db = require("./dbTools");
const { buildSystemPrompt } = require("./systemPrompts");
const { extractSearchParams, analyzeMessageAndSelectTools } = require("./messageIntent");
const { executeTools } = require("./agentTools");

async function prepareChatTurn(userMessage, { userId, conversationHistory, contextItems } = {}) {
  const hist = conversationHistory || [];
  const ctx = contextItems || [];

  let userInfo = null;
  let oceanResults = null;
  let favorites = [];

  if (userId) {
    const [basic, o, f] = await Promise.all([
      db.getUserBasicInfo(userId),
      db.getUserOceanResults(userId),
      db.getUserFavorites(userId),
    ]);
    userInfo = basic;
    if (o?.data) {
      oceanResults = Array.isArray(o.data) ? o.data : [o.data];
    }
    if (f?.data) {
      favorites = f.data;
    }
  }

  const systemPrompt = buildSystemPrompt({
    contextItems: ctx,
    oceanResults: oceanResults || [],
    favorites,
    userInfo,
  });

  const toolsToUse = analyzeMessageAndSelectTools(userMessage, ctx);
  let toolResults = await executeTools(toolsToUse, userMessage, {
    userId,
    contextItems: ctx,
  });

  const sp = extractSearchParams(userMessage);
  const shouldSearch =
    toolsToUse.includes("search_artworks") ||
    toolsToUse.includes("get_artwork_by_id") ||
    ctx.length > 0;

  if (shouldSearch && Object.keys(sp).length) {
    const art = toolResults.artworks || {};
    if (!art.data || !art.data.length) {
      const extra = await db.searchArtworks({
        category: sp.category,
        source: sp.source,
        title: sp.title,
        genre: sp.genre,
        limit: 20,
        page: 1,
      });
      if (extra.data && extra.data.length) {
        toolResults = { ...toolResults, artworks: extra };
      }
    }
  }

  if (oceanResults && oceanResults.length) {
    toolResults = { ...toolResults, oceanResults: { data: oceanResults } };
  }
  if (favorites.length) {
    toolResults = { ...toolResults, favorites: { data: favorites } };
  }

  return {
    hist,
    ctx,
    userInfo,
    oceanResults,
    favorites,
    systemPrompt,
    toolsToUse,
    toolResults,
  };
}

function buildChatProcessReturn(prep, aiResponse) {
  const { oceanResults, favorites, ctx, toolResults, toolsToUse } = prep;
  return {
    response: aiResponse,
    toolsUsed: toolsToUse,
    context: {
      hasOceanResults: Boolean(oceanResults && oceanResults.length),
      favoritesCount: favorites.length,
      contextItemsCount: ctx.length,
      artworksFound: toolResults.artworks && toolResults.artworks.data
        ? toolResults.artworks.data.length
        : 0,
    },
  };
}

module.exports = {
  prepareChatTurn,
  buildChatProcessReturn,
};
