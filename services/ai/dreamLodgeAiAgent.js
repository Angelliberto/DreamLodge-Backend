/**
 * Agente IA Dream Lodge: Gemini + herramientas Mongo (equivalente a ai_agent.py).
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require("./dbTools");
const { buildSystemPrompt } = require("./systemPrompts");
const {
  buildArtisticWebContext,
  buildCuratorContextFromSerper,
} = require("./webSearch");

const logger = console;

/**
 * Log legible de obras que propone la IA (una línea numerada por obra).
 * Buscar en consola / logs: [dreamlodge][ia_obras]
 *
 * @param {string} tag - p.ej. artistic_description | feed_personalized | recommend_similar
 * @param {{ id?: string, works?: Array<{ category?: string, title?: string, creator?: string }> }} opts
 */
function logIaRecommendedWorks(tag, opts = {}) {
  const safeId =
    opts.id != null && String(opts.id).trim() ? String(opts.id).trim() : "(sin id)";
  const list = Array.isArray(opts.works) ? opts.works : [];
  if (!list.length) {
    logger.info("[dreamlodge][ia_obras] %s id=%s count=0", tag, safeId);
    return;
  }
  const lines = list.map((w, i) => {
    if (!w || typeof w !== "object") {
      return `  ${i + 1}. (entrada inválida)`;
    }
    const cat = w.category || "?";
    const title = w.title || "(sin título)";
    const c = w.creator ? ` — ${w.creator}` : "";
    return `  ${i + 1}. [${cat}] ${title}${c}`;
  });
  logger.info(
    "[dreamlodge][ia_obras] %s id=%s count=%s\n%s",
    tag,
    safeId,
    list.length,
    lines.join("\n")
  );
}

const WORK_CAT_ALLOWED = new Set([
  "cine",
  "musica",
  "literatura",
  "videojuegos",
  "arte-visual",
]);

const WORK_CAT_ALIAS = {
  pelicula: "cine",
  películas: "cine",
  series: "cine",
  serie: "cine",
  tv: "cine",
  film: "cine",
  movie: "cine",
  música: "musica",
  music: "musica",
  album: "musica",
  libro: "literatura",
  libros: "literatura",
  book: "literatura",
  juego: "videojuegos",
  juegos: "videojuegos",
  game: "videojuegos",
  games: "videojuegos",
  arte: "arte-visual",
  art: "arte-visual",
  pintura: "arte-visual",
};

const OCEAN_SUBFACET_ORDER = {
  openness: [
    "intellect",
    "ingenuity",
    "reflection",
    "competence",
    "quickness",
    "introspection",
    "creativity",
    "imagination",
    "depth",
  ],
  conscientiousness: [
    "conscientiousness",
    "efficiency",
    "dutifulness",
    "purposefulness",
    "organization",
    "cautiousness",
    "rationality",
    "perfectionism",
    "orderliness",
  ],
  extraversion: [
    "gregariousness",
    "friendliness",
    "assertiveness",
    "poise",
    "leadership",
    "provocativeness",
    "self_disclosure",
    "talkativeness",
    "sociability",
  ],
  agreeableness: [
    "understanding",
    "warmth",
    "morality",
    "pleasantness",
    "empathy",
    "cooperation",
    "sympathy",
    "tenderness",
    "nurturance",
  ],
  neuroticism: [
    "stability",
    "happiness",
    "calmness",
    "moderation",
    "toughness",
    "impulse_control",
    "imperturbability",
    "cool_headedness",
    "tranquility",
  ],
};

function normalizeWorkCandidateRows(rawList, maxItems = 24) {
  if (!Array.isArray(rawList)) return [];
  const cleaned = [];
  const seen = new Set();
  for (const item of rawList.slice(0, maxItems)) {
    if (!item || typeof item !== "object") continue;
    let cat = String(item.category || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "-");
    if (WORK_CAT_ALIAS[cat]) cat = WORK_CAT_ALIAS[cat];
    if (!WORK_CAT_ALLOWED.has(cat)) continue;
    const title = String(item.title || "").trim();
    if (title.length < 2) continue;
    const creator = String(item.creator || "").trim();
    const key = `${cat}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = { category: cat, title: title.slice(0, 200) };
    if (creator) row.creator = creator.slice(0, 120);
    cleaned.push(row);
  }
  return cleaned;
}

function formatExceptionForClient(exc, maxLen = 800) {
  const parts = [];
  let cur = exc;
  let depth = 0;
  while (cur != null && depth < 4) {
    const s = String(cur.message || cur || "").trim();
    if (s && !parts.includes(s)) parts.push(s);
    cur = cur.cause || cur.__cause__;
    depth += 1;
  }
  let msg = parts.length ? parts.join(" | ") : (exc && exc.name) || "Error";
  if (msg.length > maxLen) return `${msg.slice(0, maxLen - 1)}…`;
  return msg;
}

function traitTotal(scores, key) {
  const v = scores[key];
  if (v && typeof v === "object") {
    const t = v.total;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === "number") return v;
  return 0;
}

function buildDeepSubfacetsBlock(scores) {
  if (!scores || typeof scores !== "object") return "";
  const parts = [];
  const dims = [
    "openness",
    "conscientiousness",
    "extraversion",
    "agreeableness",
    "neuroticism",
  ];

  for (const dim of dims) {
    const dimScores =
      scores[dim] && typeof scores[dim] === "object" ? scores[dim] : {};
    const canonical = OCEAN_SUBFACET_ORDER[dim] || [];
    const extraKeys = Object.keys(dimScores).filter(
      (k) => k !== "total" && !canonical.includes(k)
    );
    const orderedSubfacets = [...canonical, ...extraKeys];
    const line = orderedSubfacets
      .map((sf) => `${sf}: ${dimScores[sf] ?? "N/A"}`)
      .join(", ");
    parts.push(`- ${dim}: ${line || "(sin subfacetas disponibles)"}`);
  }

  return `Subfacetas detalladas (deben considerarse todas):\n${parts.join("\n")}\n`;
}

const GENRE_REC_KEYS = [
  "cine",
  "musica",
  "literatura",
  "videojuegos",
  "arte-visual",
];

function buildOceanFingerprint(scores) {
  if (!scores || typeof scores !== "object") return "na";
  const dims = [
    "openness",
    "conscientiousness",
    "extraversion",
    "agreeableness",
    "neuroticism",
  ];
  const parts = [];
  for (const d of dims) {
    const row = scores[d];
    if (!row || typeof row !== "object") continue;
    const keys = Object.keys(row)
      .filter((k) => k !== "__proto__")
      .sort();
    const seg = keys.map((k) => `${k}:${row[k]}`).join(",");
    parts.push(`${d}{${seg}}`);
  }
  const s = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(16).slice(0, 12);
}

function normalizeGenreRecommendations(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const k of GENRE_REC_KEYS) {
    let arr = raw[k];
    if (!Array.isArray(arr) && k === "arte-visual" && Array.isArray(raw.arte_visual)) {
      arr = raw.arte_visual;
    }
    if (!Array.isArray(arr)) continue;
    const cleaned = arr
      .map((x) => String(x || "").trim())
      .filter((x) => x.length > 0)
      .slice(0, 12);
    if (cleaned.length) out[k] = cleaned;
  }
  return out;
}

function envModels() {
  const raw = process.env.GEMINI_MODEL;
  const candidates = [
    raw,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.0-pro",
  ].filter(Boolean);
  return [...new Set(candidates)];
}

function normalizeForIntent(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

class DreamLodgeAIAgent {
  constructor() {
    this.apiKey = String(process.env.GEMINI_API_KEY || "").trim();
    this._genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
  }

  configured() {
    return Boolean(this._genAI && this.apiKey);
  }

  async generateWithGemini(prompt, { purpose = "respuesta", timeoutMs = 40000 } = {}) {
    if (!this.configured()) {
      throw new Error(
        "El servicio de IA no está configurado (Gemini no disponible)."
      );
    }
    const candidates = envModels();
    if (!candidates.length) {
      throw new Error(
        "No hay modelos Gemini configurados. Define GEMINI_API_KEY o GEMINI_MODEL."
      );
    }

    const tried = [];
    let lastErr = null;

    for (const modelName of candidates) {
      tried.push(modelName);
      const model = this._genAI.getGenerativeModel({ model: modelName });
      try {
        const run = async () => {
          const result = await model.generateContent(prompt);
          const response = result.response;
          let text = "";
          try {
            text = (response.text && response.text()) || "";
          } catch {
            const parts = response.candidates?.[0]?.content?.parts || [];
            text = parts.map((p) => p.text || "").join("");
          }
          return String(text || "").trim();
        };

        const text = await Promise.race([
          run(),
          new Promise((_, rej) =>
            setTimeout(
              () => rej(new Error(`Timeout generando ${purpose} con ${modelName}`)),
              Math.max(timeoutMs, 1000)
            )
          ),
        ]);

        if (!text) {
          throw new Error(`El modelo ${modelName} no generó ninguna respuesta.`);
        }
        return text;
      } catch (e) {
        lastErr = e;
        if (this.isNotSupported(e)) continue;
        if (this.isQuota(e)) continue;
        throw e;
      }
    }

    if (lastErr) {
      const detail = formatExceptionForClient(lastErr);
      const err = new Error(
        `Gemini falló tras probar: ${tried.join(", ")}. ${detail}`
      );
      err.cause = lastErr;
      throw err;
    }
    throw new Error(
      `No hay modelos Gemini compatibles. Modelos probados: ${tried.join(", ")}`
    );
  }

  isNotSupported(err) {
    const msg = String(err?.message || "").toLowerCase();
    const s = err?.status || err?.statusCode;
    return (
      s === 404 ||
      msg.includes("not found") ||
      msg.includes("not_found") ||
      msg.includes("no longer available") ||
      msg.includes("not supported") ||
      msg.includes("generatecontent")
    );
  }

  isQuota(err) {
    const msg = String(err?.message || "").toLowerCase();
    const s = err?.status || err?.statusCode;
    return s === 429 || msg.includes("quota") || msg.includes("rate limit") || msg.includes("429");
  }

  extractSearchParams(message) {
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

    for (const source of ["tmdb", "spotify", "igdb", "googlebooks"]) {
      if (normalized.includes(source)) {
        params.source = source.toUpperCase();
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

  extractArtworkId(message, contextItems) {
    const items = contextItems || [];
    if (items.length && items[0] && items[0].id) {
      return String(items[0].id);
    }
    const m = message.match(/id[:\s]+([a-zA-Z0-9-_]+)/i);
    return m ? m[1] : null;
  }

  analyzeMessageAndSelectTools(userMessage, contextItems) {
    const tools = [];
    const sp = this.extractSearchParams(userMessage);
    const hasStructured = Boolean(
      sp.category || sp.genre || sp.source || sp.title
    );
    const artworkId = this.extractArtworkId(userMessage, contextItems);
    if (hasStructured) tools.push("search_artworks");
    if (artworkId) tools.push("get_artwork_by_id");
    if (contextItems && contextItems.length && !tools.includes("get_artwork_by_id")) {
      tools.push("get_artwork_by_id");
    }
    return tools;
  }

  async executeTools(tools, userMessage, { userId, contextItems } = {}) {
    const results = {};
    const ctx = contextItems || [];

    for (const tool of tools) {
      try {
        if (tool === "search_artworks") {
          const sp = this.extractSearchParams(userMessage);
          results.artworks = await db.searchArtworks({
            category: sp.category,
            source: sp.source,
            title: sp.title,
            genre: sp.genre,
            limit: 20,
            page: 1,
          });
        } else if (tool === "get_user_ocean_results" && userId) {
          results.oceanResults = await db.getUserOceanResults(userId);
        } else if (tool === "get_user_favorites" && userId) {
          results.favorites = await db.getUserFavorites(userId);
        } else if (tool === "get_artwork_by_id") {
          const aid = this.extractArtworkId(userMessage, ctx);
          if (aid) results.artwork = await db.getArtworkById(aid);
        }
      } catch (e) {
        logger.error(`Error ejecutando herramienta ${tool}:`, e);
      }
    }
    return results;
  }

  async generateResponse(
    userMessage,
    systemPrompt,
    conversationHistory,
    toolResults
  ) {
    let contextText = `${systemPrompt}\n\n`;
    const hist = conversationHistory || [];
    if (hist.length) {
      contextText += "Historial de conversación:\n";
      for (const msg of hist.slice(-5)) {
        const role = msg.role || "";
        const content = msg.content || "";
        const label = role === "user" ? "Usuario" : "Asistente";
        contextText += `- ${label}: ${content}\n`;
      }
      contextText += "\n";
    }

    const aw = toolResults.artworks || {};
    if (aw.data && aw.data.length > 0) {
      const artworks = aw.data;
      contextText += `Obras encontradas en la base de datos de Dream Lodge (${artworks.length} resultados):\n`;
      for (let i = 0; i < Math.min(artworks.length, 10); i += 1) {
        const artwork = artworks[i];
        let line = `${i + 1}. ${artwork.title} (${artwork.category})`;
        if (artwork.creator) line += ` - Por ${artwork.creator}`;
        if (artwork.year) line += ` (${artwork.year})`;
        const desc = artwork.description || "";
        if (desc) line += `\n   ${desc.slice(0, 200)}`;
        if (artwork.rating != null) line += `\n   Calificación: ${artwork.rating}/10`;
        contextText += `${line}\n`;
      }
      contextText +=
        "\nIMPORTANTE: Estas obras están en la base de datos de Dream Lodge. Preséntalas de manera atractiva y específica, mencionando detalles relevantes.\n\n";
    }

    const one = toolResults.artwork || {};
    if (one.data) {
      const artwork = one.data;
      contextText += "Información sobre la obra solicitada:\n";
      contextText += `Título: ${artwork.title}\n`;
      contextText += `Categoría: ${artwork.category}\n`;
      if (artwork.creator) contextText += `Creador: ${artwork.creator}\n`;
      if (artwork.year) contextText += `Año: ${artwork.year}\n`;
      if (artwork.description) contextText += `Descripción: ${artwork.description}\n`;
      if (artwork.rating != null) contextText += `Calificación: ${artwork.rating}/10\n`;
      contextText += "\n";
    }

    const oc = toolResults.oceanResults || {};
    if (oc.data) {
      contextText +=
        "El usuario ha completado su perfil de personalidad OCEAN. Puedes hacer recomendaciones personalizadas.\n\n";
    }

    const fav = toolResults.favorites || {};
    const fd = fav.data;
    if (fd) {
      const flist = Array.isArray(fd) ? fd : [fd];
      if (flist.length) {
        contextText += `Obras favoritas del usuario (${flist.length}):\n`;
        for (const x of flist.slice(0, 5)) {
          contextText += `- ${x.title || x.artworkId}\n`;
        }
        contextText += "\n";
      }
    }

    let fullPrompt = `${contextText}Mensaje del usuario: ${userMessage}\n\n`;

    if (aw.data && aw.data.length > 0) {
      fullPrompt += `INSTRUCCIONES IMPORTANTES:
- Has encontrado ${aw.data.length} obra(s) en la base de datos.
- Preséntalas de manera atractiva y específica, mencionando título, creador, año y categoría.
- Explica brevemente por qué cada obra podría interesarle al usuario.
`;
      if (oc.data) {
        fullPrompt +=
          "- Conecta las recomendaciones con su perfil de personalidad OCEAN si es relevante.\n";
      }
      fullPrompt +=
        "- Si hay muchas obras, menciona las 3-5 más relevantes y ofrece mostrar más si quiere.\n";
      fullPrompt +=
        "- Sé entusiasta y específico, evita listas genéricas.\n\n";
    } else if (oc.data) {
      fullPrompt += `INSTRUCCIONES IMPORTANTES:
- El usuario tiene un perfil de personalidad OCEAN disponible.
- Haz recomendaciones personalizadas basándote en sus rasgos de personalidad.
- Sé específico: menciona géneros, estilos o tipos de contenido que se alineen con su perfil.
- Explica brevemente por qué estas recomendaciones encajan con su personalidad.
- Si no tienes obras específicas en la base de datos, usa tu conocimiento general para sugerir contenido conocido.
- NUNCA digas "no tengo información" - siempre ofrece algo útil.

`;
    } else if (fd && Array.isArray(fd) && fd.length > 0) {
      fullPrompt += `INSTRUCCIONES IMPORTANTES:
- Conoces los gustos del usuario a través de sus ${fd.length} favorito(s).
- Haz recomendaciones similares o complementarias basándote en sus favoritos.
- Sé específico: menciona obras concretas, géneros o estilos relacionados.
- Si no tienes obras específicas en la base, usa tu conocimiento para sugerir contenido conocido que sea similar.

`;
    } else {
      fullPrompt += `INSTRUCCIONES IMPORTANTES:
- Responde siempre con algo útil y específico.
- NUNCA digas "no pude encontrar", "no pude satisfacer tu solicitud" o "no entendí" como mensaje principal.
- Interpreta la intención aunque haya typos o escritura informal.
- Si no tienes datos en la base de datos, usa tu conocimiento general para sugerir contenido conocido, géneros o estilos.
- Sé proactivo: ofrece opciones concretas o haz preguntas útiles para refinar la búsqueda.
- Mantén un tono amigable y entusiasta.

`;
    }

    fullPrompt +=
      "Responde de manera natural, conversacional y útil. Sé específico y evita respuestas genéricas o vagas.";

    return this.generateWithGemini(fullPrompt, {
      purpose: "respuesta de chat",
      timeoutMs: 45000,
    });
  }

  async processMessage(
    userMessage,
    { userId, conversationHistory, contextItems } = {}
  ) {
    const hist = conversationHistory || [];
    const ctx = contextItems || [];

    let userInfo = null;
    let oceanResults = null;
    let favorites = [];

    if (userId) {
      userInfo = await db.getUserBasicInfo(userId);
      if (userInfo) {
        const o = await db.getUserOceanResults(userId);
        if (o.data) {
          oceanResults = Array.isArray(o.data) ? o.data : [o.data];
        }
        const f = await db.getUserFavorites(userId);
        if (f.data) favorites = f.data;
      }
    }

    const systemPrompt = buildSystemPrompt({
      contextItems: ctx,
      oceanResults: oceanResults || [],
      favorites,
      userInfo,
    });

    const toolsToUse = this.analyzeMessageAndSelectTools(userMessage, ctx);
    let toolResults = await this.executeTools(toolsToUse, userMessage, {
      userId,
      contextItems: ctx,
    });

    const sp = this.extractSearchParams(userMessage);
    const shouldSearch =
      toolsToUse.includes("search_artworks") ||
      toolsToUse.includes("get_artwork_by_id") ||
      ctx.length > 0;

    if (shouldSearch && Object.keys(sp).length) {
      const art = toolResults.artworks || {};
      if (!art.data || !art.data.length) {
        const extra = await db.searchArtworks({
          category: sp.category,
          source: sp.source,
          title: sp.title,
          genre: sp.genre,
          limit: 20,
          page: 1,
        });
        if (extra.data && extra.data.length) {
          toolResults = { ...toolResults, artworks: extra };
        }
      }
    }

    if (oceanResults && oceanResults.length) {
      toolResults = { ...toolResults, oceanResults: { data: oceanResults } };
    }
    if (favorites.length) {
      toolResults = { ...toolResults, favorites: { data: favorites } };
    }

    if (!this.configured()) {
      throw new Error(
        "El servicio de IA no está configurado (Gemini no disponible). Configura GEMINI_API_KEY."
      );
    }

    const aiResponse = await this.generateResponse(
      userMessage,
      systemPrompt,
      hist,
      toolResults
    );

    return {
      response: aiResponse,
      toolsUsed: toolsToUse,
      context: {
        hasOceanResults: Boolean(oceanResults && oceanResults.length),
        favoritesCount: favorites.length,
        contextItemsCount: ctx.length,
        artworksFound: (toolResults.artworks && toolResults.artworks.data
          ? toolResults.artworks.data.length
          : 0),
      },
    };
  }

  async generateConversationTitle({
    userMessage,
    assistantMessage = "",
    currentTitle = "",
  }) {
    const fallback = "Nueva conversación";
    const um = String(userMessage || "").trim();
    if (!um) return fallback;
    if (!this.configured()) {
      const ct = String(currentTitle || "").trim();
      return ct || um.slice(0, 40);
    }

    const prompt = [
      "Genera o mejora un título MUY corto en español para una conversación de chat.",
      "Reglas:",
      "- Máximo 5 palabras.",
      "- Sin comillas, sin emojis, sin punto final.",
      "- Debe sonar natural y específico al contexto.",
      currentTitle ? `Título actual: "${currentTitle}"` : "Título actual: (sin título útil aún)",
      `Último mensaje del usuario: "${um}"`,
      assistantMessage
        ? `Última respuesta del asistente: "${String(assistantMessage).slice(0, 240)}"`
        : "",
      "Devuelve SOLO el título.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const text = await this.generateWithGemini(prompt, {
        purpose: "título de conversación",
        timeoutMs: 12000,
      });
      let cleaned = String(text || "")
        .trim()
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
      return cleaned || currentTitle || um.slice(0, 40);
    } catch {
      return currentTitle || um.slice(0, 40);
    }
  }

  async generateArtisticDescription(oceanResult, options = {}) {
    const userId =
      options.userId != null && String(options.userId).trim()
        ? String(options.userId).trim()
        : "";
    const regenerationSeed =
      options.regenerationSeed != null ? String(options.regenerationSeed).trim() : "";

    const scores = oceanResult.scores;
    if (!scores || typeof scores !== "object") {
      logger.warn("generateArtisticDescription: scores inválidos");
      const err = new Error("Resultados OCEAN no válidos");
      err.statusCode = 400;
      throw err;
    }

    const oceanFingerprint = buildOceanFingerprint(scores);

    const o = traitTotal(scores, "openness");
    const c = traitTotal(scores, "conscientiousness");
    const e = traitTotal(scores, "extraversion");
    const a = traitTotal(scores, "agreeableness");
    const n = traitTotal(scores, "neuroticism");
    const testType = oceanResult.testType;

    if (!this.configured()) {
      const err = new Error(
        "GEMINI_API_KEY no está configurada; no hay descripción artística sin el modelo."
      );
      err.statusCode = 503;
      throw err;
    }

    const sub = testType === "deep" ? buildDeepSubfacetsBlock(scores) : "";

    const [webBlock, webSearchUsedArtistic] = await buildArtisticWebContext(
      o,
      c,
      e,
      a,
      n,
      testType,
      sub ? sub.slice(0, 400) : ""
    );
    logger.info(
      "artistic_description: web_context_chars=%s web_used=%s",
      (webBlock || "").length,
      webSearchUsedArtistic
    );

    const descriptionGuidelines =
      testType === "deep"
        ? `Descripción (campo "description") para test largo/deep:
- Mínimo 4 párrafos, con análisis complejo y bien desarrollado.
- Analiza explícitamente las 5 dimensiones OCEAN y TODAS las facetas/subfacetas listadas en "Subfacetas detalladas".
- No omitas ninguna subfaceta del bloque; debes integrarlas en el análisis, aunque sea brevemente.
- Explica patrones, tensiones internas y combinaciones entre rasgos (no solo una lista de puntajes).
- Incluye implicaciones culturales concretas: qué tipo de experiencias podrían resonar y en qué condiciones.
- NO hagas un reporte descriptivo de puntajes o una explicación faceta-por-faceta.
- NO repitas números ni listes subfacetas en formato inventario; esa información ya la ve el usuario en resultados.
- Enfócate en una síntesis psicológica profunda: motivaciones, forma de procesar experiencias, sensibilidad estética, y estilos narrativos/sonoros/visuales que podrían conectar con su mundo interno.
- Traduce el perfil a afinidades culturales transversales (temas, tonos, ritmos, complejidad, riesgo creativo, intimidad social, etc.), no solo a etiquetas sueltas.
- Evita afirmaciones absolutas sobre gustos; usa lenguaje probabilístico y condicional.`
        : `Descripción (campo "description") para test corto/quick:
- Mínimo 3 párrafos completos.
- Analiza las 5 dimensiones OCEAN disponibles, con interpretación cuidadosa y útil.
- Evita simplificaciones o frases genéricas de una sola línea.
- Evita afirmaciones absolutas sobre gustos; usa lenguaje probabilístico y condicional.`;

    const toneAndLanguageRules = `Reglas de lenguaje para SIEMPRE:
- No afirmes "te gusta X", "eres X" o "te encanta X" como hechos cerrados.
- Prefiere formulaciones como "de acuerdo con tu perfil podrían atraerte...", "es posible que conectes con...", "tiendes a valorar...".
- Mantén tono cálido, humano y respetuoso, sin sonar determinista ni estereotipado.`;

    const variationBlock = `Coherencia y variación:
- Huella del perfil OCEAN (según puntuaciones actuales): ${oceanFingerprint}
${regenerationSeed ? `- Semilla de regeneración: ${regenerationSeed}. Elige una combinación distinta de obras ancla (suggestedWorks) respecto a otras ejecuciones con la misma huella; prioriza títulos distintos siempre que sigan siendo coherentes con el perfil y con genreRecommendations.` : "- Primera generación o sin semilla: elige obras ancla variadas y muy reconocibles."}`;

    const prompt = `Eres curador cultural. El usuario hizo el test OCEAN (Big Five). Tu tarea es:
1) Sintetizar su personalidad en "description" y "profile".
2) Inferir GÉNEROS / estilos / movimientos por ámbito cultural en "genreRecommendations" (sin nombres de obras en ese objeto).
3) Proponer OBRAS CONCRETAS ancla en "suggestedWorks" (reales, buscables en TMDB, Spotify, Google Books, IGDB o museos), alineadas con el perfil, con "description" y con los géneros declarados en genreRecommendations.

${variationBlock}

Perfil numérico (0-5):
- Apertura ${Number(o).toFixed(2)}, Responsabilidad ${Number(c).toFixed(2)}, Extraversión ${Number(e).toFixed(2)}, Amabilidad ${Number(a).toFixed(2)}, Neuroticismo ${Number(n).toFixed(2)}

${sub}
Fragmentos web (títulos y listas; prioriza obras que aparezcan aquí si encajan con OCEAN):
${webBlock || "(Sin resultados web: elige obras muy conocidas y coherentes con el perfil.)"}

En tu razonamiento interno (no lo escribas): elige 10-16 obras reales mezclando categorías; que cada categoría tenga al menos una obra coherente con los géneros que pusiste para ese ámbito.

${descriptionGuidelines}

${toneAndLanguageRules}

Objetivo de escritura de la descripción:
- Entregar un análisis de personalidad profundo y útil para descubrir cultura.
- Prioriza interpretación y significado práctico sobre repetir datos crudos.
- Conecta la personalidad con posibles intereses en tipos de obras, géneros, atmósferas y formatos.

Campo "genreRecommendations" (obligatorio):
- Debe incluir EXACTAMENTE estas claves: "cine", "musica", "literatura", "videojuegos", "arte-visual".
- Cada clave: array de 2 a 6 strings (idealmente al menos 2) con GÉNEROS, subgéneros, estilos, movimientos o tipos de experiencia (ej. cine: "thriller psicológico", "drama de autor"; musica: "ambient", "soul"; arte-visual: "impresionismo", "arte conceptual").
- NO pongas títulos de obras ni nombres de artistas dentro de genreRecommendations; solo géneros/estilos.
- Debe derivarse del perfil OCEAN actual y ser coherente con "description".

Responde SOLO JSON válido, sin markdown:
{
  "profile": "nombre corto del perfil artístico",
  "description": "texto en español que cumpla estrictamente las reglas anteriores",
  "genreRecommendations": {
    "cine": ["género o estilo 1", "género o estilo 2"],
    "musica": ["..."],
    "literatura": ["..."],
    "videojuegos": ["..."],
    "arte-visual": ["..."]
  },
  "suggestedWorks": [
    {"category":"cine","title":"Título exacto buscable","creator":"director o autor opcional"}
  ]
}

Reglas suggestedWorks:
- category exactamente: cine, musica, literatura, videojuegos, arte-visual
- Títulos reales; mezcla categorías; deben reflejar genreRecommendations y el análisis del perfil.
- videojuegos: en "creator" pon SIEMPRE el estudio desarrollador o publisher reconocible en IGDB (como aparece en la ficha). Obligatorio si el título es corto o ambiguo (una sola palabra: "Journey", "Inside", "Limbo", etc.) para no confundirlo con DLC u otro juego que solo comparte palabra en el título.`;

    let text;
    try {
      text = await this.generateWithGemini(prompt, {
        purpose: "descripción artística",
        timeoutMs: 55000,
      });
    } catch (ex) {
      logger.error("artistic_description: fallo Gemini", ex);
      const detail = formatExceptionForClient(ex);
      const err = new Error(
        `No se pudo generar la descripción con el modelo de IA. ${detail}`
      );
      err.statusCode = 503;
      err.cause = ex;
      throw err;
    }

    const m = text && text.match(/\{[\s\S]*\}/);
    if (!m) {
      const err = new Error(
        "El modelo no devolvió un JSON reconocible. Vuelve a intentarlo."
      );
      err.statusCode = 502;
      throw err;
    }

    let parsed;
    try {
      parsed = JSON.parse(m[0]);
    } catch (ex) {
      const err = new Error(`El modelo devolvió JSON inválido: ${ex.message}`);
      err.statusCode = 502;
      throw err;
    }

    if (!parsed || typeof parsed !== "object") {
      const err = new Error("La respuesta del modelo no es un objeto JSON.");
      err.statusCode = 502;
      throw err;
    }

    const profile = String(parsed.profile || "").trim();
    const description = String(parsed.description || "").trim();
    if (!profile || !description) {
      const err = new Error(
        "La respuesta del modelo está incompleta (falta profile o description)."
      );
      err.statusCode = 502;
      throw err;
    }

    if (parsed.recommendations != null && !Array.isArray(parsed.recommendations)) {
      const err = new Error("El campo recommendations debe ser una lista.");
      err.statusCode = 502;
      throw err;
    }
    if (parsed.recommendations == null) parsed.recommendations = [];

    const genresNorm = normalizeGenreRecommendations(parsed.genreRecommendations);
    const missingGenreKeys = GENRE_REC_KEYS.filter((k) => !genresNorm[k] || genresNorm[k].length < 1);
    if (missingGenreKeys.length) {
      const err = new Error(
        `La respuesta del modelo incompleta: genreRecommendations debe incluir al menos 1 género por ámbito. Faltan: ${missingGenreKeys.join(
          ", "
        )}`
      );
      err.statusCode = 502;
      throw err;
    }
    parsed.genreRecommendations = genresNorm;

    const rawWorks = parsed.suggestedWorks;
    if (Array.isArray(rawWorks)) {
      parsed.suggestedWorks = normalizeWorkCandidateRows(rawWorks, 20);
    } else {
      parsed.suggestedWorks = [];
    }

    logIaRecommendedWorks("artistic_description", {
      id: userId || undefined,
      works: parsed.suggestedWorks,
    });
    logger.info(
      "[dreamlodge][ia_obras] artistic_description_meta userId=%s fingerprint=%s testType=%s seed=%s",
      userId || "(anon)",
      oceanFingerprint,
      testType || "?",
      regenerationSeed || "-"
    );

    return parsed;
  }

  async curatePersonalizedFeed(oceanResult, artisticProfile) {
    const scores = oceanResult.scores;
    if (!scores || typeof scores !== "object") {
      return {
        candidates: [],
        webSearchUsed: false,
        reason: "no_ocean_scores",
      };
    }

    if (!this.configured()) {
      return { candidates: [], webSearchUsed: false, reason: "no_gemini" };
    }

    const o = traitTotal(scores, "openness");
    const c = traitTotal(scores, "conscientiousness");
    const e = traitTotal(scores, "extraversion");
    const a = traitTotal(scores, "agreeableness");
    const n = traitTotal(scores, "neuroticism");

    const personalityLine = `openness ${o.toFixed(1)} conscientiousness ${c.toFixed(1)} extraversion ${e.toFixed(1)} agreeableness ${a.toFixed(1)} neuroticism ${n.toFixed(1)}`;
    const [webBlock, webUsed] = await buildCuratorContextFromSerper(
      personalityLine
    );

    let artExtra = "";
    if (artisticProfile && typeof artisticProfile === "object") {
      const prof = String(artisticProfile.profile || "").trim();
      const desc = String(artisticProfile.description || "").trim().slice(0, 500);
      const gr = artisticProfile.genreRecommendations;
      let genreLine = "";
      if (gr && typeof gr === "object") {
        genreLine = GENRE_REC_KEYS.map((k) => {
          const arr = gr[k];
          if (!Array.isArray(arr) || !arr.length) return null;
          return `${k}: ${arr.filter(Boolean).map(String).join(", ")}`;
        })
          .filter(Boolean)
          .join(" | ");
      }
      if (!genreLine) {
        const recs = artisticProfile.recommendations;
        if (Array.isArray(recs) && recs.length) {
          genreLine = `Sugerencias previas (legacy): ${recs
            .slice(0, 8)
            .filter(Boolean)
            .map(String)
            .join("; ")}`;
        }
      }
      artExtra = `\nPerfil artístico existente: ${prof}\n${desc}\n${genreLine ? `${genreLine}\n` : ""}`;
    }

    const prompt = `Eres curador cultural para una app de descubrimiento (cine, series, música, libros, videojuegos, arte).

Perfil OCEAN del usuario (escala 0-5):
- Apertura ${o.toFixed(2)}, Responsabilidad ${c.toFixed(2)}, Extraversión ${e.toFixed(2)}, Amabilidad ${a.toFixed(2)}, Neuroticismo ${n.toFixed(2)}
${artExtra}
Fragmentos recientes de búsqueda web (pueden incluir títulos reales; úsalos si encajan con el perfil):
${webBlock || "(Sin resultados web: elige obras clásicas o muy conocidas, títulos exactos en español o en el título original más reconocible.)"}

TAREA: Devuelve SOLO un JSON válido, sin markdown ni texto alrededor, con esta forma:
{"candidates":[{"category":"cine","title":"Nombre exacto de la obra","creator":"autor o director opcional"}, ...]}

Reglas estrictas:
- "category" debe ser exactamente uno de: cine, musica, literatura, videojuegos, arte-visual
- Entre 14 y 20 elementos en total; mezcla las categorías (varios de cada tipo).
- Solo obras reales que existan (película, serie, álbum, libro, videojuego, artista u obra de arte).
- "title" debe ser el título principal buscable en TMDB, Spotify, Google Books, IGDB o museos.
- Para arte-visual usa nombre de artista + obra si aplica, o solo artista reconocible.
- No incluyas explicaciones ni campos extra fuera de "candidates".
`;

    let text;
    try {
      text = await this.generateWithGemini(prompt, {
        purpose: "curación feed personalizado",
        timeoutMs: 55000,
      });
    } catch (ex) {
      logger.error("curate_feed: fallo Gemini", ex);
      const detail = formatExceptionForClient(ex);
      const err = new Error(`No se pudo curar el feed con el modelo. ${detail}`);
      err.statusCode = 503;
      throw err;
    }

    const m = text && text.match(/\{[\s\S]*\}/);
    if (!m) {
      return {
        candidates: [],
        webSearchUsed: webUsed,
        reason: "bad_model_json",
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return {
        candidates: [],
        webSearchUsed: webUsed,
        reason: "json_error",
      };
    }

    const rawList = parsed.candidates;
    if (!Array.isArray(rawList)) {
      return {
        candidates: [],
        webSearchUsed: webUsed,
        reason: "no_candidates",
      };
    }

    const cleaned = normalizeWorkCandidateRows(rawList, 24);
    const feedEntityId =
      oceanResult.entityId != null
        ? oceanResult.entityId
        : oceanResult.entity_id;
    logIaRecommendedWorks("feed_personalized", {
      id: feedEntityId != null ? String(feedEntityId) : undefined,
      works: cleaned,
    });

    return { candidates: cleaned, webSearchUsed: webUsed };
  }

  async recommendSimilarWorks(artwork, options = {}) {
    if (!this.configured()) {
      return { candidates: [], reason: "no_gemini" };
    }
    const limit = Math.max(1, Math.min(10, Number(options.limit) || 3));
    const category = String(artwork?.category || "").trim().toLowerCase();
    const title = String(artwork?.title || "").trim();
    const creator = String(artwork?.creator || "").trim();
    const description = String(artwork?.description || "")
      .trim()
      .slice(0, 450);
    const mediaType = String(artwork?.metadata?.mediaType || "")
      .trim()
      .toLowerCase();
    const genres = Array.isArray(artwork?.metadata?.genres)
      ? artwork.metadata.genres.slice(0, 6).join(", ")
      : "";

    if (!title || !category) {
      return { candidates: [], reason: "invalid_input" };
    }

    const wantedCount = Math.max(limit + 2, 4);
    const prompt = `Eres un recomendador cultural.
Obra base:
- category: ${category}
- title: ${title}
- creator: ${creator || "(desconocido)"}
- mediaType (solo cine): ${mediaType || "(desconocido)"}
- genres: ${genres || "(sin géneros)"}
- description: ${description || "(sin descripción)"}

Devuelve SOLO JSON válido, sin markdown:
{"candidates":[{"category":"cine","title":"Nombre exacto","creator":"opcional"}, ...]}

Reglas:
- category exactamente uno de: cine, musica, literatura, videojuegos, arte-visual
- Devuelve entre ${wantedCount} y ${wantedCount + 1} candidatos.
- Prioriza obras muy parecidas en estilo/tema/tono a la obra base.
- Usa también el contexto de creator y description para evitar obras con mismo título pero de otra obra distinta.
- NO incluyas la misma obra base ni variaciones mínimas del mismo título.
- Si category es cine y mediaType es "movie" o "series", devuelve SOLO ese mismo tipo (no mezclar película con serie).
- Cuando sea posible, incluye creator en cine, musica y literatura para mejorar la validación.
- En cine, si un título es ambiguo (misma palabra para película y serie u homónimos), NO lo pongas sin creator/director: o incluye creator, o elige otra obra que puedas anclar.
- Si una sugerencia no se puede respaldar con director/creador ni con el tono/plot coherente con la descripción base, sustitúyela por otra recomendación.
- Usa títulos reales y buscables en APIs públicas.`;

    let text;
    try {
      text = await this.generateWithGemini(prompt, {
        purpose: "recomendaciones similares por obra",
        timeoutMs: 35000,
      });
    } catch (ex) {
      logger.error("recommend_similar: fallo Gemini", ex);
      const detail = formatExceptionForClient(ex);
      const err = new Error(`No se pudieron generar recomendaciones similares. ${detail}`);
      err.statusCode = 503;
      throw err;
    }

    const m = text && text.match(/\{[\s\S]*\}/);
    if (!m) return { candidates: [], reason: "bad_model_json" };

    let parsed;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return { candidates: [], reason: "json_error" };
    }

    const rawList = parsed?.candidates;
    if (!Array.isArray(rawList)) return { candidates: [], reason: "no_candidates" };
    const cleaned = normalizeWorkCandidateRows(rawList, wantedCount + 2);
    logIaRecommendedWorks("recommend_similar", {
      id: `${category}:${title.slice(0, 120)}`,
      works: cleaned,
    });
    return { candidates: cleaned };
  }
}

let _agent = null;

function getAiAgent() {
  if (!_agent) _agent = new DreamLodgeAIAgent();
  return _agent;
}

module.exports = {
  DreamLodgeAIAgent,
  getAiAgent,
  normalizeWorkCandidateRows,
  logIaRecommendedWorks,
};
