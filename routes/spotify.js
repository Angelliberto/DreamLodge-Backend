// /routes/spotify.routes.js

const express = require('express');
const router = express.Router();

// Importamos el controlador
const spotifyController = require('../controllers/spotify');

// Importamos el validador (si tuviéramos rutas con validación)
// const { validateSearch } = require('../validators/spotify.validator');
// const { validationMiddleware } = require('../middlewares/validation.middleware');

// 🎯 Ruta para obtener el token de aplicación
// Tu frontend llamará a /api/spotify-token
router.get('/token', spotifyController.getAppAccessToken);


// Ejemplo de otra ruta con validación:
/*
router.get(
    '/search', 
    validateSearch, // 1. Aplica las reglas de validación
    validationMiddleware, // 2. Maneja los errores de validación
    spotifyController.searchCatalog // 3. Ejecuta la lógica si es válido
);
*/

module.exports = router;