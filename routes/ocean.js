const express = require('express');
const router = express.Router();
const { authUser } = require("../middleware/session");
const {
  saveTestResults,
  getTestResults,
  getUserTestResults,
  deleteTestResults,
  generateArtisticDescription
} = require("../controllers/ocean");

// Guardar o actualizar resultados del test OCEAN
// POST /api/ocean
// Body: { entityType: 'user'|'artwork'|'genre', entityId: ObjectId, scores: {...}, totalScore: Number }
router.post("/", authUser, saveTestResults);

// Rutas específicas de usuario (deben ir antes de las rutas genéricas)
// Obtener todos los resultados del test de un usuario
// GET /api/ocean/user/:userId
router.get("/user/:userId", authUser, getUserTestResults);

// Generar o obtener descripción artística del usuario
// POST /api/ocean/user/:userId/artistic-description
router.post("/user/:userId/artistic-description", authUser, generateArtisticDescription);

// Rutas genéricas (deben ir después de las rutas específicas)
// Obtener resultados del test por entityType y entityId
// GET /api/ocean/:entityType/:entityId
router.get("/:entityType/:entityId", authUser, getTestResults);

// Eliminar resultados del test (soft delete)
// DELETE /api/ocean/:entityType/:entityId
router.delete("/:entityType/:entityId", authUser, deleteTestResults);

module.exports = router;
