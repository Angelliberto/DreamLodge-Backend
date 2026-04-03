const { searchIgdbGames } = require("../services/igdbClient");
const { handleHTTPError } = require("../utils/handleHTTPError");

/**
 * Proxy IGDB para el frontend: { search: string } → mismos campos que el cliente interno.
 */
const searchGames = async (req, res) => {
  try {
    const { search } = req.body;
    if (!search) {
      return handleHTTPError(res, { message: "El término 'search' es requerido" }, 400);
    }
    const data = await searchIgdbGames(String(search), 20);
    res.json(data);
  } catch (error) {
    console.error("❌ Error en búsqueda IGDB:", error.response?.data || error.message);
    handleHTTPError(res, { message: "Error buscando juegos" }, 500);
  }
};

module.exports = { searchGames };
