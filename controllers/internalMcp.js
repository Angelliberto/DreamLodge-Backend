const axios = require("axios");

/** Lee env sin espacios raros ni comillas envolventes. */
function trimEnv(name) {
  let v = process.env[name];
  if (v == null) return "";
  v = String(v).trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

async function fetchSpotifyClientCredentials() {
  const id = trimEnv("SPOTIFY_CLIENT_ID");
  const secret = trimEnv("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret) return null;
  try {
    const auth = Buffer.from(`${id}:${secret}`).toString("base64");
    const { data } = await axios.post(
      "https://accounts.spotify.com/api/token",
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 15000,
      }
    );
    if (!data?.access_token) return null;
    return {
      access_token: data.access_token,
      expires_in: data.expires_in || 3600,
    };
  } catch (e) {
    console.error("[internalMcp] Spotify client_credentials:", e.response?.data || e.message);
    return null;
  }
}

/** IGDB usa credenciales de aplicación Twitch (client id + secret). */
async function fetchTwitchAppToken() {
  const clientId = trimEnv("IGDB_CLIENT_ID");
  const clientSecret = trimEnv("IGDB_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  try {
    const { data } = await axios.post(
      "https://id.twitch.tv/oauth2/token",
      null,
      {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
        },
        timeout: 15000,
      }
    );
    if (!data?.access_token) return null;
    return {
      access_token: data.access_token,
      expires_in: data.expires_in || 3600,
    };
  } catch (e) {
    console.error("[internalMcp] Twitch OAuth:", e.response?.data || e.message);
    return null;
  }
}

/**
 * GET /api/internal/mcp/media-catalog-credentials
 * Responde tokens de corta duración y claves para APIs de medios (TMDB, Spotify, IGDB).
 * Requiere cabecera X-MCP-Internal-Secret.
 */
const getMediaCatalogCredentials = async (req, res) => {
  try {
    const [spotify, twitch] = await Promise.all([
      fetchSpotifyClientCredentials(),
      fetchTwitchAppToken(),
    ]);

    const tmdb = trimEnv("TMDB_API_KEY");

    return res.status(200).json({
      ok: true,
      tmdbApiKey: tmdb || null,
      spotifyAccessToken: spotify?.access_token || null,
      spotifyExpiresIn: spotify?.expires_in ?? null,
      igdbAccessToken: twitch?.access_token || null,
      igdbClientId: trimEnv("IGDB_CLIENT_ID") || null,
      igdbExpiresIn: twitch?.expires_in ?? null,
    });
  } catch (e) {
    console.error("[internalMcp] getMediaCatalogCredentials:", e);
    return res.status(500).json({ ok: false, message: "Error preparando credenciales" });
  }
};

module.exports = { getMediaCatalogCredentials };
