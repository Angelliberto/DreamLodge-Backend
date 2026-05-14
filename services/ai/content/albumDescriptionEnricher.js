/**
 * Enriquece solo álbumes Spotify cuya descripción en BD es el placeholder ("Álbum con N canciones").
 * Si la obra ya tiene otra descripción guardada, no se llama a la IA.
 *
 * La IA identifica el disco por metadatos (título, artista, año, géneros), no por IDs internos ni Spotify.
 * Se intenta primero Gemini con Google Search (grounding); si falla, se cae a generación sin web (modelos lite).
 */
const { getAiAgent } = require("../core/dreamLodgeAiAgent");

/** Herramienta de recuperación vía Google Search (SDK @google/generative-ai). */
const GOOGLE_SEARCH_GROUNDING_TOOLS = [
  {
    googleSearchRetrieval: {
      dynamicRetrievalConfig: {
        mode: "MODE_DYNAMIC",
        dynamicThreshold: 0.25,
      },
    },
  },
];

/** Modelos que suelen admitir googleSearchRetrieval (no usar *-lite aquí). */
const ALBUM_BLURB_WITH_WEB_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

/** Fallback barato si la búsqueda web no está disponible en la clave o el modelo. */
const ALBUM_BLURB_FALLBACK_MODELS = [
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

/** Placeholder que pone adaptSpotifyAlbum al crear la obra desde Spotify. */
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

/**
 * Si la obra ya tiene una descripción distinta del placeholder, no debe generarse nada.
 * @param {unknown} desc
 */
function hasStoredDescriptionToKeep(desc) {
  return !isGenericSpotifyAlbumDescription(desc);
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

function normalizeBlurb(text) {
  return String(text || "")
    .trim()
    .replace(/^["«»]|["«»]$/g, "");
}

function buildAlbumEnrichPrompt(artwork) {
  const title = String(artwork.title || "").trim();
  const creator = String(artwork.creator || "").trim();
  const year = String(artwork.year || "").trim();
  const genres = genresLine(artwork);
  const tracks = parseTrackHint(artwork);

  return `Eres un editor musical. Tu tarea es identificar UN único álbum musical usando solo estos datos de catálogo (no uses ningún ID interno de base de datos ni ID de Spotify para decidir de qué disco hablas; solo título, intérprete(s), año y pistas/géneros si encajan con fuentes web):

- Título del álbum: "${title}"
- Intérprete(s): "${creator || "desconocido"}"
- Año de referencia (si consta): "${year || "desconocido"}"
${genres ? `- Géneros o etiquetas conocidas: ${genres}` : ""}
${tracks != null ? `- Número aproximado de pistas (metadato): ${tracks}` : ""}

Instrucciones:
1) Usa búsqueda en internet cuando sea necesario para confirmar que las fuentes se refieren al mismo álbum (mismo título e intérprete principal). Si no puedes confirmarlo, dilo con honestidad en 1 frase y no inventes datos.
2) Escribe UNA sola descripción breve en español (máximo 60 palabras, texto corrido). Tono informativo: estilo, contexto de lanzamiento o recepción general si aparece en fuentes fiables.
3) No listes canciones ni incluyas URLs ni lista de fuentes.
4) No menciones IDs, Wikipedia ni que eres un modelo de IA.`;
}

async function tryGeminiAlbumBlurb(artwork) {
  const agent = getAiAgent();
  if (!agent.configured()) {
    console.warn("[albumDescriptionEnricher] Gemini no configurado (GEMINI_API_KEY)");
    return "";
  }

  const prompt = buildAlbumEnrichPrompt(artwork);
  const generationConfig = { temperature: 0.3, maxOutputTokens: 260 };

  let text = "";
  try {
    text = await agent.generateWithGemini(prompt, {
      purpose: "descripción álbum (grounding web)",
      timeoutMs: 42000,
      modelCandidates: ALBUM_BLURB_WITH_WEB_MODELS,
      tools: GOOGLE_SEARCH_GROUNDING_TOOLS,
      generationConfig,
    });
  } catch (e) {
    console.warn("[albumDescriptionEnricher] fase con búsqueda web:", e?.message || e);
  }

  let out = normalizeBlurb(text);
  if (out.length >= 24) return out;

  try {
    text = await agent.generateWithGemini(prompt, {
      purpose: "descripción álbum (sin web)",
      timeoutMs: 22000,
      modelCandidates: ALBUM_BLURB_FALLBACK_MODELS,
      generationConfig: { temperature: 0.35, maxOutputTokens: 200 },
    });
    out = normalizeBlurb(text);
  } catch (e) {
    console.warn("[albumDescriptionEnricher] fase sin web:", e?.message || e);
    return "";
  }

  return out.length >= 24 ? out : "";
}

/**
 * @param {object} artworkPlain - documento obra (plain object o mongoose toObject)
 * @returns {Promise<{ description: string } | null>}
 */
async function enrichSpotifyAlbumDescriptionIfNeeded(artworkPlain) {
  if (!artworkPlain || typeof artworkPlain !== "object") return null;
  if (String(artworkPlain.source || "").trim() !== "Spotify") return null;
  if (!isMusicaCategory(artworkPlain.category)) return null;
  if (hasStoredDescriptionToKeep(artworkPlain.description)) return null;

  const gem = await tryGeminiAlbumBlurb(artworkPlain);
  if (gem) return { description: gem };

  return null;
}

module.exports = {
  enrichSpotifyAlbumDescriptionIfNeeded,
  isGenericSpotifyAlbumDescription,
  hasStoredDescriptionToKeep,
  isMusicaCategory,
};
