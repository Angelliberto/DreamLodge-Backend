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
  const taskTimings = [];

  const runTool = async (tool) => {
    const startedAt = Date.now();
    try {
      if (tool === "search_artworks") {
        const sp = extractSearchParams(userMessage);
        const output = {
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
        taskTimings.push({ tool, ms: Date.now() - startedAt, ok: true });
        return output;
      }
      if (tool === "get_user_ocean_results" && userId) {
        const output = { key: "oceanResults", data: await db.getUserOceanResults(userId) };
        taskTimings.push({ tool, ms: Date.now() - startedAt, ok: true });
        return output;
      }
      if (tool === "get_user_favorites" && userId) {
        const output = { key: "favorites", data: await db.getUserFavorites(userId) };
        taskTimings.push({ tool, ms: Date.now() - startedAt, ok: true });
        return output;
      }
      if (tool === "get_artwork_by_id") {
        const aid = extractArtworkId(userMessage, ctx);
        if (aid) {
          const output = { key: "artwork", data: await db.getArtworkById(aid) };
          taskTimings.push({ tool, ms: Date.now() - startedAt, ok: true });
          return output;
        }
      }
    } catch (e) {
      taskTimings.push({ tool, ms: Date.now() - startedAt, ok: false });
      logger.error(`Error ejecutando herramienta ${tool}:`, e);
    }
    taskTimings.push({ tool, ms: Date.now() - startedAt, ok: true, skipped: true });
    return null;
  };

  const settled = await Promise.all(uniqueTools.map((t) => runTool(t)));
  for (const row of settled) {
    if (row?.key && row.data !== undefined) results[row.key] = row.data;
  }
  if (taskTimings.length) {
    const sorted = [...taskTimings].sort((a, b) => b.ms - a.ms);
    const slowest = sorted[0];
    logger.log(
      `[AI_TASK_TIMING] slowest=${slowest.tool} ${slowest.ms}ms totalTasks=${taskTimings.length}`
    );
    logger.log(`[AI_TASK_TIMING] breakdown=${JSON.stringify(sorted)}`);
  }
  return results;
}

module.exports = { executeTools };
