/**
 * Carga perfil, ejecuta herramientas y enriquece toolResults para un turno de chat.
 * Perfil de usuario y executeTools corren en paralelo para acortar tiempo hasta Gemini.
 */
const db = require("./dbTools");
const { buildSystemPrompt } = require("./systemPrompts");
const { extractSearchParams, analyzeMessageAndSelectTools } = require("./messageIntent");
const { executeTools } = require("./agentTools");

async function prepareChatTurn(userMessage, { userId, conversationHistory, contextItems } = {}) {
  const tAll = Date.now();
  const hist = conversationHistory || [];
  const ctx = contextItems || [];
  const toolsToUse = analyzeMessageAndSelectTools(userMessage, ctx);

  const tParallel = Date.now();
  const userBlockPromise = userId
    ? Promise.all([
        db.getUserBasicInfo(userId),
        db.getUserOceanResults(userId),
        db.getUserFavorites(userId),
      ])
    : Promise.resolve([null, null, null]);

  const [userBlock, toolResultsFromTools] = await Promise.all([
    userBlockPromise,
    executeTools(toolsToUse, userMessage, {
      userId,
      contextItems: ctx,
    }),
  ]);
  const parallelWallMs = Date.now() - tParallel;

  let userInfo = null;
  let oceanResults = null;
  let favorites = [];

  if (userId && userBlock) {
    const [basic, o, f] = userBlock;
    userInfo = basic;
    if (o?.data) {
      oceanResults = Array.isArray(o.data) ? o.data : [o.data];
    }
    if (f?.data) {
      favorites = f.data;
    }
  }

  const tPrompt = Date.now();
  const systemPrompt = buildSystemPrompt({
    contextItems: ctx,
    oceanResults: oceanResults || [],
    favorites,
    userInfo,
  });
  const buildPromptMs = Date.now() - tPrompt;

  let toolResults = toolResultsFromTools;

  const sp = extractSearchParams(userMessage);
  const shouldSearch =
    toolsToUse.includes("search_artworks") ||
    toolsToUse.includes("get_artwork_by_id") ||
    ctx.length > 0;

  let extraSearchMs = 0;
  if (shouldSearch && Object.keys(sp).length) {
    const art = toolResults.artworks || {};
    if (!art.data || !art.data.length) {
      const tSearch = Date.now();
      const extra = await db.searchArtworks({
        category: sp.category,
        source: sp.source,
        title: sp.title,
        genre: sp.genre,
        limit: 20,
        page: 1,
      });
      extraSearchMs = Date.now() - tSearch;
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

  const totalMs = Date.now() - tAll;

  return {
    hist,
    ctx,
    userInfo,
    oceanResults,
    favorites,
    systemPrompt,
    toolsToUse,
    toolResults,
    /** Solo diagnóstico (logs); no enviar al cliente. */
    _timing: {
      totalMs,
      parallelWallMs,
      buildPromptMs,
      extraSearchMs,
    },
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
