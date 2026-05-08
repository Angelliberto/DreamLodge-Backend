const nodemailer = require("nodemailer");
require("dotenv").config();

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Validar que las variables de entorno estén configuradas
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn("⚠️  ADVERTENCIA: EMAIL_USER o EMAIL_PASS no están configurados en las variables de entorno.");
  console.warn("   El envío de correos no funcionará hasta que se configuren estas variables.");
}

let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    // Opciones adicionales para mejor compatibilidad
    tls: {
        rejectUnauthorized: false
    }
});

// Verificar la conexión al inicializar (opcional, para debugging)
transporter.verify(function (error, success) {
    if (error) {
        console.error("❌ Error verificando la configuración del transporter de correo:", error);
        console.error("   Asegúrate de que:");
        console.error("   1. EMAIL_USER y EMAIL_PASS estén configurados en .env");
        console.error("   2. Si usas Gmail, necesitas una 'App Password' (no tu contraseña normal)");
        console.error("   3. La verificación en dos pasos debe estar habilitada en Gmail");
    } else {
        console.log("✅ Configuración del correo verificada correctamente");
    }
});

const sendEmail = async (email, subject, message, url, buttonText = "Restablecer contraseña") => {
  return new Promise((resolve, reject) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      const error = new Error("EMAIL_USER y EMAIL_PASS deben estar configurados en las variables de entorno");
      console.error("Error de configuración:", error.message);
      return reject(error);
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${subject}</title>
        </head>
        <body style="margin:0; padding:0; background-color:#020617; font-family:Arial, Helvetica, sans-serif;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#020617; margin:0; padding:0;">
            <tr>
              <td align="center" style="padding:32px 16px;">

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">

                  <tr>
                    <td align="center" style="padding-bottom:24px;">
                      <div style="
                        width:64px;
                        height:64px;
                        line-height:64px;
                        text-align:center;
                        border-radius:16px;
                        background-color:rgba(255,255,255,0.08);
                        border:1px solid rgba(255,255,255,0.14);
                        color:#d8b4fe;
                        font-size:30px;
                        font-weight:bold;
                        display:inline-block;
                      ">
                        ✦
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td align="center" style="padding-bottom:12px;">
                      <h1 style="margin:0; color:#ffffff; font-size:32px; line-height:1.2; font-weight:700;">
                        Dream Lodge
                      </h1>
                    </td>
                  </tr>

                  <tr>
                    <td align="center" style="padding-bottom:28px;">
                      <p style="margin:0; color:#94a3b8; font-size:16px; line-height:1.6;">
                        Recupera el acceso a tu cuenta de forma segura.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="
                      background-color:rgba(15,23,42,0.88);
                      border:1px solid rgba(148,163,184,0.22);
                      border-radius:24px;
                      padding:32px 24px;
                      box-shadow:0 10px 30px rgba(0,0,0,0.35);
                    ">
                      <p style="margin:0 0 12px 0; color:#e2e8f0; font-size:16px; line-height:1.6;">
                        Hola,
                      </p>

                      <p style="margin:0 0 18px 0; color:#cbd5e1; font-size:15px; line-height:1.7;">
                        ${message}
                      </p>

                      <div style="
                        margin:26px 0;
                        background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                        border:1px solid rgba(192,132,252,0.35);
                        border-radius:20px;
                        padding:24px 18px;
                        text-align:center;
                      ">
                        <div style="
                          color:#c084fc;
                          font-size:13px;
                          font-weight:700;
                          letter-spacing:1px;
                          text-transform:uppercase;
                          margin-bottom:16px;
                        ">
                          Restablecimiento de contraseña
                        </div>

                        <a href="${url}" style="
                          display:inline-block;
                          background:linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
                          color:#ffffff;
                          padding:14px 24px;
                          text-decoration:none;
                          border-radius:14px;
                          font-weight:700;
                          font-size:15px;
                        ">
                          ${buttonText}
                        </a>
                      </div>

                      <p style="margin:0 0 10px 0; color:#cbd5e1; font-size:15px; line-height:1.7;">
                        Por seguridad, este enlace puede expirar después de un tiempo.
                      </p>

                      <p style="margin:0 0 18px 0; color:#94a3b8; font-size:14px; line-height:1.7;">
                        Si tú no solicitaste cambiar tu contraseña, puedes ignorar este mensaje.
                        Tu contraseña actual seguirá siendo válida.
                      </p>

                      <div style="
                        margin-top:22px;
                        padding:16px;
                        border-radius:16px;
                        background-color:rgba(2,6,23,0.55);
                        border:1px solid rgba(148,163,184,0.16);
                      ">
                        <p style="margin:0 0 8px 0; color:#94a3b8; font-size:13px; line-height:1.6;">
                          Si el botón no funciona, copia y pega este enlace:
                        </p>

                        <p style="
                          margin:0;
                          color:#c4b5fd;
                          word-break:break-all;
                          font-family:Arial, Helvetica, sans-serif;
                          font-size:12px;
                          line-height:1.6;
                        ">
                          ${url}
                        </p>
                      </div>

                      <p style="margin:18px 0 0 0; color:#64748b; font-size:12px; line-height:1.7;">
                        Nota: si estás usando una versión de pruebas en Expo Go, es posible que el enlace no abra la app directamente.
                        Cuando la app esté instalada como APK, el enlace podrá abrir Dream Lodge si el deep linking está configurado.
                      </p>

                      <div style="
                        margin-top:24px;
                        padding-top:20px;
                        border-top:1px solid rgba(148,163,184,0.18);
                      ">
                        <p style="margin:0; color:#64748b; font-size:12px; line-height:1.7; text-align:center;">
                          Dream Lodge · Recuperación de contraseña
                        </p>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td align="center" style="padding-top:20px;">
                      <p style="margin:0; color:#64748b; font-size:12px; line-height:1.6;">
                        Este correo fue enviado automáticamente. No respondas a este mensaje.
                      </p>
                    </td>
                  </tr>

                </table>

              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: `${message}\n\n${buttonText}: ${url}\n\nSi no solicitaste este cambio, ignora este mensaje.`,
      html: htmlContent,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("❌ Error while sending email:", error.message);
        console.error("Error details:", {
          code: error.code,
          command: error.command,
          response: error.response,
          responseCode: error.responseCode
        });

        return reject(error);
      }

      console.log("✅ Email sent successfully:", info.response);
      console.log("Email details:", {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected
      });

      return resolve(info);
    });
  });
};
const sendVerificationEmail = async (email, code) => {
  return new Promise((resolve, reject) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return reject(new Error("EMAIL_USER y EMAIL_PASS deben estar configurados"));
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Verifica tu correo</title>
        </head>
        <body style="margin:0; padding:0; background-color:#020617; font-family:Arial, Helvetica, sans-serif;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#020617; margin:0; padding:0;">
            <tr>
              <td align="center" style="padding:32px 16px;">
                
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
                  <tr>
                    <td align="center" style="padding-bottom:24px;">
                      <div style="
                        width:64px;
                        height:64px;
                        line-height:64px;
                        text-align:center;
                        border-radius:16px;
                        background-color:rgba(255,255,255,0.08);
                        border:1px solid rgba(255,255,255,0.14);
                        color:#d8b4fe;
                        font-size:30px;
                        font-weight:bold;
                        display:inline-block;
                      ">
                        ✦
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td align="center" style="padding-bottom:12px;">
                      <h1 style="margin:0; color:#ffffff; font-size:32px; line-height:1.2; font-weight:700;">
                        Dream Lodge
                      </h1>
                    </td>
                  </tr>

                  <tr>
                    <td align="center" style="padding-bottom:28px;">
                      <p style="margin:0; color:#94a3b8; font-size:16px; line-height:1.6;">
                        Verifica tu correo y comienza tu experiencia artística.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="
                      background-color:rgba(15,23,42,0.88);
                      border:1px solid rgba(148,163,184,0.22);
                      border-radius:24px;
                      padding:32px 24px;
                      box-shadow:0 10px 30px rgba(0,0,0,0.35);
                    ">
                      <p style="margin:0 0 12px 0; color:#e2e8f0; font-size:16px; line-height:1.6;">
                        Hola,
                      </p>

                      <p style="margin:0 0 18px 0; color:#cbd5e1; font-size:15px; line-height:1.7;">
                        Gracias por registrarte en <span style="color:#ffffff; font-weight:700;">Dream Lodge</span>.
                        Usa el siguiente código para verificar tu correo electrónico:
                      </p>

                      <div style="
                        margin:24px 0;
                        background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                        border:1px solid rgba(192,132,252,0.35);
                        border-radius:20px;
                        padding:22px 16px;
                        text-align:center;
                      ">
                        <div style="
                          color:#c084fc;
                          font-size:13px;
                          font-weight:700;
                          letter-spacing:1px;
                          text-transform:uppercase;
                          margin-bottom:10px;
                        ">
                          Código de verificación
                        </div>
                        <div style="
                          color:#ffffff;
                          font-size:34px;
                          line-height:1;
                          font-weight:700;
                          letter-spacing:8px;
                        ">
                          ${code}
                        </div>
                      </div>

                      <p style="margin:0 0 10px 0; color:#cbd5e1; font-size:15px; line-height:1.7;">
                        Este código expirará en <span style="color:#ffffff; font-weight:700;">10 minutos</span>.
                      </p>

                      <p style="margin:0 0 22px 0; color:#94a3b8; font-size:14px; line-height:1.7;">
                        Si no has intentado crear una cuenta, puedes ignorar este mensaje.
                      </p>

                      <div style="
                        margin-top:24px;
                        padding-top:20px;
                        border-top:1px solid rgba(148,163,184,0.18);
                      ">
                        <p style="margin:0; color:#64748b; font-size:12px; line-height:1.7; text-align:center;">
                          Dream Lodge · Verificación de cuenta
                        </p>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td align="center" style="padding-top:20px;">
                      <p style="margin:0; color:#64748b; font-size:12px; line-height:1.6;">
                        Este correo fue enviado automáticamente. No respondas a este mensaje.
                      </p>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verifica tu correo - Dream Lodge",
      text: `Tu código de verificación es: ${code}`,
      html: htmlContent,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) return reject(error);
      return resolve(info);
    });
  });
};
module.exports = {
    sendEmail, 
    sendVerificationEmail, generateVerificationCode
};