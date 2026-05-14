/**
 * Sustituye la descripción genérica de Spotify ("Álbum con N canciones") por un texto breve generado con Gemini (modelo económico).
 */
const { getAiAgent } = require("../core/dreamLodgeAiAgent");

/** Baratos primero; si la API rechaza lite, se cae a flash estándar (misma cascada que el resto del backend). */
const ALBUM_BLURB_GEMINI_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

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
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return /^album con \d+ canciones\.?$/.test(n);
}

function parseTrackHint(artwork) {
  const fromMeta = String(artwork?.metadata?.duration || "").match(/(\d+)/);
  if (fromMeta) return Number(fromMeta[1]);
  const desc = String(artwork?.description || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const fromDesc = desc.match(/album con (\d+)/);
  return fromDesc ? Number(fromDesc[1]) : null;
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

async function tryGeminiAlbumBlurb(artwork) {
  const agent = getAiAgent();
  if (!agent.configured()) {
    console.warn("[albumDescriptionEnricher] Gemini no configurado (GEMINI_API_KEY)");
    return "";
  }

  const title = String(artwork.title || "").trim();
  const creator = String(artwork.creator || "").trim();
  const year = String(artwork.year || "").trim();
  const genres = genresLine(artwork);
  const tracks = parseTrackHint(artwork);

  const prompt = `Eres un editor musical. Escribe UNA sola descripción corta en español (máximo 55 palabras, 2-4 frases) del álbum "${title}" de ${creator || "artista desconocido"}${year ? ` (${year})` : ""}.

Reglas:
- Tono informativo, sin listar canciones ni argumentar el concepto al detalle.
- Si conoces el disco, resume estilo o contexto de lanzamiento en pocas líneas.
- Si no tienes datos fiables sobre este álbum concreto, sé honesto: artista, año si lo tienes, ${genres ? `géneros (${genres})` : "género probable según el nombre"}${tracks != null ? ` y aproximadamente ${tracks} pistas` : ""}; no inventes charts, premios ni fechas dudosas.
- Sin viñetas ni comillas alrededor del texto.
- No menciones que eres un modelo de IA.`;

  try {
    const text = await agent.generateWithGemini(prompt, {
      purpose: "descripción breve álbum",
      timeoutMs: 22000,
      modelCandidates: ALBUM_BLURB_GEMINI_MODELS,
      generationConfig: { temperature: 0.35, maxOutputTokens: 160 },
    });
    const out = String(text || "")
      .trim()
      .replace(/^["«»]|["«»]$/g, "");
    return out.length >= 24 ? out : "";
  } catch (e) {
    console.warn("[albumDescriptionEnricher] Gemini:", e?.message || e);
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

  const gem = await tryGeminiAlbumBlurb(artworkPlain);
  if (gem) return { description: gem };

  return null;
}

module.exports = {
  enrichSpotifyAlbumDescriptionIfNeeded,
  isGenericSpotifyAlbumDescription,
  isMusicaCategory,
};
