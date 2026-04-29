const { handleHTTPError } = require("../utils/handleHTTPError");
const { OceanModel, UserModel, ArtworkModel } = require("../models");
const mongoose = require("mongoose");
const ai = require("../services/ai");

const BIG_FIVE_TRAITS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
const ARTISTIC_REFRESH_MS = 24 * 60 * 60 * 1000;
const ARTISTIC_PROMPT_VERSION = "v4-genre-specificity";

function parseArtisticDescriptionPayload(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function getArtisticMeta(payload) {
  if (!payload || typeof payload !== "object") return {};
  const meta = payload._meta && typeof payload._meta === "object" ? payload._meta : {};
  const generatedAtMs = Number.parseInt(String(meta.generatedAt || ""), 10);
  return {
    generatedAtMs: Number.isFinite(generatedAtMs) ? generatedAtMs : null,
    promptVersion: String(meta.promptVersion || "").trim() || null,
  };
}

/** Hay subfacetas guardadas (no solo total) → corresponde a test profundo. */
const scoresHaveSubfacetDetail = (scores) => {
  if (!scores || typeof scores !== 'object') return false;
  for (const trait of BIG_FIVE_TRAITS) {
    const o = scores[trait];
    if (!o || typeof o !== 'object') continue;
    for (const k of Object.keys(o)) {
      if (k !== 'total' && typeof o[k] === 'number') return true;
    }
  }
  return false;
};

/**
 * Convierte un documento Ocean guardado al formato que consume el frontend (test_results, etc.).
 * - dimensions: totales 0–5 por rasgo
 * - subfacetas (solo test deep): valores en escala -2..+2 como arrays de un elemento (como tras calcular en cliente)
 * Incluye `scores` crudo por compatibilidad.
 */
const formatOceanForFrontend = (doc) => {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const scores = plain.scores && typeof plain.scores === 'object' ? plain.scores : {};
  let testType = plain.testType === 'deep' ? 'deep' : 'quick';
  if (testType === 'quick' && scoresHaveSubfacetDetail(scores)) {
    testType = 'deep';
  }

  const dimensions = {};
  const subfacets = {};

  for (const trait of BIG_FIVE_TRAITS) {
    const scoreObj = scores[trait];
    if (!scoreObj || typeof scoreObj !== 'object') continue;

    if (typeof scoreObj.total === 'number') {
      dimensions[trait] = scoreObj.total;
    }

    if (testType === 'deep') {
      const facetEntries = {};
      for (const key of Object.keys(scoreObj)) {
        if (key === 'total') continue;
        const val = scoreObj[key];
        if (typeof val !== 'number') continue;
        // Backend almacena subfacetas en 0–5; frontend espera -2..+2 en arrays
        const onNegTwoToTwo = ((val / 5) * 4) - 2;
        facetEntries[key] = [onNegTwoToTwo];
      }
      if (Object.keys(facetEntries).length > 0) {
        subfacets[trait] = facetEntries;
      }
    }
  }

  return {
    _id: plain._id,
    entityType: plain.entityType,
    entityId: plain.entityId,
    testType,
    timestamp: plain.updatedAt || plain.createdAt,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    totalScore: plain.totalScore,
    dimensions,
    ...(testType === 'deep' && Object.keys(subfacets).length > 0 ? { subfacets } : {}),
    scores
  };
};

/**
 * Validar la estructura de scores según el schema OCEAN
 */
const validateScoresStructure = (scores) => {
  if (!scores || typeof scores !== 'object') {
    return { valid: false, message: "scores debe ser un objeto" };
  }

  const requiredTraits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
  const missingTraits = requiredTraits.filter(trait => !scores[trait]);

  if (missingTraits.length > 0) {
    return { 
      valid: false, 
      message: `scores debe incluir las siguientes dimensiones: ${missingTraits.join(', ')}` 
    };
  }

  // Validar que cada trait tenga al menos la propiedad total
  for (const trait of requiredTraits) {
    if (!scores[trait] || typeof scores[trait] !== 'object') {
      return { 
        valid: false, 
        message: `${trait} debe ser un objeto con al menos la propiedad 'total'` 
      };
    }
    if (typeof scores[trait].total !== 'number') {
      return { 
        valid: false, 
        message: `${trait}.total debe ser un número` 
      };
    }
  }

  return { valid: true };
};

/**
 * Guardar o actualizar los resultados del test OCEAN
 * Recibe: { entityType, entityId, scores, totalScore }
 */
const saveTestResults = async (req, res) => {
  let session = null;
  let useTransaction = false;

  try {
    const { entityType, entityId, scores, totalScore, testType } = req.body;

    // Validaciones básicas
    if (!entityType || !['user', 'artwork'].includes(entityType)) {
      return handleHTTPError(res, { message: "entityType debe ser 'user' o 'artwork'" }, 400);
    }

    if (!entityId) {
      return handleHTTPError(res, { message: "entityId es requerido" }, 400);
    }

    // Validar formato de ObjectId
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      return handleHTTPError(res, { message: "entityId debe ser un ObjectId válido" }, 400);
    }

    if (!scores) {
      return handleHTTPError(res, { message: "scores es requerido" }, 400);
    }

    // Validar estructura de scores
    const scoresValidation = validateScoresStructure(scores);
    if (!scoresValidation.valid) {
      return handleHTTPError(res, { message: scoresValidation.message }, 400);
    }

    // Intentar usar transacciones si están disponibles
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (txError) {
      // Si las transacciones no están disponibles (ej: sin replica set), continuar sin ellas
      console.warn("Transacciones no disponibles, continuando sin transacciones:", txError.message);
      useTransaction = false;
    }

    // Verificar que la entidad existe
    let entityModel;
    if (entityType === 'user') {
      entityModel = UserModel;
    } else {
      entityModel = ArtworkModel;
    }

    const entityExists = useTransaction 
      ? await entityModel.findById(entityId).session(session)
      : await entityModel.findById(entityId);
      
    if (!entityExists) {
      if (useTransaction) {
        await session.abortTransaction();
        session.endSession();
      }
      return handleHTTPError(res, { message: `${entityType} no encontrado` }, 404);
    }

    // Buscar registro Ocean (si hay varios legados, actualizar el más recientemente modificado)
    const oceanQuery = OceanModel.findOne({
      entityType,
      entityId,
      deleted: false
    }).sort({ updatedAt: -1 });

    if (useTransaction) {
      oceanQuery.session(session);
    }

    let oceanResult = await oceanQuery;

    if (oceanResult) {
      // Actualizar registro existente
      // Marcar scores como modificado para asegurar que se guarde completamente
      oceanResult.scores = scores;
      oceanResult.markModified('scores');
      if (totalScore !== undefined) {
        oceanResult.totalScore = totalScore;
      }
      oceanResult.testType = testType || 'quick';
      // Nuevo test: invalidar descripción IA para que se regenere con los scores actuales
      if (entityType === 'user') {
        oceanResult.artisticDescription = null;
      }
      if (useTransaction) {
        await oceanResult.save({ session });
      } else {
        await oceanResult.save();
      }
    } else {
      // Crear nuevo registro
      if (useTransaction) {
        const created = await OceanModel.create([{
          entityType,
          entityId,
          scores,
          totalScore,
          testType: testType || 'quick'
        }], { session });
        oceanResult = created[0];
      } else {
        oceanResult = await OceanModel.create({
          entityType,
          entityId,
          scores,
          totalScore,
          testType: testType || 'quick'
        });
      }
    }

    // Actualizar oceanId en la entidad relacionada (si aplica)
    // Nota: artwork no tiene campo oceanId según el schema
    const updateOptions = useTransaction ? { session } : {};
    
    if (entityType === 'user') {
      await UserModel.findByIdAndUpdate(
        entityId, 
        { oceanId: oceanResult._id },
        updateOptions
      );
    }

    // Confirmar transacción si se usó
    if (useTransaction) {
      await session.commitTransaction();
      session.endSession();
    }

    // Obtener el resultado (solo poblar artwork; usuario sin populate)
    let populatedResult;
    if (entityType === 'user') {
      populatedResult = await OceanModel.findById(oceanResult._id);
    } else {
      populatedResult = await OceanModel.findById(oceanResult._id).populate({
        path: 'entityId',
        model: 'Artwork',
      });
    }

    if (entityType === "user") {
      try {
        const { clearPersonalizedFeedCacheForUser } = require("./feed");
        clearPersonalizedFeedCacheForUser(entityId);
      } catch (_) {
        /* opcional */
      }
    }

    return res.status(200).json({
      message: "Resultados del test guardados correctamente",
      data: formatOceanForFrontend(populatedResult)
    });

  } catch (error) {
    // Abortar transacción si estaba activa
    if (useTransaction && session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (abortError) {
        console.error("Error al abortar transacción:", abortError);
      }
    }
    
    console.error("Error guardando resultados del test:", error);
    
    // Proporcionar mensajes de error más específicos
    if (error.name === 'ValidationError') {
      return handleHTTPError(res, { 
        message: "Error de validación en los datos", 
        details: error.message 
      }, 400);
    }
    
    return handleHTTPError(res, { 
      message: "Error al guardar los resultados del test",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

/**
 * Obtener los resultados del test OCEAN por entityType y entityId
 */
const getTestResults = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    if (!entityType || !['user', 'artwork'].includes(entityType)) {
      return handleHTTPError(res, { message: "entityType debe ser 'user' o 'artwork'" }, 400);
    }

    if (!entityId) {
      return handleHTTPError(res, { message: "entityId es requerido" }, 400);
    }

    let oceanResult;
    if (entityType === 'user') {
      oceanResult = await OceanModel.findOne({
        entityType,
        entityId,
        deleted: false
      });
    } else {
      oceanResult = await OceanModel.findOne({
        entityType,
        entityId,
        deleted: false
      }).populate({
        path: 'entityId',
        model: 'Artwork',
      });
    }

    if (!oceanResult) {
      return handleHTTPError(res, { message: "Resultados del test no encontrados" }, 404);
    }

    return res.status(200).json({
      data: formatOceanForFrontend(oceanResult)
    });

  } catch (error) {
    console.error("Error obteniendo resultados del test:", error);
    console.error("Error stack:", error.stack);
    return handleHTTPError(res, { 
      message: "Error al obtener los resultados del test",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

/**
 * Obtener todos los resultados del test de un usuario específico
 * Útil para ver el historial o resultados múltiples
 */
const getUserTestResults = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleHTTPError(res, { message: "userId es requerido" }, 400);
    }

    // Validar formato de ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return handleHTTPError(res, { message: "userId debe ser un ObjectId válido" }, 400);
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return handleHTTPError(res, { message: "Usuario no encontrado" }, 404);
    }

    // Convertir userId a ObjectId para la consulta
    const oceanResults = await OceanModel.find({
      entityType: 'user',
      entityId: new mongoose.Types.ObjectId(userId),
      deleted: false
    })
      .sort({ updatedAt: -1 })
      .lean();

    const formatted = oceanResults.map((doc) => formatOceanForFrontend(doc));

    return res.status(200).json({
      data: formatted
    });

  } catch (error) {
    console.error("Error obteniendo resultados del test del usuario:", error);
    console.error("Error stack:", error.stack);
    return handleHTTPError(res, { 
      message: "Error al obtener los resultados del test del usuario",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};

/**
 * Eliminar (soft delete) resultados del test
 */
const deleteTestResults = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    if (!entityType || !['user', 'artwork'].includes(entityType)) {
      return handleHTTPError(res, { message: "entityType debe ser 'user' o 'artwork'" }, 400);
    }

    if (!entityId) {
      return handleHTTPError(res, { message: "entityId es requerido" }, 400);
    }

    const oceanResult = await OceanModel.findOneAndUpdate(
      {
        entityType,
        entityId,
        deleted: false
      },
      { deleted: true },
      { new: true }
    );

    if (!oceanResult) {
      return handleHTTPError(res, { message: "Resultados del test no encontrados" }, 404);
    }

    return res.status(200).json({
      message: "Resultados del test eliminados correctamente"
    });

  } catch (error) {
    console.error("Error eliminando resultados del test:", error);
    return handleHTTPError(res, { message: "Error al eliminar los resultados del test" }, 500);
  }
};

/**
 * Generar o obtener la descripción artística del usuario basada en sus resultados OCEAN
 * POST /api/ocean/user/:userId/artistic-description
 */
const generateArtisticDescription = async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('generateArtisticDescription called with userId:', userId);
    console.log('Request method:', req.method);
    console.log('Request path:', req.path);
    console.log('Request originalUrl:', req.originalUrl);

    if (!userId) {
      return handleHTTPError(res, { message: "userId es requerido" }, 400);
    }

    // Validar formato de ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return handleHTTPError(res, { message: "userId debe ser un ObjectId válido" }, 400);
    }

    // Buscar el resultado OCEAN más recientemente actualizado del usuario
    const oceanResult = await OceanModel.findOne({
      entityType: 'user',
      entityId: new mongoose.Types.ObjectId(userId),
      deleted: false
    }).sort({ updatedAt: -1 });

    if (!oceanResult) {
      return handleHTTPError(res, { message: "No se encontraron resultados del test para este usuario" }, 404);
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const forceRegenerate = body.forceRegenerate === true;
    const isOwner =
      req.user &&
      req.user._id &&
      String(req.user._id) === String(userId);

    if (forceRegenerate) {
      if (!isOwner) {
        return handleHTTPError(res, { message: "No autorizado para regenerar la descripción" }, 403);
      }
      if (oceanResult.artisticDescription) {
        oceanResult.artisticDescription = null;
        oceanResult.markModified("artisticDescription");
        await oceanResult.save();
      }
    }

    // Si ya tiene descripción, reutilizarla hasta 24h (a menos que se fuerce).
    if (oceanResult.artisticDescription) {
      const parsedDescription = parseArtisticDescriptionPayload(oceanResult.artisticDescription);
      if (parsedDescription) {
        const { generatedAtMs, promptVersion } = getArtisticMeta(parsedDescription);
        const isFresh =
          generatedAtMs != null && Date.now() - generatedAtMs < ARTISTIC_REFRESH_MS;
        const isCurrentPromptVersion = promptVersion === ARTISTIC_PROMPT_VERSION;
        console.log(
          "[ocean artistic-description] cache_check userId=%s isFresh=%s promptVersion=%s currentVersion=%s",
          userId,
          Boolean(isFresh),
          promptVersion || "(none)",
          ARTISTIC_PROMPT_VERSION
        );
        if (!forceRegenerate && isFresh && isCurrentPromptVersion) {
          return res.status(200).json({
            message: "Descripción artística obtenida desde caché",
            data: parsedDescription
          });
        }
      } else if (!forceRegenerate) {
        // Legacy texto plano: respetar caché en lugar de recalcular en cada visita.
        return res.status(200).json({
          message: "Descripción artística obtenida correctamente",
          data: {
            profile: "Personalizado",
            description: oceanResult.artisticDescription,
            recommendations: [],
          }
        });
      }
    }

    // Generar descripción artística (Gemini en el backend)
    const oceanPlain =
      typeof oceanResult.toObject === "function"
        ? oceanResult.toObject({ flattenMaps: true })
        : { ...oceanResult };
    let oceanJsonSafe;
    try {
      oceanJsonSafe = JSON.parse(JSON.stringify(oceanPlain));
    } catch (serErr) {
      console.error(
        "[ocean artistic-description] no se pudo serializar oceanResult:",
        serErr?.message || serErr
      );
      return handleHTTPError(
        res,
        { message: "Error interno preparando datos para el servicio de IA" },
        500
      );
    }

    const geminiOk = ai.isGeminiConfigured();
    console.log("[ocean artistic-description] Gemini configurado:", geminiOk ? "sí" : "no");
    if (geminiOk) {
      console.log(
        "[ocean artistic-description] generando, scores keys:",
        oceanJsonSafe.scores && typeof oceanJsonSafe.scores === "object"
          ? Object.keys(oceanJsonSafe.scores)
          : "(sin scores)"
      );
    }

    let artisticDescription;
    try {
      artisticDescription = await ai.generateArtisticDescription(oceanJsonSafe, {
        userId,
        regenerationSeed: forceRegenerate ? Date.now() : undefined,
      });
      const swCount = Array.isArray(artisticDescription?.suggestedWorks)
        ? artisticDescription.suggestedWorks.length
        : 0;
      const gr = artisticDescription?.genreRecommendations;
      const grKeys =
        gr && typeof gr === "object" ? Object.keys(gr).join(",") : "none";
      console.log(
        "[ocean artistic-description] generado userId=%s forceRegenerate=%s suggestedWorks=%s genreRecommendations_keys=%s | obras detalladas: busca en logs el prefijo [dreamlodge][ia_obras] artistic_description",
        userId,
        Boolean(forceRegenerate),
        swCount,
        grKeys
      );
    } catch (genErr) {
      console.error("[ocean artistic-description] fallo IA:", genErr?.message || genErr);
      return handleHTTPError(
        res,
        {
          message:
            genErr?.response?.data?.error ||
            genErr?.message ||
            "Error al generar la descripción artística",
        },
        genErr.statusCode || genErr?.response?.status || 502
      );
    }

    // Guardar la descripción en el modelo Ocean
    const artisticPayload = {
      ...artisticDescription,
      _meta: {
        generatedAt: Date.now(),
        refreshPolicy: "daily_or_on_change",
        promptVersion: ARTISTIC_PROMPT_VERSION,
      },
    };
    console.log(
      "[ocean artistic-description] save userId=%s promptVersion=%s suggestedWorks=%s",
      userId,
      ARTISTIC_PROMPT_VERSION,
      Array.isArray(artisticPayload?.suggestedWorks) ? artisticPayload.suggestedWorks.length : 0
    );
    oceanResult.artisticDescription = JSON.stringify(artisticPayload);
    await oceanResult.save();

    try {
      const { clearPersonalizedFeedCacheForUser } = require("./feed");
      clearPersonalizedFeedCacheForUser(userId);
    } catch (_) {
      /* evitar ciclo o fallo opcional */
    }

    return res.status(200).json({
      message: "Descripción artística generada correctamente",
      data: artisticPayload
    });

  } catch (error) {
    console.error("Error generando descripción artística:", error);
    console.error("Error stack:", error.stack);
    return handleHTTPError(res, {
      message: "Error al generar la descripción artística",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, 500);
  }
};


module.exports = {
  saveTestResults,
  getTestResults,
  getUserTestResults,
  deleteTestResults,
  generateArtisticDescription
};
