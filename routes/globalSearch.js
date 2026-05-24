const express = require("express");
const router = express.Router();
const { globalSearch } = require("../controllers/globalSearch");

/**
 * @swagger
 * tags:
 *   name: Search
 *   description: Búsqueda global de obras culturales
 */

/**
 * @swagger
 * /search:
 *   get:
 *     summary: Buscar obras culturales
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Texto de búsqueda
 *         example: "Batman"
 *       - in: query
 *         name: categories
 *         schema:
 *           type: string
 *         description: Categorías separadas por coma
 *         example: "cine,musica"
 *       - in: query
 *         name: cinemaType
 *         schema:
 *           type: string
 *           enum: [all, movie, series]
 *           default: all
 *         description: Tipo de obra de cine
 *       - in: query
 *         name: emotions
 *         schema:
 *           type: string
 *         description: Emociones separadas por coma
 *         example: "drama,aventura"
 *       - in: query
 *         name: genres
 *         schema:
 *           type: string
 *         description: Géneros separados por coma
 *         example: "accion,comedia"
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *         description: Filtrar por autor, director o artista
 *         example: "Christopher Nolan"
 *       - in: query
 *         name: yearFrom
 *         schema:
 *           type: string
 *         description: Año de inicio del rango
 *         example: "2000"
 *       - in: query
 *         name: yearTo
 *         schema:
 *           type: string
 *         description: Año de fin del rango
 *         example: "2023"
 *     responses:
 *       200:
 *         description: Resultados de búsqueda obtenidos correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       category:
 *                         type: string
 *                         enum: [cine, musica, literatura, videojuegos, arte-visual]
 *                       creator:
 *                         type: string
 *                       imageUrl:
 *                         type: string
 *                       description:
 *                         type: string
 *                       rating:
 *                         type: number
 *                       year:
 *                         type: number
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   example: []
 */
router.get("/", globalSearch);

module.exports = router;
