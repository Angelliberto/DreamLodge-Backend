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
        this.geminiClient = new GoogleGenerativeAI(this.geminiApiKey);
        console.log('✅ Gemini API inicializada correctamente');
      } catch (error) {
        console.error('❌ Error inicializando Gemini API:', error.message);
      }
    } else {
      console.warn('⚠️ GEMINI_API_KEY no está configurada. El agente usará respuestas básicas.');
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

      // 3. Analizar el mensaje del usuario para determinar qué herramientas usar
      const toolsToUse = await this.analyzeMessageAndSelectTools(userMessage, {
        contextItems,
        conversationHistory,
      });

      // 4. Ejecutar herramientas de base de datos si es necesario
      let toolResults = {};
      if (toolsToUse.length > 0) {
        toolResults = await this.executeTools(toolsToUse, userMessage, {
          userId,
          contextItems,
        });
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
   * Analiza el mensaje del usuario y determina qué herramientas usar
   */
  async analyzeMessageAndSelectTools(userMessage, options = {}) {
    const { contextItems = [], conversationHistory = [] } = options;
    const message = userMessage.toLowerCase();
    const tools = [];

    // Detectar búsquedas de obras
    if (
      message.includes('buscar') ||
      message.includes('encontrar') ||
      message.includes('película') ||
      message.includes('música') ||
      message.includes('libro') ||
      message.includes('videojuego') ||
      message.includes('arte')
    ) {
      tools.push('search_artworks');
    }

    // Detectar preguntas sobre obras específicas
    if (
      message.includes('información sobre') ||
      message.includes('detalles de') ||
      message.includes('qué es') ||
      message.includes('cuéntame sobre')
    ) {
      tools.push('get_artwork_by_id');
    }

    // Detectar solicitudes de recomendaciones
    if (
      message.includes('recomiéndame') ||
      message.includes('sugerencia') ||
      message.includes('qué debería ver') ||
      message.includes('qué debería escuchar') ||
      message.includes('qué debería leer')
    ) {
      tools.push('search_artworks');
      if (options.userId) {
        tools.push('get_user_ocean_results');
        tools.push('get_user_favorites');
      }
    }

    return tools;
  }

  /**
   * Ejecuta las herramientas de base de datos seleccionadas
   */
  async executeTools(tools, userMessage, options = {}) {
    const { userId = null, contextItems = [] } = options;
    const results = {};

    for (const tool of tools) {
      try {
        switch (tool) {
          case 'search_artworks':
            // Extraer parámetros de búsqueda del mensaje
            const searchParams = this.extractSearchParams(userMessage);
            results.artworks = await this.searchArtworks(searchParams);
            break;

          case 'get_user_ocean_results':
            if (userId) {
              results.oceanResults = await this.getUserOceanResults(userId);
            }
            break;

          case 'get_user_favorites':
            if (userId) {
              results.favorites = await this.getUserFavorites(userId);
            }
            break;

          case 'get_artwork_by_id':
            // Intentar extraer ID de artwork del mensaje o contexto
            const artworkId = this.extractArtworkId(userMessage, contextItems);
            if (artworkId) {
              results.artwork = await this.getArtworkById(artworkId);
            }
            break;

          default:
            console.warn(`Herramienta desconocida: ${tool}`);
        }
      } catch (error) {
        console.error(`Error ejecutando herramienta ${tool}:`, error.message);
        results[tool] = { error: error.message };
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
   * Extrae parámetros de búsqueda del mensaje del usuario
   */
  extractSearchParams(message) {
    const params = {};
    const lowerMessage = message.toLowerCase();

    // Detectar categoría
    const categories = ['cine', 'música', 'literatura', 'arte-visual', 'videojuegos'];
    for (const category of categories) {
      if (lowerMessage.includes(category) || lowerMessage.includes(category.replace('-', ' '))) {
        params.category = category;
        break;
      }
    }

    // Detectar fuente (menos común, pero posible)
    const sources = ['tmdb', 'spotify', 'igdb', 'googlebooks'];
    for (const source of sources) {
      if (lowerMessage.includes(source)) {
        params.source = source.toUpperCase();
        break;
      }
    }

    // Intentar extraer título (texto entre comillas o después de ciertas palabras clave)
    const titleMatch = message.match(/"([^"]+)"/) || message.match(/título[:\s]+(.+?)(?:\.|$)/i);
    if (titleMatch) {
      params.title = titleMatch[1].trim();
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
          const model = this.geminiClient.getGenerativeModel({ model: 'gemini-pro' });
          const result = await model.generateContent(prompt);
          const response = result.response;
          const text = response.text().trim();
          
          // Intentar extraer JSON de la respuesta
          let jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonResult = JSON.parse(jsonMatch[0]);
            return jsonResult;
          } else {
            // Si no se puede parsear, usar fallback
            console.warn('No se pudo extraer JSON de la respuesta de Gemini, usando fallback');
            return this.generateArtisticDescriptionFromScores(scores, oceanResult.testType);
          }
        } catch (error) {
          console.error('Error generando descripción artística con Gemini:', error);
          // Fallback a implementación basada en reglas
          return this.generateArtisticDescriptionFromScores(scores, oceanResult.testType);
        }
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
        
        // Construir el prompt completo
        const fullPrompt = `${contextText}Mensaje del usuario: ${userMessage}\n\nResponde de manera natural, amigable y útil. Si hay obras encontradas, preséntalas de forma atractiva. Si no hay resultados específicos, ofrece ayuda para refinar la búsqueda.`;
        
        const result = await model.generateContent(fullPrompt);
        const response = result.response;
        const text = response.text();
        
        return text.trim();
      } catch (error) {
        console.error('Error generando respuesta con Gemini:', error);
        // Fallback a implementación básica si Gemini falla
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
        response += `He encontrado ${artworks.length} obra(s) que podrían interesarte:\n\n`;
        artworks.slice(0, 5).forEach((artwork, index) => {
          response += `${index + 1}. **${artwork.title}** (${artwork.category})\n`;
          response += `   Por ${artwork.creator}${artwork.year ? ` (${artwork.year})` : ''}\n`;
          if (artwork.description) {
            response += `   ${artwork.description.substring(0, 100)}...\n`;
          }
          response += '\n';
        });
      } else {
        response += 'No encontré obras que coincidan con tu búsqueda. ¿Podrías ser más específico?\n\n';
      }
    }

    if (toolResults.artwork && toolResults.artwork.data) {
      const artwork = toolResults.artwork.data;
      response += `Aquí tienes información sobre **${artwork.title}**:\n\n`;
      response += `- **Categoría**: ${artwork.category}\n`;
      response += `- **Creador**: ${artwork.creator}\n`;
      if (artwork.year) response += `- **Año**: ${artwork.year}\n`;
      if (artwork.description) response += `- **Descripción**: ${artwork.description}\n`;
      if (artwork.rating) response += `- **Calificación**: ${artwork.rating}/10\n`;
      response += '\n';
    }

    // Si no hay resultados específicos, proporcionar una respuesta genérica
    if (!response) {
      response = `Entiendo que estás buscando información sobre contenido cultural. `;
      
      if (toolResults.oceanResults && toolResults.oceanResults.data) {
        response += `Veo que has completado tu perfil de personalidad, así que puedo hacerte recomendaciones personalizadas. `;
      }
      
      response += `¿Hay algo específico que te gustaría buscar o sobre lo que te gustaría que te recomiende algo?`;
    }

    return response.trim();
  }
}

// Exportar instancia singleton
const aiAgent = new AIAgent();
module.exports = aiAgent;
