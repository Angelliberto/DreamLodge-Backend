/**
 * Extracción de intención de búsqueda y selección de herramientas desde el mensaje del usuario.
 */
const { normalizeForIntent } = require("./agentUtils");

function extractSearchParams(message) {
  const params = {};
  const normalized = normalizeForIntent(message);

  const categoryMap = {
    cine: [
      "cine",
      "pelicula",
      "peliculas",
      "peli",
      "pelis",
      "movie",
      "film",
      "films",
      "cinema",
    ],
    música: [
      "musica",
      "cancion",
      "canciones",
      "song",
      "songs",
      "album",
      "albums",
      "disco",
      "musical",
    ],
    literatura: [
      "literatura",
      "libro",
      "libros",
      "book",
      "books",
      "novela",
      "novelas",
      "leer",
      "lectura",
    ],
    "arte-visual": [
      "arte",
      "artista",
      "artistas",
      "pintura",
      "pinturas",
      "art",
      "visual",
      "cuadro",
      "cuadros",
    ],
    videojuegos: [
      "videojuego",
      "videojuegos",
      "juego",
      "juegos",
      "game",
      "games",
      "gaming",
    ],
  };

  for (const [cat, keywords] of Object.entries(categoryMap)) {
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        params.category = cat;
        break;
      }
    }
    if (params.category) break;
  }

  const generos = {
    drama: ["drama", "dramatico", "dramatica", "dramaticos", "dramaticas"],
    comedia: [
      "comedia",
      "comico",
      "comica",
      "comicos",
      "comicas",
      "humor",
      "gracioso",
      "graciosa",
    ],
    "ciencia ficción": [
      "ciencia ficcion",
      "scifi",
      "sci-fi",
      "futurista",
      "futuro",
      "espacial",
    ],
    fantasía: [
      "fantasia",
      "fantasioso",
      "fantasiosa",
      "magia",
      "magico",
      "magica",
    ],
    terror: ["terror", "horror", "miedo", "escalofriante", "suspenso"],
    acción: ["accion", "aventura", "aventurero", "aventurera"],
    romance: ["romance", "romantico", "romantica", "amor", "amoroso", "amorosa"],
    thriller: ["thriller", "suspense", "intriga", "misterio"],
  };

  for (const [genero, keywords] of Object.entries(generos)) {
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        params.genre = genero;
        break;
      }
    }
    if (params.genre) break;
  }

  const sourceKeywords = [
    ["tmdb", "TMDB"],
    ["spotify", "Spotify"],
    ["igdb", "IGDB"],
    ["openlibrary", "OpenLibrary"],
    ["googlebooks", "OpenLibrary"],
  ];
  for (const [kw, canonical] of sourceKeywords) {
    if (normalized.includes(kw)) {
      params.source = canonical;
      break;
    }
  }

  let titleMatch =
    message.match(/"([^"]+)"/) ||
    message.match(/título[:\s]+(.+?)(?:\.|$)/i) ||
    message.match(/llamad[oa][:\s]+(.+?)(?:\.|$)/i) ||
    message.match(/titulad[oa][:\s]+(.+?)(?:\.|$)/i);
  if (titleMatch) params.title = titleMatch[1].trim();

  return params;
}

function extractArtworkId(message, contextItems) {
  const items = contextItems || [];
  if (items.length && items[0] && items[0].id) {
    return String(items[0].id);
  }
  const m = message.match(/id[:\s]+([a-zA-Z0-9-_]+)/i);
  return m ? m[1] : null;
}

function analyzeMessageAndSelectTools(userMessage, contextItems) {
  const tools = [];
  const sp = extractSearchParams(userMessage);
  const hasStructured = Boolean(sp.category || sp.genre || sp.source || sp.title);
  const artworkId = extractArtworkId(userMessage, contextItems);
  if (hasStructured) tools.push("search_artworks");
  if (artworkId) tools.push("get_artwork_by_id");
  if (contextItems && contextItems.length && !tools.includes("get_artwork_by_id")) {
    tools.push("get_artwork_by_id");
  }
  return tools;
}

module.exports = {
  extractSearchParams,
  extractArtworkId,
  analyzeMessageAndSelectTools,
};
