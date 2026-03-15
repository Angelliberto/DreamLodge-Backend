/**
 * Servicio de Agente IA para Dream Lodge
 * Integra acceso directo a MongoDB con un LLM para proporcionar respuestas inteligentes
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { buildSystemPrompt } = require('../prompts/systemPrompts');
const { UserModel, ArtworkModel, OceanModel } = require('../models');
const mongoose = require('mongoose');

class AIAgent {
  constructor(llmProvider) {
    this.llmProvider = llmProvider || this.getDefaultLLMProvider();
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiClient = null;
    
    // Inicializar Gemini si la API key está disponible
    if (this.geminiApiKey) {
      try {
        // Validar que la API key no esté vacía
        if (this.geminiApiKey.trim() === '') {
          console.warn('⚠️ GEMINI_API_KEY está vacía. El agente usará respuestas básicas.');
        } else {
          this.geminiClient = new GoogleGenerativeAI(this.geminiApiKey);
          console.log('Gemini API inicializada correctamente');
          console.log('API Key configurada (primeros 10 caracteres):', this.geminiApiKey.substring(0, 10) + '...');
        }
      } catch (error) {
        console.error('Error inicializando Gemini API:', error.message);
        console.error('Error stack:', error.stack);
      }
    } else {
      console.warn('⚠️ GEMINI_API_KEY no está configurada. El agente usará respuestas básicas.');
      console.warn('💡 Para habilitar Gemini, configura la variable de entorno GEMINI_API_KEY en Koyeb');
    }
  }

  /**
   * Obtiene el proveedor de LLM por defecto (Gemini si está disponible)
   */
  getDefaultLLMProvider() {
    return this.geminiClient ? 'gemini' : null;
  }

  /**
   * Procesa un mensaje del usuario y genera una respuesta usando el agente IA
   */
  async processMessage(userMessage, options = {}) {
    const {
      userId = null,
      conversationHistory = [],
      contextItems = [],
    } = options;

    try {
      // 1. Obtener contexto del usuario si está disponible
      let userInfo = null;
      let oceanResults = null;
      let favorites = [];

      if (userId) {
        try {
          // Obtener información del usuario
          const user = await UserModel.findById(userId);
          if (user) {
            userInfo = {
              name: user.name,
              email: user.email,
            };

            // Obtener resultados OCEAN del usuario
            try {
              const oceanDataList = await OceanModel.find({
                entityType: 'user',
                entityId: mongoose.Types.ObjectId.isValid(userId) 
                  ? new mongoose.Types.ObjectId(userId) 
                  : userId,
                deleted: { $ne: true }
              }).sort({ createdAt: -1 });
              
              if (oceanDataList && oceanDataList.length > 0) {
                oceanResults = oceanDataList;
              }
            } catch (error) {
              console.warn('No se pudieron obtener resultados OCEAN:', error.message);
            }

            // Obtener favoritos del usuario
            try {
              const userWithFavorites = await UserModel.findById(userId).populate('favoriteArtworks');
              if (userWithFavorites && userWithFavorites.favoriteArtworks) {
                favorites = Array.isArray(userWithFavorites.favoriteArtworks) 
                  ? userWithFavorites.favoriteArtworks 
                  : [userWithFavorites.favoriteArtworks];
              }
            } catch (error) {
              console.warn('No se pudieron obtener favoritos:', error.message);
            }
          }
        } catch (error) {
          console.warn('Error obteniendo información del usuario:', error.message);
        }
      }

      // 2. Construir el prompt del sistema con todo el contexto
      const systemPrompt = buildSystemPrompt({
        contextItems,
        oceanResults,
        favorites,
        userInfo,
      });

      // 3. Analizar el mensaje del usuario y buscar información relevante
      // Siempre intentamos buscar obras relevantes para dar respuestas más contextuales
      const toolsToUse = await this.analyzeMessageAndSelectTools(userMessage, {
        contextItems,
        conversationHistory,
        userId,
      });

      // 4. Ejecutar búsquedas en base de datos para obtener contexto
      let toolResults = {};
      if (toolsToUse.length > 0) {
        toolResults = await this.executeTools(toolsToUse, userMessage, {
          userId,
          contextItems,
        });
      } else {
        // Siempre intentar búsqueda general si el mensaje parece una petición (flexible)
        const searchParams = this.extractSearchParams(userMessage);
        if (Object.keys(searchParams).length > 0 || userMessage.length > 6) {
          try {
            // Agregar timeout a la búsqueda automática
            const searchPromise = this.searchArtworks(searchParams);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout en búsqueda automática')), 15000)
            );
            
            const searchResults = await Promise.race([searchPromise, timeoutPromise]);
            if (searchResults && searchResults.data && searchResults.data.length > 0) {
              toolResults.artworks = searchResults;
            }
          } catch (error) {
            console.warn('Error en búsqueda automática:', error.message);
            // Continuar sin resultados de búsqueda, el agente puede responder igual
          }
        }
      }

      // Incluir información de OCEAN y favoritos en toolResults para que esté disponible en generateResponse
      if (oceanResults && oceanResults.length > 0) {
        toolResults.oceanResults = { data: oceanResults };
      }
      if (favorites && favorites.length > 0) {
        toolResults.favorites = { data: favorites };
      }

      // 5. Generar respuesta usando el LLM
      const aiResponse = await this.generateResponse(
        userMessage,
        systemPrompt,
        conversationHistory,
        toolResults
      );

      return {
        response: aiResponse,
        toolsUsed: toolsToUse,
        context: {
          hasOceanResults: !!oceanResults,
          favoritesCount: favorites.length,
          contextItemsCount: contextItems.length,
        },
      };
    } catch (error) {
      console.error('Error procesando mensaje:', error);
      throw error;
    }
  }

  /**
   * Normaliza texto para detección flexible: quita tildes, minúsculas, colapsa espacios
   */
  normalizeForIntent(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/\u0300-\u036f/g, '') // quitar acentos
      .replace(/\s+/g, ' ');
  }

  /**
   * Comprueba si el mensaje contiene alguna de las palabras/frases (flexible a typos y variantes)
   */
  messageMatches(message, keywords) {
    const normalized = this.normalizeForIntent(message);
    return keywords.some(kw => {
      const n = this.normalizeForIntent(kw);
      return normalized.includes(n) || normalized.split(/\s+/).some(word => word.includes(n) || n.includes(word));
    });
  }

  /**
   * Analiza el mensaje del usuario y determina qué búsquedas realizar (flexible a typos y redacción)
   */
  async analyzeMessageAndSelectTools(userMessage, options = {}) {
    const { contextItems = [], conversationHistory = [], userId = null } = options;
    const message = userMessage.toLowerCase().trim();
    const normalized = this.normalizeForIntent(userMessage);
    const tools = [];

    const recomienda = [
      'recomiendame', 'recomienda', 'recomiendame', 'sugerencia', 'sugiere', 'sugerir',
      'que deberia', 'qué debería', 'q me recomiendas', 'que me recomiendas',
      'que puedo ver', 'que puedo escuchar', 'que puedo leer', 'que deberia ver',
      'dame recomendaciones', 'recomendaciones', 'algo para ver', 'algo para leer', 'algo para escuchar',
      'quiero ver', 'quiero escuchar', 'quiero leer', 'algo de', 'algo como'
    ];
    const buscar = [
      'buscar', 'busca', 'encuentra', 'encontrar', 'muestrame', 'muéstrame', 'dame',
      'pelicula', 'película', 'peli', 'pelis', 'cine', 'film', 'movie',
      'musica', 'música', 'cancion', 'canción', 'disco', 'album',
      'libro', 'libros', 'novela', 'lectura', 'leer',
      'videojuego', 'juego', 'juegos', 'game', 'gaming',
      'arte', 'artista', 'pintura', 'visual'
    ];
    const categorias = [
      'pelicula', 'película', 'peli', 'cine', 'film', 'peliculas', 'películas',
      'musica', 'música', 'cancion', 'cancion', 'canciones', 'disco', 'album',
      'libro', 'libros', 'novela', 'literatura', 'book',
      'videojuego', 'videojuegos', 'juego', 'juegos', 'game',
      'arte', 'artista', 'artistas', 'pintura', 'art'
    ];
    const infoObra = [
      'informacion sobre', 'información sobre', 'detalles de', 'que es', 'qué es',
      'quien es', 'quién es', 'cuentame sobre', 'cuéntame sobre', 'hablame de', 'háblame de',
      'sabes de', 'conoces', 'info de', 'sobre la pelicula', 'sobre el libro'
    ];

    // Recomendaciones: amplio para capturar typos y variantes
    if (recomienda.some(k => normalized.includes(this.normalizeForIntent(k)))) {
      tools.push('search_artworks');
      if (userId) {
        tools.push('get_user_ocean_results');
        tools.push('get_user_favorites');
      }
    }
    // Búsqueda explícita o menciones de categorías
    else if (buscar.some(k => normalized.includes(this.normalizeForIntent(k))) ||
             categorias.some(k => normalized.includes(this.normalizeForIntent(k)))) {
      tools.push('search_artworks');
    }

    // Preguntas sobre obras o información
    if (infoObra.some(k => normalized.includes(this.normalizeForIntent(k)))) {
      tools.push('get_artwork_by_id');
    }
    if (contextItems && contextItems.length > 0) {
      tools.push('get_artwork_by_id');
    }

    return tools;
  }

  /**
   * Ejecuta las herramientas de base de datos seleccionadas con timeouts
   */
  async executeTools(tools, userMessage, options = {}) {
    const { userId = null, contextItems = [] } = options;
    const results = {};

    // Función helper para agregar timeout a promesas
    const withTimeout = (promise, timeoutMs, toolName) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout ejecutando ${toolName} después de ${timeoutMs}ms`)), timeoutMs)
        )
      ]);
    };

    for (const tool of tools) {
      try {
        switch (tool) {
          case 'search_artworks':
            // Extraer parámetros de búsqueda del mensaje
            const searchParams = this.extractSearchParams(userMessage);
            results.artworks = await withTimeout(
              this.searchArtworks(searchParams),
              15000, // 15 segundos para búsquedas
              'search_artworks'
            );
            break;

          case 'get_user_ocean_results':
            if (userId) {
              results.oceanResults = await withTimeout(
                this.getUserOceanResults(userId),
                10000, // 10 segundos para obtener OCEAN
                'get_user_ocean_results'
              );
            }
            break;

          case 'get_user_favorites':
            if (userId) {
              results.favorites = await withTimeout(
                this.getUserFavorites(userId),
                10000, // 10 segundos para obtener favoritos
                'get_user_favorites'
              );
            }
            break;

          case 'get_artwork_by_id':
            // Intentar extraer ID de artwork del mensaje o contexto
            const artworkId = this.extractArtworkId(userMessage, contextItems);
            if (artworkId) {
              results.artwork = await withTimeout(
                this.getArtworkById(artworkId),
                10000, // 10 segundos para obtener artwork
                'get_artwork_by_id'
              );
            }
            break;

          default:
            console.warn(`Herramienta desconocida: ${tool}`);
        }
      } catch (error) {
        console.error(`Error ejecutando herramienta ${tool}:`, error.message);
        // No agregar error al resultado para que el agente pueda seguir funcionando
        // Solo loguear el error
        if (error.message?.includes('Timeout')) {
          console.warn(`⚠️ Timeout en ${tool}, continuando sin resultados de esta herramienta`);
        }
      }
    }

    return results;
  }

  /**
   * Busca artworks en la base de datos
   */
  async searchArtworks({ category, source, title, limit = 20, page = 1 }) {
    try {
      const query = {};

      if (category) {
        query.category = category;
      }

      if (source) {
        query.source = source;
      }

      if (title) {
        query.title = { $regex: title, $options: 'i' };
      }

      const skip = (page - 1) * limit;
      const artworks = await ArtworkModel.find(query)
        .limit(limit)
        .skip(skip)
        .sort({ createdAt: -1 })
        .lean();

      const total = await ArtworkModel.countDocuments(query);

      return {
        data: artworks,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error buscando artworks:', error);
      return { error: error.message, data: [] };
    }
  }

  /**
   * Obtiene un artwork por ID
   */
  async getArtworkById(artworkId) {
    try {
      let artwork = null;

      // Intentar buscar por _id primero si es un ObjectId válido
      if (mongoose.Types.ObjectId.isValid(artworkId)) {
        artwork = await ArtworkModel.findById(artworkId).lean();
        if (artwork) {
          return { data: artwork };
        }
      }

      // Buscar por el campo 'id'
      artwork = await ArtworkModel.findOne({ id: artworkId }).lean();

      if (!artwork) {
        return { error: 'Artwork no encontrado' };
      }

      return { data: artwork };
    } catch (error) {
      console.error('Error obteniendo artwork:', error);
      return { error: error.message };
    }
  }

  /**
   * Obtiene favoritos de un usuario
   */
  async getUserFavorites(userId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return { error: 'ID de usuario inválido' };
      }

      const user = await UserModel.findById(userId)
        .populate('favoriteArtworks')
        .lean();

      if (!user) {
        return { error: 'Usuario no encontrado' };
      }

      const favorites = user.favoriteArtworks || [];

      return { data: favorites };
    } catch (error) {
      console.error('Error obteniendo favoritos:', error);
      return { error: error.message };
    }
  }

  /**
   * Obtiene resultados OCEAN de un usuario
   */
  async getUserOceanResults(userId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return { error: 'ID de usuario inválido' };
      }

      const oceanResults = await OceanModel.find({
        entityType: 'user',
        entityId: new mongoose.Types.ObjectId(userId),
        deleted: { $ne: true }
      })
        .sort({ createdAt: -1 })
        .lean();

      if (!oceanResults || oceanResults.length === 0) {
        return { data: null, message: 'No se encontraron resultados OCEAN para este usuario' };
      }

      return { data: oceanResults };
    } catch (error) {
      console.error('Error obteniendo resultados OCEAN:', error);
      return { error: error.message };
    }
  }

  /**
   * Extrae parámetros de búsqueda del mensaje del usuario (tolera typos y variantes)
   */
  extractSearchParams(message) {
    const params = {};
    const normalized = this.normalizeForIntent(message);

    // Detectar categoría con más variaciones (sin tildes para coincidir normalizado)
    const categoryMap = {
      'cine': ['cine', 'pelicula', 'peliculas', 'peli', 'pelis', 'movie', 'film', 'films'],
      'música': ['musica', 'cancion', 'canciones', 'song', 'songs', 'album', 'albums', 'disco'],
      'literatura': ['literatura', 'libro', 'libros', 'book', 'books', 'novela', 'novelas', 'leer'],
      'arte-visual': ['arte', 'artista', 'artistas', 'pintura', 'pinturas', 'art', 'visual'],
      'videojuegos': ['videojuego', 'videojuegos', 'juego', 'juegos', 'game', 'games', 'gaming']
    };

    for (const [category, keywords] of Object.entries(categoryMap)) {
      for (const keyword of keywords) {
        if (normalized.includes(keyword)) {
          params.category = category;
          break;
        }
      }
      if (params.category) break;
    }

    // Detectar fuente (menos común, pero posible)
    const sources = ['tmdb', 'spotify', 'igdb', 'googlebooks'];
    for (const source of sources) {
      if (normalized.includes(source)) {
        params.source = source.toUpperCase();
        break;
      }
    }

    // Intentar extraer título (texto entre comillas o después de ciertas palabras clave)
    const titleMatch = message.match(/"([^"]+)"/) || 
                      message.match(/título[:\s]+(.+?)(?:\.|$)/i) ||
                      message.match(/llamad[oa][:\s]+(.+?)(?:\.|$)/i) ||
                      message.match(/titulad[oa][:\s]+(.+?)(?:\.|$)/i);
    if (titleMatch) {
      params.title = titleMatch[1].trim();
    } else {
      const genericWords = ['buscar', 'encontrar', 'recomiendame', 'recomienda', 'sugerencia', 'que', 'sobre', 'de', 'la', 'el', 'un', 'una', 'me', 'te', 'le', 'algo', 'dame', 'quiero'];
      const words = message.split(/\s+/).filter(word => {
        const w = word.replace(/[^\w\u00C0-\u024f]/gi, '').toLowerCase();
        return w.length > 2 && !genericWords.includes(w);
      });
      if (words.length > 0 && words.length <= 6) {
        params.title = words.join(' ');
      }
    }

    return params;
  }

  /**
   * Extrae ID de artwork del mensaje o contexto
   */
  extractArtworkId(message, contextItems = []) {
    // Buscar en el contexto primero
    if (contextItems.length > 0) {
      return contextItems[0].id;
    }

    // Intentar extraer ID del mensaje (formato: "id: xxx" o similar)
    const idMatch = message.match(/id[:\s]+([a-zA-Z0-9-_]+)/i);
    if (idMatch) {
      return idMatch[1];
    }

    return null;
  }

  /**
   * Genera una descripción artística personalizada basada en los resultados OCEAN del usuario
   * @param {Object} oceanResult - Resultados del test OCEAN del usuario
   * @returns {Promise<{profile: string, description: string, recommendations: string[]}>}
   */
  async generateArtisticDescription(oceanResult) {
    try {
      if (!oceanResult || !oceanResult.scores) {
        throw new Error('Resultados OCEAN no válidos');
      }

      const scores = oceanResult.scores;
      
      // Extraer valores de las dimensiones
      const openness = scores.openness?.total || 0;
      const conscientiousness = scores.conscientiousness?.total || 0;
      const extraversion = scores.extraversion?.total || 0;
      const agreeableness = scores.agreeableness?.total || 0;
      const neuroticism = scores.neuroticism?.total || 0;

      // Construir el prompt para el agente IA
      const prompt = `Genera una descripción artística personalizada para un usuario basándote en sus resultados del test de personalidad OCEAN (Big Five).

Resultados del test:
- Apertura a experiencias (Openness): ${openness.toFixed(2)}/5
- Meticulosidad (Conscientiousness): ${conscientiousness.toFixed(2)}/5
- Extroversión (Extraversion): ${extraversion.toFixed(2)}/5
- Simpatía (Agreeableness): ${agreeableness.toFixed(2)}/5
- Neurosis (Neuroticism): ${neuroticism.toFixed(2)}/5

${oceanResult.testType === 'deep' ? `
Subfacetas detalladas:
${Object.keys(scores).map(dim => {
  const dimScores = scores[dim];
  const subfacets = Object.keys(dimScores).filter(k => k !== 'total');
  if (subfacets.length > 0) {
    return `- ${dim}: ${subfacets.map(sf => `${sf}: ${dimScores[sf]?.toFixed(2) || 'N/A'}`).join(', ')}`;
  }
  return null;
}).filter(Boolean).join('\n')}
` : ''}

Genera una descripción artística que incluya:
1. Un perfil artístico (nombre corto, ej: "Explorador", "Contemplativo", "Existencial", "Equilibrado")
2. Una descripción detallada (2-3 párrafos) que explique cómo estos rasgos de personalidad influyen en sus preferencias artísticas
3. Una lista de recomendaciones específicas de géneros o tipos de contenido cultural que le gustarían

IMPORTANTE: Responde SOLO con un JSON válido en el siguiente formato, sin texto adicional antes o después:
{
  "profile": "nombre del perfil",
  "description": "descripción detallada...",
  "recommendations": ["recomendación 1", "recomendación 2", ...]
}`;

      // Si Gemini está disponible, usarlo para generar la descripción
      if (this.geminiClient) {
        try {
          console.log('🤖 Generando descripción artística con Gemini...');
          const model = this.geminiClient.getGenerativeModel({ model: 'gemini-pro' });
          const result = await model.generateContent(prompt);
          const response = result.response;
          const text = response.text().trim();
          
          console.log('📝 Respuesta de Gemini recibida (primeros 200 caracteres):', text.substring(0, 200));
          
          // Intentar extraer JSON de la respuesta
          let jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonResult = JSON.parse(jsonMatch[0]);
            console.log('✅ Descripción artística generada exitosamente con Gemini');
            return jsonResult;
          } else {
            // Si no se puede parsear, usar fallback
            console.warn('⚠️ No se pudo extraer JSON de la respuesta de Gemini, usando fallback');
            console.warn('Respuesta completa:', text);
            return this.generateArtisticDescriptionFromScores(scores, oceanResult.testType);
          }
        } catch (error) {
          console.error('❌ Error generando descripción artística con Gemini:', error);
          console.error('Error details:', error.message);
          console.error('Error stack:', error.stack);
          // Fallback a implementación basada en reglas
          return this.generateArtisticDescriptionFromScores(scores, oceanResult.testType);
        }
      } else {
        console.warn('⚠️ Gemini no está disponible, usando descripción basada en reglas');
      }
      
      // Fallback a implementación basada en reglas si Gemini no está disponible
      return this.generateArtisticDescriptionFromScores(scores, oceanResult.testType);
    } catch (error) {
      console.error('Error generando descripción artística:', error);
      throw error;
    }
  }

  /**
   * Genera descripción artística basada en reglas (temporal hasta integrar LLM real)
   */
  generateArtisticDescriptionFromScores(scores, testType) {
    const openness = scores.openness?.total || 0;
    const extraversion = scores.extraversion?.total || 0;
    const neuroticism = scores.neuroticism?.total || 0;
    const conscientiousness = scores.conscientiousness?.total || 0;
    const agreeableness = scores.agreeableness?.total || 0;

    // Análisis más sofisticado basado en combinaciones de rasgos
    if (openness > 4 && neuroticism > 3.5) {
      return {
        profile: 'Existencial',
        description: 'Tu perfil artístico revela una búsqueda profunda del significado y la autenticidad. Con una alta apertura a experiencias combinada con sensibilidad emocional, te atraen las obras que exploran las grandes preguntas sobre la existencia, la identidad y el sentido de la vida. Prefieres experiencias que desafían tu perspectiva y te invitan a reflexionar sobre la condición humana. El arte que más te conmueve es aquel que no teme abordar temas complejos y que te permite conectar con emociones profundas.',
        recommendations: ['cine de autor', 'música experimental', 'literatura existencialista', 'arte conceptual', 'juegos filosóficos']
      };
    } else if (openness > 3.5 && extraversion < 2) {
      return {
        profile: 'Contemplativo',
        description: 'Tu personalidad artística se caracteriza por una preferencia por la introspección y la reflexión pausada. Con alta apertura pero baja extraversión, disfrutas de obras que invitan a la contemplación profunda y el procesamiento interno de ideas. Prefieres experiencias artísticas que te permiten sumergirte en mundos internos y explorar conceptos abstractos sin la necesidad de estímulos externos intensos. El arte que más valoras es aquel que te permite encontrar significado personal y conexión emocional a través de la quietud.',
        recommendations: ['cine contemplativo', 'música ambient', 'literatura filosófica', 'arte minimalista', 'juegos narrativos lentos']
      };
    } else if (openness > 4 && extraversion > 3.5) {
      return {
        profile: 'Explorador Social',
        description: 'Combinas una mente abierta con una naturaleza extrovertida, lo que te convierte en un verdadero explorador del arte. Te encanta descubrir nuevas formas de expresión artística y compartir estas experiencias con otros. Buscas constantemente obras innovadoras que amplíen tus horizontes y que puedas discutir y disfrutar en comunidad. Tu perfil artístico es dinámico y siempre en busca de la próxima experiencia cultural que te sorprenda.',
        recommendations: ['cine independiente', 'música alternativa', 'literatura experimental', 'arte contemporáneo', 'juegos indie']
      };
    } else if (openness > 4) {
      return {
        profile: 'Explorador',
        description: 'Tu perfil artístico muestra una mente abierta y curiosa que se siente atraída por la innovación y la experimentación. Te encanta descubrir nuevas formas de expresión artística y experimentar con estilos que desafían las convenciones. Buscas constantemente experiencias que amplíen tus horizontes culturales y te expongan a perspectivas diferentes. El arte que más te inspira es aquel que rompe moldes y te ofrece nuevas formas de ver el mundo.',
        recommendations: ['cine independiente', 'música alternativa', 'literatura experimental', 'arte contemporáneo', 'juegos indie']
      };
    } else if (conscientiousness > 4 && agreeableness > 3.5) {
      return {
        profile: 'Clásico Refinado',
        description: 'Tu personalidad artística se inclina hacia obras bien estructuradas y que transmiten valores positivos. Con alta meticulosidad y simpatía, aprecias el arte que muestra maestría técnica y que comunica mensajes constructivos. Prefieres experiencias culturales que están bien ejecutadas y que te dejan con una sensación de satisfacción y armonía. El arte que más valoras es aquel que demuestra excelencia y que contribuye positivamente a tu bienestar emocional.',
        recommendations: ['cine clásico', 'música clásica', 'literatura canónica', 'arte tradicional', 'juegos con narrativa sólida']
      };
    } else {
      return {
        profile: 'Equilibrado',
        description: 'Tu perfil artístico es balanceado y versátil, mostrando apreciación tanto por lo clásico como por lo moderno. Tienes la capacidad de disfrutar de una amplia variedad de experiencias culturales, adaptándote a diferentes estilos y géneros según tu estado de ánimo y contexto. Tu personalidad artística no se limita a un solo tipo de expresión, sino que encuentra valor en la diversidad cultural. El arte que más te atrae es aquel que resuena contigo en el momento, sin importar su categoría o época.',
        recommendations: ['cine clásico y moderno', 'música variada', 'literatura diversa', 'arte tradicional y contemporáneo', 'juegos variados']
      };
    }
  }

  /**
   * Genera la respuesta del agente usando el LLM (Gemini si está disponible)
   */
  async generateResponse(userMessage, systemPrompt, conversationHistory, toolResults) {
    // Si Gemini está disponible, usarlo para generar una respuesta inteligente
    if (this.geminiClient) {
      try {
        console.log('🤖 Generando respuesta con Gemini para el mensaje:', userMessage.substring(0, 50) + '...');
        const model = this.geminiClient.getGenerativeModel({ model: 'gemini-pro' });
        
        // Construir el contexto de la conversación
        let contextText = systemPrompt + '\n\n';
        
        // Agregar historial de conversación si existe
        if (conversationHistory && conversationHistory.length > 0) {
          contextText += 'Historial de conversación:\n';
          conversationHistory.slice(-5).forEach(msg => {
            contextText += `- ${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${msg.content}\n`;
          });
          contextText += '\n';
        }
        
        // Agregar resultados de herramientas al contexto
        if (toolResults.artworks && toolResults.artworks.data) {
          const artworks = toolResults.artworks.data;
          contextText += `Obras encontradas (${artworks.length} resultados):\n`;
          artworks.slice(0, 10).forEach((artwork, index) => {
            contextText += `${index + 1}. ${artwork.title} (${artwork.category})`;
            if (artwork.creator) contextText += ` - Por ${artwork.creator}`;
            if (artwork.year) contextText += ` (${artwork.year})`;
            if (artwork.description) contextText += `\n   ${artwork.description.substring(0, 150)}`;
            contextText += '\n';
          });
          contextText += '\n';
        }
        
        if (toolResults.artwork && toolResults.artwork.data) {
          const artwork = toolResults.artwork.data;
          contextText += `Información sobre la obra solicitada:\n`;
          contextText += `Título: ${artwork.title}\n`;
          contextText += `Categoría: ${artwork.category}\n`;
          if (artwork.creator) contextText += `Creador: ${artwork.creator}\n`;
          if (artwork.year) contextText += `Año: ${artwork.year}\n`;
          if (artwork.description) contextText += `Descripción: ${artwork.description}\n`;
          if (artwork.rating) contextText += `Calificación: ${artwork.rating}/10\n`;
          contextText += '\n';
        }
        
        if (toolResults.oceanResults && toolResults.oceanResults.data) {
          contextText += 'El usuario ha completado su perfil de personalidad OCEAN. Puedes hacer recomendaciones personalizadas.\n\n';
        }
        
        if (toolResults.favorites && toolResults.favorites.data) {
          const favorites = Array.isArray(toolResults.favorites.data) ? toolResults.favorites.data : [toolResults.favorites.data];
          if (favorites.length > 0) {
            contextText += `Obras favoritas del usuario (${favorites.length}):\n`;
            favorites.slice(0, 5).forEach(fav => {
              contextText += `- ${fav.title || fav.artworkId}\n`;
            });
            contextText += '\n';
          }
        }
        
        // Construir el prompt completo con instrucciones más claras
        let fullPrompt = `${contextText}Mensaje del usuario: ${userMessage}\n\n`;
        
        // Agregar instrucciones específicas según el contexto
        if (toolResults.artworks && toolResults.artworks.data && toolResults.artworks.data.length > 0) {
          fullPrompt += `INSTRUCCIONES IMPORTANTES:\n`;
          fullPrompt += `- Has encontrado ${toolResults.artworks.data.length} obra(s) en la base de datos.\n`;
          fullPrompt += `- Preséntalas de manera atractiva y específica, mencionando título, creador, año y categoría.\n`;
          fullPrompt += `- Explica brevemente por qué cada obra podría interesarle al usuario.\n`;
          if (toolResults.oceanResults && toolResults.oceanResults.data) {
            fullPrompt += `- Conecta las recomendaciones con su perfil de personalidad OCEAN si es relevante.\n`;
          }
          fullPrompt += `- Si hay muchas obras, menciona las 3-5 más relevantes y ofrece mostrar más si quiere.\n`;
          fullPrompt += `- Sé entusiasta y específico, evita listas genéricas.\n\n`;
        } else if (toolResults.oceanResults && toolResults.oceanResults.data) {
          fullPrompt += `INSTRUCCIONES IMPORTANTES:\n`;
          fullPrompt += `- El usuario tiene un perfil de personalidad OCEAN disponible.\n`;
          fullPrompt += `- Haz recomendaciones personalizadas basándote en sus rasgos de personalidad.\n`;
          fullPrompt += `- Sé específico: menciona géneros, estilos o tipos de contenido que se alineen con su perfil.\n`;
          fullPrompt += `- Explica brevemente por qué estas recomendaciones encajan con su personalidad.\n`;
          fullPrompt += `- Si no tienes obras específicas en la base de datos, usa tu conocimiento general para sugerir contenido conocido.\n`;
          fullPrompt += `- NUNCA digas "no tengo información" - siempre ofrece algo útil.\n\n`;
        } else if (toolResults.favorites && toolResults.favorites.data && toolResults.favorites.data.length > 0) {
          fullPrompt += `INSTRUCCIONES IMPORTANTES:\n`;
          fullPrompt += `- Conoces los gustos del usuario a través de sus ${toolResults.favorites.data.length} favorito(s).\n`;
          fullPrompt += `- Haz recomendaciones similares o complementarias basándote en sus favoritos.\n`;
          fullPrompt += `- Sé específico: menciona obras concretas, géneros o estilos relacionados.\n`;
          fullPrompt += `- Si no tienes obras específicas en la base, usa tu conocimiento para sugerir contenido conocido que sea similar.\n\n`;
        } else {
          fullPrompt += `INSTRUCCIONES IMPORTANTES:\n`;
          fullPrompt += `- Responde siempre con algo útil y específico.\n`;
          fullPrompt += `- NUNCA digas "no pude encontrar", "no pude satisfacer tu solicitud" o "no entendí" como mensaje principal.\n`;
          fullPrompt += `- Interpreta la intención aunque haya typos o escritura informal.\n`;
          fullPrompt += `- Si no tienes datos en la base de datos, usa tu conocimiento general para sugerir contenido conocido, géneros o estilos.\n`;
          fullPrompt += `- Sé proactivo: ofrece opciones concretas o haz preguntas útiles para refinar la búsqueda.\n`;
          fullPrompt += `- Mantén un tono amigable y entusiasta.\n\n`;
        }
        
        fullPrompt += `Responde de manera natural, conversacional y útil. Sé específico y evita respuestas genéricas o vagas.`;
        
        // Agregar timeout a la llamada de Gemini (80 segundos para dar más margen)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout: La generación de respuesta tardó demasiado')), 80000);
        });
        
        try {
          const result = await Promise.race([
            model.generateContent(fullPrompt),
            timeoutPromise
          ]);
          
          const response = result.response;
          const text = response.text();
          
          // Validar que la respuesta no esté vacía
          if (!text || text.trim().length === 0) {
            console.warn('⚠️ Gemini devolvió respuesta vacía, usando fallback');
            return this.generateBasicResponse(userMessage, toolResults);
          }
          
          return text.trim();
        } catch (timeoutError) {
          // Si es un timeout, lanzar el error para que se maneje en el catch externo
          if (timeoutError.message?.includes('Timeout')) {
            console.warn('⚠️ Timeout en Gemini después de 80 segundos, usando respuesta básica');
            throw timeoutError;
          }
          // Si es otro error, también lanzarlo
          throw timeoutError;
        }
      } catch (error) {
        console.error('Error generando respuesta con Gemini:', error);
        console.error('Error details:', error.message);
        
        // Si es un timeout o error de API, usar respuesta básica inmediatamente
        if (error.message?.includes('Timeout') || error.message?.includes('timeout')) {
          console.warn('⚠️ Timeout en Gemini, usando respuesta básica');
          return this.generateBasicResponse(userMessage, toolResults);
        }
        
        // Si es un error de API de Gemini (rate limit, etc), usar fallback
        if (error.message?.includes('API') || error.message?.includes('quota') || error.message?.includes('429')) {
          console.warn('⚠️ Error de API de Gemini, usando respuesta básica');
          return this.generateBasicResponse(userMessage, toolResults);
        }
        
        // Fallback a implementación básica si Gemini falla por cualquier razón
        console.warn('⚠️ Error desconocido en Gemini, usando respuesta básica');
        return this.generateBasicResponse(userMessage, toolResults);
      }
    }
    
    // Fallback a implementación básica si Gemini no está disponible
    return this.generateBasicResponse(userMessage, toolResults);
  }

  /**
   * Genera una respuesta básica cuando Gemini no está disponible
   */
  generateBasicResponse(userMessage, toolResults) {
    let response = '';

    // Si tenemos resultados de herramientas, usarlos para construir la respuesta
    if (toolResults.artworks && toolResults.artworks.data) {
      const artworks = toolResults.artworks.data;
      if (artworks.length > 0) {
        response += `¡Perfecto! He encontrado ${artworks.length} obra(s) que podrían interesarte:\n\n`;
        artworks.slice(0, 5).forEach((artwork, index) => {
          response += `${index + 1}. **${artwork.title}** (${artwork.category})\n`;
          response += `   Por ${artwork.creator || 'Desconocido'}${artwork.year ? ` (${artwork.year})` : ''}\n`;
          if (artwork.description) {
            response += `   ${artwork.description.substring(0, 150)}${artwork.description.length > 150 ? '...' : ''}\n`;
          }
          response += '\n';
        });
        
        if (artworks.length > 5) {
          response += `\nY hay ${artworks.length - 5} obra(s) más. ¿Te gustaría que te muestre más o prefieres información sobre alguna de estas?`;
        } else {
          response += `\n¿Te gustaría más información sobre alguna de estas obras?`;
        }
      } else {
        response += `No encontré obras que coincidan exactamente con tu búsqueda. `;
        response += `¿Podrías ser más específico? Por ejemplo, puedes decirme:\n`;
        response += `- "Recomiéndame películas de ciencia ficción"\n`;
        response += `- "Busca música de rock"\n`;
        response += `- "Quiero leer libros de fantasía"\n\n`;
        response += `También puedo hacerte recomendaciones personalizadas basadas en tu perfil de personalidad.`;
      }
    }

    if (toolResults.artwork && toolResults.artwork.data) {
      const artwork = toolResults.artwork.data;
      response += `Aquí tienes información sobre **${artwork.title}**:\n\n`;
      response += `- **Categoría**: ${artwork.category}\n`;
      response += `- **Creador**: ${artwork.creator || 'Desconocido'}\n`;
      if (artwork.year) response += `- **Año**: ${artwork.year}\n`;
      if (artwork.description) response += `- **Descripción**: ${artwork.description}\n`;
      if (artwork.rating) response += `- **Calificación**: ${artwork.rating}/10\n`;
      response += '\n';
      response += `¿Te gustaría que te recomiende obras similares o relacionadas?`;
    }

    // Si no hay resultados específicos, SIEMPRE dar algo útil (nunca "no pude encontrar/satisfacer")
    if (!response) {
      const normalized = this.normalizeForIntent(userMessage);

      if (normalized.includes('hola') || normalized.includes('hi') || normalized.includes('hello') || normalized.length < 4) {
        response = `¡Hola! 👋 Soy tu asistente de Dream Lodge. `;
        if (toolResults.oceanResults && toolResults.oceanResults.data) {
          response += `Tengo tu perfil de personalidad, así que puedo recomendarte cosas que encajen contigo. `;
        }
        response += `Puedo ayudarte a buscar películas, música, libros, videojuegos o arte, y explicarte por qué te podrían gustar.\n\n¿Qué te apetece explorar?`;
      } else if (this.messageMatches(userMessage, ['recomienda', 'recomiendame', 'sugerencia', 'sugiere', 'algo para', 'que deberia', 'algo de'])) {
        response = `¡Claro! `;
        if (toolResults.oceanResults && toolResults.oceanResults.data) {
          response += `Con tu perfil puedo afinar recomendaciones. `;
        }
        response += `¿Qué te gusta más: películas, música, libros, videojuegos o arte? O dime un género (drama, comedia, sci-fi, etc.) y te sugiero cosas.`;
      } else {
        // Cualquier otro mensaje: ofrecer ayuda concreta sin decir que no entendimos
        response = `Puedo ayudarte a buscar y recomendar contenido. `;
        if (toolResults.oceanResults && toolResults.oceanResults.data) {
          response += `Tengo tu perfil de personalidad para sugerirte cosas que encajen contigo. `;
        }
        response += `Prueba por ejemplo: "recomiéndame películas", "busca música de rock" o "algo para leer". ¿Qué te apetece?`;
      }
    }

    return response.trim();
  }
}

// Exportar instancia singleton
const aiAgent = new AIAgent();
module.exports = aiAgent;
