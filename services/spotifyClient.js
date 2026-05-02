const axios = require("axios");
const { getSpotifyMarket } = require("./contentLocaleConfig");

const TOKEN_URL = "https://accounts.spotify.com/api/token";

let _token = null;
let _exp = 0;

/**
 * Respuesta tipo Spotify (token fresco o sintetizada desde caché).
 * @throws {Error} code SPOTIFY_ENV si faltan credenciales; re-lanza errores de axios.
 */
async function getSpotifyClientCredentialsPayload() {
  const now = Date.now();
  if (_token && now < _exp - 120000) {
    return {
      access_token: _token,
      expires_in: Math.max(60, Math.floor((_exp - now) / 1000)),
      token_type: "Bearer",
    };
  }
  const id = (process.env.SPOTIFY_CLIENT_ID || "").replace(/\s/g, "").trim();
  const secret = (process.env.SPOTIFY_CLIENT_SECRET || "").replace(/\s/g, "").trim();
  if (!id || !secret) {
    const e = new Error("Spotify client credentials not configured");
    e.code = "SPOTIFY_ENV";
    throw e;
  }
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const { data } = await axios.post(TOKEN_URL, "grant_type=client_credentials", {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    timeout: 15000,
  });
  _token = data.access_token;
  _exp = now + (data.expires_in || 3600) * 1000;
  return data;
}

async function getSpotifyAccessToken() {
  try {
    const p = await getSpotifyClientCredentialsPayload();
    return p.access_token || null;
  } catch (_) {
    return null;
  }
}

async function fetchArtistGenres(token, artistId) {
  const id = String(artistId || "").trim();
  if (!id) return [];
  try {
    const { data } = await axios.get(`https://api.spotify.com/v1/artists/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    return Array.isArray(data?.genres) ? data.genres.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

/**
 * @param {string} query
 * @param {{ limit?: number, enrichCount?: number }} [opts]
 */
async function searchSpotifyAlbums(query, opts = {}) {
  const limit = opts.limit ?? 6;
  const enrichCount = opts.enrichCount ?? 3;
  const token = await getSpotifyAccessToken();
  if (!token) return [];
  try {
    const market = getSpotifyMarket();
    const { data } = await axios.get("https://api.spotify.com/v1/search", {
      params: { q: query, type: "album", limit, market },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    const items = data?.albums?.items || [];
    const head = await Promise.all(
      items.slice(0, enrichCount).map(async (album) => {
        if (album.genres?.length) return album;
        try {
          const det = await axios.get(`https://api.spotify.com/v1/albums/${album.id}`, {
            params: { market },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 12000,
          });
          const albumGenres = Array.isArray(det.data?.genres)
            ? det.data.genres.filter(Boolean)
            : [];
          if (albumGenres.length) {
            return { ...album, genres: albumGenres };
          }
          const artistId =
            det.data?.artists?.[0]?.id ||
            album.artists?.[0]?.id;
          const artistGenres = await fetchArtistGenres(token, artistId);
          return { ...album, genres: artistGenres };
        } catch (_) {
          const artistId = album.artists?.[0]?.id;
          const artistGenres = await fetchArtistGenres(token, artistId);
          if (artistGenres.length) {
            return { ...album, genres: artistGenres };
          }
          return album;
        }
      })
    );
    return [...head, ...items.slice(enrichCount)];
  } catch (_) {
    return [];
  }
}

async function searchSpotifyFirstAlbum(query) {
  const albums = await searchSpotifyAlbums(query, { enrichCount: 1 });
  return albums[0] || null;
}

module.exports = {
  getSpotifyClientCredentialsPayload,
  getSpotifyAccessToken,
  searchSpotifyAlbums,
  searchSpotifyFirstAlbum,
};
