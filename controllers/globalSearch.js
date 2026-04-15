const { runGlobalSearch } = require("../services/globalSearchService");

function parseListParam(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

async function globalSearch(req, res) {
  const q = req.query.q;
  const query = typeof q === "string" ? q : "";
  const filters = {
    categories: parseListParam(req.query.categories),
    cinemaType: typeof req.query.cinemaType === "string" ? req.query.cinemaType : "all",
    emotions: parseListParam(req.query.emotions),
    genres: parseListParam(req.query.genres),
    author: typeof req.query.author === "string" ? req.query.author : "",
    yearFrom: typeof req.query.yearFrom === "string" ? req.query.yearFrom : "",
    yearTo: typeof req.query.yearTo === "string" ? req.query.yearTo : "",
  };
  try {
    const items = await runGlobalSearch(query, filters);
    return res.json({ items });
  } catch (err) {
    console.error("globalSearch:", err);
    return res.status(500).json({ items: [] });
  }
}

module.exports = { globalSearch };
