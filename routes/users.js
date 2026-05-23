const express = require('express');
const router = express.Router();
const {authUser} = require("../middleware/session");
const passport = require("../middleware/googleAuth");
const {
  userRegister,
  userLogin,
  userDelete,
  userUpdate,
  googleCallback,
  googleSignInWithToken,
  sendPasswordResetEmail,
  checkPasswordResetToken,
  resetPassword,
  exchangeAuthSession,
  verifyEmailCode,
  resendVerificationCode
} = require("../controllers/users");
const {
  userRegisterValidator,
  userLoginValidator,
  userUpdateValidator,
  googleSignInValidator
} = require("../validators/users");

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Gestión de usuarios y autenticación
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *         email:
 *           type: string
 *         birthdate:
 *           type: string
 *         validated_email:
 *           type: boolean
 *     AuthResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           description: JWT de autenticación
 *         user:
 *           $ref: '#/components/schemas/User'
 */

/**
 * @swagger
 * /users/register:
 *   post:
 *     summary: Registrar un nuevo usuario
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Juan García"
 *               email:
 *                 type: string
 *                 example: "juan@ejemplo.com"
 *               password:
 *                 type: string
 *                 example: "MiPassword.01"
 *               birthdate:
 *                 type: string
 *                 example: "1990-01-15"
 *     responses:
 *       201:
 *         description: Usuario registrado correctamente. Se envía email de verificación.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 message:
 *                   type: string
 *       409:
 *         description: Email ya en uso
 *       500:
 *         description: Error del servidor
 */
router.post("/register", userRegisterValidator, userRegister);

/**
 * @swagger
 * /users/login:
 *   post:
 *     summary: Iniciar sesión
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: "juan@ejemplo.com"
 *               password:
 *                 type: string
 *                 example: "MiPassword.01"
 *     responses:
 *       200:
 *         description: Login correcto
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Contraseña incorrecta
 *       403:
 *         description: Email no verificado
 *       404:
 *         description: Usuario no encontrado
 */
router.post("/login", userLoginValidator, userLogin);

/**
 * @swagger
 * /users/delete:
 *   delete:
 *     summary: Eliminar cuenta del usuario autenticado
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usuario eliminado correctamente
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 */
router.delete("/delete", authUser, userDelete);

/**
 * @swagger
 * /users/update:
 *   patch:
 *     summary: Actualizar datos del usuario autenticado
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               birthdate:
 *                 type: string
 *     responses:
 *       200:
 *         description: Usuario actualizado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 */
router.patch("/update", authUser, userUpdateValidator, userUpdate);

/**
 * @swagger
 * /users/verify-email:
 *   post:
 *     summary: Verificar email con código de verificación
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 example: "juan@ejemplo.com"
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email verificado correctamente
 *       400:
 *         description: Código inválido o expirado
 *       404:
 *         description: Usuario no encontrado
 *       429:
 *         description: Demasiados intentos
 */
router.post("/verify-email", verifyEmailCode);

/**
 * @swagger
 * /users/resend-verification-code:
 *   post:
 *     summary: Reenviar código de verificación de email
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "juan@ejemplo.com"
 *     responses:
 *       200:
 *         description: Código reenviado correctamente
 *       400:
 *         description: Email ya verificado
 */
router.post("/resend-verification-code", resendVerificationCode);

/**
 * @swagger
 * /users/google:
 *   get:
 *     summary: Iniciar flujo OAuth con Google
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: redirect_uri
 *         schema:
 *           type: string
 *         description: URI de redirección tras autenticación (deep link para móvil o URL web)
 *     responses:
 *       302:
 *         description: Redirige a Google para autenticación
 */
router.get("/google", (req, res, next) => {
  const redirectUri = req.query.redirect_uri;
  if (redirectUri) {
    const state = Buffer.from(JSON.stringify({ redirect_uri: redirectUri })).toString('base64');
    console.log("Google OAuth: Starting with redirect_uri:", redirectUri.substring(0, 50) + "...");
    passport.authenticate("google", {
      scope: ["profile", "email"],
      state: state
    })(req, res, next);
  } else {
    console.log("Google OAuth: No redirect_uri provided");
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  }
});

/**
 * @swagger
 * /users/google/callback:
 *   get:
 *     summary: Callback de Google OAuth
 *     tags: [Users]
 *     description: >
 *       Google redirige aquí tras la autenticación.
 *       Si hay redirect_uri en el state, redirige al cliente con token o session code.
 *       Si no, devuelve JSON con token y datos del usuario.
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Código de autorización de Google
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: State con redirect_uri codificado en base64
 *     responses:
 *       200:
 *         description: Autenticación correcta, devuelve token y usuario
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       302:
 *         description: Redirección al cliente con token o session code
 *       400:
 *         description: Código de autorización inválido o ausente
 *       401:
 *         description: Autenticación fallida
 *       500:
 *         description: Error del servidor
 */
router.get("/google/callback", (req, res, next) => {
  if (!req.query.code) {
    console.error("Google Callback: No authorization code provided");
    return res.status(400).json({
      message: "Authorization code is required",
      error: "Missing 'code' parameter in callback URL"
    });
  }

  if (req.query.code === 'AUTHORIZATION_CODE' || req.query.code === '') {
    console.error("Google Callback: Invalid authorization code provided");
    return res.status(400).json({
      message: "Invalid authorization code",
      error: "Please use a valid authorization code from Google OAuth flow"
    });
  }

  let redirectUri = null;
  if (req.query.state) {
    try {
      const stateData = JSON.parse(Buffer.from(req.query.state, 'base64').toString());
      redirectUri = stateData.redirect_uri;
      req.redirect_uri = redirectUri;
    } catch (e) {
      console.error("Error parsing state:", e);
    }
  }

  passport.authenticate("google", {
    session: false,
    failureRedirect: undefined
  }, (err, user, info) => {
    if (err) {
      if (err.name === 'TokenError' || err.message.includes('auth code')) {
        return res.status(400).json({
          message: "Invalid or expired authorization code",
          error: "The authorization code is invalid, expired, or has already been used. Please try signing in again.",
          details: err.message
        });
      }
      return res.status(500).json({
        message: "Google authentication failed",
        error: err.message,
        errorType: err.name
      });
    }
    if (!user) {
      return res.status(401).json({
        message: "Google authentication failed - no user",
        info: info
      });
    }
    req.user = user;
    if (redirectUri) {
      req.query.redirect_uri = redirectUri;
    }
    next();
  })(req, res, next);
}, googleCallback);

/**
 * @swagger
 * /users/google/token:
 *   post:
 *     summary: Iniciar sesión con token de Google (flujo nativo móvil)
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Google ID token obtenido desde la app móvil
 *     responses:
 *       200:
 *         description: Autenticación correcta
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Token requerido o sin email
 *       401:
 *         description: Token de Google inválido
 */
router.post("/google/token", googleSignInValidator, googleSignInWithToken);

/**
 * @swagger
 * /users/google/exchange:
 *   get:
 *     summary: Intercambiar session code por token JWT (flujo web seguro)
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: session
 *         required: true
 *         schema:
 *           type: string
 *         description: Session code de un solo uso obtenido en el callback de Google
 *     responses:
 *       200:
 *         description: Token obtenido correctamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Session code inválido, expirado o ya usado
 */
router.get("/google/exchange", exchangeAuthSession);

/**
 * @swagger
 * /users/forgot-password:
 *   post:
 *     summary: Enviar email para restablecer contraseña
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "juan@ejemplo.com"
 *     responses:
 *       200:
 *         description: Si el email existe se envían instrucciones
 *       400:
 *         description: Email requerido
 *       500:
 *         description: Error al enviar el correo
 */
router.post("/forgot-password", sendPasswordResetEmail);

/**
 * @swagger
 * /users/check-reset-token:
 *   get:
 *     summary: Verificar si un token de reset de contraseña es válido
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token de reset de contraseña
 *     responses:
 *       200:
 *         description: Token válido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Valid password reset token"
 *       400:
 *         description: Token requerido
 *       404:
 *         description: Token inválido o expirado
 */
router.get("/check-reset-token", checkPasswordResetToken);

/**
 * @swagger
 * /users/reset-password:
 *   post:
 *     summary: Restablecer contraseña con token
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token de reset recibido por email
 *               newPassword:
 *                 type: string
 *                 description: Nueva contraseña
 *                 example: "NuevaPassword.01"
 *     responses:
 *       200:
 *         description: Contraseña restablecida correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Token o nueva contraseña requeridos
 *       404:
 *         description: Token inválido o expirado
 */
router.post("/reset-password", resetPassword);

module.exports = router;