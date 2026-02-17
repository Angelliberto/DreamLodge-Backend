// controllers/igdb.js
const axios = require('axios');
const { handleHTTPError } = require("../utils/handleHTTPError");

// Carga de variables (con limpieza de espacios)
const CLIENT_ID = process.env.IGDB_CLIENT_ID ? process.env.IGDB_CLIENT_ID.trim() : null;
const CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET ? process.env.IGDB_CLIENT_SECRET.trim() : null;

let cachedToken = null;
let tokenExpirationTime = 0;

// --- Función Auxiliar Privada para obtener Token ---
const getInternalToken = async () => {
    const currentTime = Date.now();
    if (cachedToken && currentTime < tokenExpirationTime - 60000) return cachedToken;

    try {
        console.log('🔄 Renovando token interno...');
        const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'client_credentials'
            }
        });
        cachedToken = response.data.access_token;
        tokenExpirationTime = currentTime + (response.data.expires_in * 1000);
        return cachedToken;
    } catch (error) {
        throw new Error("Fallo al obtener token de Twitch: " + error.message);
    }
};

/**
 * Endpoint: Buscar Juegos (Proxy)
 * Recibe { query: "Mario" } desde el frontend
 */
const searchGames = async (req, res) => {
    try {
        const { search } = req.body; // Recibimos el término de búsqueda
        
        if (!search) {
            return handleHTTPError(res, { message: "El término 'search' es requerido" }, 400);
        }

        // 1. Obtenemos token (el backend se encarga)
        const token = await getInternalToken();

        // 2. Preparamos la query de IGDB con más campos para tags
        const igdbBody = `
            fields name, cover.url, rating, summary, first_release_date, genres.name, platforms.name, platforms.abbreviation, game_modes.name, involved_companies.company.name;
            search "${search}";
            limit 20;
        `;

        // 3. El Backend llama a IGDB (Servidor a Servidor no tiene CORS)
        const response = await axios.post('https://api.igdb.com/v4/games', igdbBody, {
            headers: {
                'Client-ID': CLIENT_ID,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'text/plain'
            }
        });

        // 4. Devolvemos los datos limpios al frontend
        res.json(response.data);

    } catch (error) {
        console.error("❌ Error en búsqueda IGDB:", error.response?.data || error.message);
        handleHTTPError(res, { message: "Error buscando juegos" }, 500);
    }
};

// Exportamos ambas funciones (por si necesitas el token suelto también)
module.exports = { searchGames };