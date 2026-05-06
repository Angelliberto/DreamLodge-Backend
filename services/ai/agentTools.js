/**
 * Ejecución de herramientas Mongo/búsqueda para el agente de chat.
 */
const db = require("./dbTools");
const { extractSearchParams, extractArtworkId } = require("./messageIntent");

const logger = console;

async function executeTools(tools, userMessage, { userId, contextItems } = {}) {
  const results = {};
  const ctx = contextItems || [];
  const uniqueTools = [...new Set(tools || [])];

  const runTool = async (tool) => {
    try {
      if (tool === "search_artworks") {
        const sp = extractSearchParams(userMessage);
        return {
          key: "artworks",
          data: await db.searchArtworks({
            category: sp.category,
            source: sp.source,
            title: sp.title,
            genre: sp.genre,
            limit: 20,
            page: 1,
          }),
        };
      }
      if (tool === "get_user_ocean_results" && userId) {
        return { key: "oceanResults", data: await db.getUserOceanResults(userId) };
      }
      if (tool === "get_user_favorites" && userId) {
        return { key: "favorites", data: await db.getUserFavorites(userId) };
      }
      if (tool === "get_artwork_by_id") {
        const aid = extractArtworkId(userMessage, ctx);
        if (aid) return { key: "artwork", data: await db.getArtworkById(aid) };
      }
    } catch (e) {
      logger.error(`Error ejecutando herramienta ${tool}:`, e);
    }
    return null;
  };

  const settled = await Promise.all(uniqueTools.map((t) => runTool(t)));
  for (const row of settled) {
    if (row?.key && row.data !== undefined) results[row.key] = row.data;
  }
  return results;
}

module.exports = { executeTools };
