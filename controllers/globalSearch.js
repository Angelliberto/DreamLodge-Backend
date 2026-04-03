const { runGlobalSearch } = require("../services/globalSearchService");

async function globalSearch(req, res) {
  const q = req.query.q;
  const query = typeof q === "string" ? q : "";
  try {
    const items = await runGlobalSearch(query);
    return res.json({ items });
  } catch (err) {
    console.error("globalSearch:", err);
    return res.status(500).json({ items: [] });
  }
}

module.exports = { globalSearch };
