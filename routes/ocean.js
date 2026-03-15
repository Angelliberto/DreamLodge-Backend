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

// Obtener resultados del test por entityType y entityId
// GET /api/ocean/:entityType/:entityId
router.get("/:entityType/:entityId", authUser, getTestResults);

// Obtener todos los resultados del test de un usuario
// GET /api/ocean/user/:userId
router.get("/user/:userId", authUser, getUserTestResults);

// Eliminar resultados del test (soft delete)
// DELETE /api/ocean/:entityType/:entityId
router.delete("/:entityType/:entityId", authUser, deleteTestResults);

// Generar o obtener descripción artística del usuario
// POST /api/ocean/user/:userId/artistic-description
router.post("/user/:userId/artistic-description", authUser, generateArtisticDescription);

module.exports = router;
