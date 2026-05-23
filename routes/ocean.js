const express = require('express');
const router = express.Router();
const { authUser } = require("../middleware/session");
const {
  saveTestResults,
  getTestResults,
  getUserTestResults,
  deleteTestResults,
  generateArtisticDescription,
} = require("../controllers/ocean");

/**
 * @swagger
 * tags:
 *   name: Ocean
 *   description: Test de personalidad OCEAN (Big Five) y descripción artística
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     OceanScores:
 *       type: object
 *       required:
 *         - openness
 *         - conscientiousness
 *         - extraversion
 *         - agreeableness
 *         - neuroticism
 *       properties:
 *         openness:
 *           type: object
 *           properties:
 *             total:
 *               type: number
 *               example: 4.2
 *         conscientiousness:
 *           type: object
 *           properties:
 *             total:
 *               type: number
 *               example: 3.8
 *         extraversion:
 *           type: object
 *           properties:
 *             total:
 *               type: number
 *               example: 3.5
 *         agreeableness:
 *           type: object
 *           properties:
 *             total:
 *               type: number
 *               example: 4.1
 *         neuroticism:
 *           type: object
 *           properties:
 *             total:
 *               type: number
 *               example: 2.4
 *     OceanResult:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         entityType:
 *           type: string
 *           enum: [user, artwork]
 *         entityId:
 *           type: string
 *         testType:
 *           type: string
 *           enum: [quick, deep]
 *         responseScale:
 *           type: string
 *           enum: [ipip_1_5, legacy_neg2_pos2]
 *         scoreMetric:
 *           type: string
 *         totalScore:
 *           type: number
 *         dimensions:
 *           type: object
 *           properties:
 *             openness:
 *               type: number
 *             conscientiousness:
 *               type: number
 *             extraversion:
 *               type: number
 *             agreeableness:
 *               type: number
 *             neuroticism:
 *               type: number
 *         scores:
 *           $ref: '#/components/schemas/OceanScores'
 *         createdAt:
 *           type: string
 *         updatedAt:
 *           type: string
 */

/**
 * @swagger
 * /ocean:
 *   post:
 *     summary: Guardar o actualizar resultados del test OCEAN
 *     tags: [Ocean]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *               - entityId
 *               - scores
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [user, artwork]
 *                 description: Tipo de entidad
 *               entityId:
 *                 type: string
 *                 description: ObjectId de la entidad
 *               scores:
 *                 $ref: '#/components/schemas/OceanScores'
 *               totalScore:
 *                 type: number
 *                 description: Puntuación total
 *               testType:
 *                 type: string
 *                 enum: [quick, deep]
 *                 default: quick
 *               responseScale:
 *                 type: string
 *                 enum: [ipip_1_5, legacy_neg2_pos2]
 *                 default: ipip_1_5
 *               scoreMetric:
 *                 type: string
 *                 enum: [ipip_mean_1_5]
 *     responses:
 *       200:
 *         description: Resultados guardados correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/OceanResult'
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Entidad no encontrada
 *       500:
 *         description: Error del servidor
 */
router.post("/", authUser, saveTestResults);

/**
 * @swagger
 * /ocean/user/{userId}:
 *   get:
 *     summary: Obtener todos los resultados del test de un usuario
 *     tags: [Ocean]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId del usuario
 *     responses:
 *       200:
 *         description: Resultados obtenidos correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/OceanResult'
 *       400:
 *         description: userId inválido
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
 */
router.get("/user/:userId", authUser, getUserTestResults);

/**
 * @swagger
 * /ocean/user/{userId}/artistic-description:
 *   post:
 *     summary: Generar o obtener descripción artística del usuario basada en su perfil OCEAN
 *     tags: [Ocean]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId del usuario
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forceRegenerate:
 *                 type: boolean
 *                 default: false
 *                 description: Forzar regeneración aunque ya exista una descripción guardada
 *     responses:
 *       200:
 *         description: Descripción artística obtenida o generada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     profile:
 *                       type: string
 *                     description:
 *                       type: string
 *                     recommendations:
 *                       type: array
 *                       items:
 *                         type: string
 *                     suggestedWorks:
 *                       type: array
 *                       items:
 *                         type: object
 *                     _meta:
 *                       type: object
 *                       properties:
 *                         generatedAt:
 *                           type: integer
 *                         promptVersion:
 *                           type: string
 *                 regenerated:
 *                   type: boolean
 *       400:
 *         description: userId inválido
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado para regenerar la descripción
 *       404:
 *         description: No se encontraron resultados del test
 *       502:
 *         description: Error del servicio de IA
 *       500:
 *         description: Error del servidor
 */
router.post("/user/:userId/artistic-description", authUser, generateArtisticDescription);

/**
 * @swagger
 * /ocean/{entityType}/{entityId}:
 *   get:
 *     summary: Obtener resultados del test por entityType y entityId
 *     tags: [Ocean]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user, artwork]
 *         description: Tipo de entidad
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId de la entidad
 *     responses:
 *       200:
 *         description: Resultados obtenidos correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/OceanResult'
 *       400:
 *         description: entityType inválido
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Resultados no encontrados
 *       500:
 *         description: Error del servidor
 *   delete:
 *     summary: Eliminar resultados del test (borrado suave)
 *     tags: [Ocean]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user, artwork]
 *         description: Tipo de entidad
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *         description: ObjectId de la entidad
 *     responses:
 *       200:
 *         description: Resultados eliminados correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Resultados del test eliminados correctamente"
 *       400:
 *         description: entityType inválido
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Resultados no encontrados
 *       500:
 *         description: Error del servidor
 */
router.get("/:entityType/:entityId", authUser, getTestResults);
router.delete("/:entityType/:entityId", authUser, deleteTestResults);

module.exports = router;
