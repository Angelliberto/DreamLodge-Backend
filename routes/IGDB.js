const express = require("express");
const router = express.Router();
const { searchGames } = require("../controllers/IGDB");

/**
 * @swagger
 * tags:
 *   name: IGDB
 *   description: Búsqueda de videojuegos via IGDB
 */

/**
 * @swagger
 * /igdb/search:
 *   post:
 *     summary: Buscar videojuegos en IGDB
 *     tags: [IGDB]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - search
 *             properties:
 *               search:
 *                 type: string
 *                 description: Término de búsqueda
 *                 example: "Batman"
 *     responses:
 *       200:
 *         description: Resultados de búsqueda obtenidos correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   cover:
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                   rating:
 *                     type: number
 *                   first_release_date:
 *                     type: integer
 *                   genres:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                   summary:
 *                     type: string
 *       400:
 *         description: El término search es requerido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "El término 'search' es requerido"
 *       500:
 *         description: Error buscando juegos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Error buscando juegos"
 */
router.post("/search", searchGames);

module.exports = router;