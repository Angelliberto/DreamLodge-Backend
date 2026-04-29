/**
 * Agente IA Dream Lodge: Gemini + herramientas Mongo (equivalente a ai_agent.py).
 */
const { GoogleGenerativeAI } = require("@google/generative-ai");
const db = require("./dbTools");
const { buildSystemPrompt } = require("./systemPrompts");
const {
  normalizeWorkCandidateRows,
  formatExceptionForClient,
  envModels,
  normalizeForIntent,
} = require("./agentUtils");
const { generateArtisticDescription } = require("./artisticProfileService");
const { curatePersonalizedFeed } = require("./feedCurationService");

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

// Utility functions/constants moved to ./agentUtils.

// Utility functions/constants moved to ./agentUtils.

class DreamLodgeAIAgent {
  constructor() {
    this.apiKey = String(process.env.GEMINI_API_KEY || "").trim();
    this._genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
  }

  configured() {
    return Boolean(this._genAI && this.apiKey);
  }

  async generateWithGemini(
    prompt,
    { purpose = "respuesta", timeoutMs = 40000, generationConfig = null } = {}
  ) {
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
          const request = generationConfig
            ? {
                contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }],
                generationConfig,
              }
            : prompt;
          const result = await model.generateContent(request);
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
    return generateArtisticDescription(this, oceanResult, options, {
      logger,
      logIaRecommendedWorks,
    });
  }

  async curatePersonalizedFeed(oceanResult, artisticProfile) {
    return curatePersonalizedFeed(this, oceanResult, artisticProfile, {
      logger,
      logIaRecommendedWorks,
    });
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
