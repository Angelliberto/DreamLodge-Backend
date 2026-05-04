/**
 * Sustituye la descripción genérica de Spotify ("Álbum con N canciones") por texto útil:
 * 1) extracto de Wikipedia (es/en), 2) si falla, breve texto con Gemini.
 */
const axios = require("axios");
const { getAiAgent } = require("./ai/dreamLodgeAiAgent");

const UA = "DreamLodge/1.0 (https://github.com; album metadata enrichment)";

function isMusicaCategory(cat) {
  const s = String(cat || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return s === "musica";
}

function isGenericSpotifyAlbumDescription(desc) {
  if (desc == null) return true;
  const t = String(desc).trim();
  if (t.length < 8) return true;
  const n = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /^album con \d+ canciones\.?$/.test(n);
}

function cleanWikiExtract(text) {
  if (!text || typeof text !== "string") return "";
  let s = text
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[\d+\]/g, "")
    .replace(/={2,}.+={2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const dot = s.lastIndexOf(".", 520);
  if (s.length > 560 && dot > 200) s = s.slice(0, dot + 1);
  else if (s.length > 580) s = `${s.slice(0, 577).trim()}…`;
  return s;
}

function parseTrackHint(artwork) {
  const m = String(artwork?.metadata?.duration || "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function genresLine(artwork) {
  const g = artwork?.metadata?.genres;
  if (!Array.isArray(g) || !g.length) return "";
  return g
    .slice(0, 8)
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(", ");
}

async function wikiApiGet(lang, params) {
  const base =
    lang === "es" ? "https://es.wikipedia.org/w/api.php" : "https://en.wikipedia.org/w/api.php";
  const { data } = await axios.get(base, {
    params: { ...params, format: "json" },
    timeout: 14000,
    headers: { "User-Agent": UA },
  });
  return data;
}

async function wikiSearch(lang, q) {
  const data = await wikiApiGet(lang, {
    action: "query",
    list: "search",
    srsearch: q,
    srlimit: 5,
  });
  return Array.isArray(data?.query?.search) ? data.query.search : [];
}

async function wikiExtractForTitle(lang, title) {
  const data = await wikiApiGet(lang, {
    action: "query",
    prop: "extracts",
    titles: title,
    explaintext: 1,
    exintro: 1,
    exchars: 900,
  });
  const pages = data?.query?.pages;
  if (!pages || typeof pages !== "object") return "";
  const first = Object.values(pages)[0];
  if (!first || first.missing != null || first.invalid != null) return "";
  return cleanWikiExtract(first.extract || "");
}

async function tryWikipediaAlbumBlurb(artwork) {
  const title = String(artwork.title || "").trim();
  const creator = String(artwork.creator || "").trim();
  const mainArtist = creator.split(",")[0].trim() || creator;
  if (title.length < 2 || mainArtist.length < 1) return "";

  const queries = [
    `${title} (álbum ${mainArtist})`,
    `${title} álbum ${mainArtist}`,
    `${title} ${mainArtist} álbum`,
    `${title} album ${mainArtist}`,
    `${title} ${mainArtist}`,
  ];

  for (const lang of ["es", "en"]) {
    for (const q of queries) {
      try {
        const hits = await wikiSearch(lang, q);
        for (const h of hits) {
          const pageTitle = h?.title;
          if (!pageTitle) continue;
          const extract = await wikiExtractForTitle(lang, pageTitle);
          if (extract.length >= 80) return extract;
        }
      } catch (_) {
        /* siguiente intento */
      }
    }
  }
  return "";
}

async function tryGeminiAlbumBlurb(artwork) {
  const agent = getAiAgent();
  if (!agent.configured()) return "";

  const title = String(artwork.title || "").trim();
  const creator = String(artwork.creator || "").trim();
  const year = String(artwork.year || "").trim();
  const genres = genresLine(artwork);
  const tracks = parseTrackHint(artwork);

  const prompt = `Eres un editor musical. Escribe UNA sola descripción breve en español (máximo 110 palabras) del álbum musical "${title}" de ${creator || "artista desconocido"}${year ? ` (${year})` : ""}.

Reglas:
- Tono informativo, sin spoilers de conceptos secretos ni listas de canciones.
- Si conoces el disco con seguridad, resume estilo, contexto de lanzamiento o recepción general.
- Si NO tienes datos fiables sobre ESTE álbum concreto, escribe 2-3 frases genéricas pero honestas: menciona el/los artista(s), el año si lo tienes, ${genres ? `géneros posibles (${genres})` : "posibles géneros según el nombre"}${tracks != null ? ` y que el álbum consta de unas ${tracks} pistas` : ""}; NO inventes premios, posiciones en charts ni fechas exactas dudosas.
- Sin viñetas ni comillas alrededor del texto.
- No menciones Wikipedia ni "como modelo de IA".`;

  try {
    const text = await agent.generateWithGemini(prompt, {
      purpose: "descripción breve álbum",
      timeoutMs: 28000,
      generationConfig: { temperature: 0.35, maxOutputTokens: 220 },
    });
    const out = String(text || "")
      .trim()
      .replace(/^["«»]|["«»]$/g, "");
    return out.length >= 40 ? out : "";
  } catch (_) {
    return "";
  }
}

/**
 * @param {object} artworkPlain - documento obra (plain object o mongoose toObject)
 * @returns {Promise<{ description: string } | null>}
 */
async function enrichSpotifyAlbumDescriptionIfNeeded(artworkPlain) {
  if (!artworkPlain || typeof artworkPlain !== "object") return null;
  if (String(artworkPlain.source || "").trim() !== "Spotify") return null;
  if (!isMusicaCategory(artworkPlain.category)) return null;
  if (!isGenericSpotifyAlbumDescription(artworkPlain.description)) return null;

  const wiki = await tryWikipediaAlbumBlurb(artworkPlain);
  if (wiki) return { description: wiki };

  const gem = await tryGeminiAlbumBlurb(artworkPlain);
  if (gem) return { description: gem };

  return null;
}

module.exports = {
  enrichSpotifyAlbumDescriptionIfNeeded,
  isGenericSpotifyAlbumDescription,
  isMusicaCategory,
};
