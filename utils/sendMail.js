const nodemailer = require("nodemailer");
require("dotenv").config();

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

const sendEmail = async (email, subject, message, url, buttonText = "Open link") => {
  return new Promise((resolve, reject) => {
    // Verificar que las variables de entorno estén configuradas
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      const error = new Error("EMAIL_USER y EMAIL_PASS deben estar configurados en las variables de entorno");
      console.error("Error de configuración:", error.message);
      return reject(error);
    }

  const htmlContent = `
    <div style="font-family: sans-serif; line-height: 1.5;">
        <h2>Hola! 👋</h2>
      <p>${message}</p>
      <a href="${url}"
         style="
           display: inline-block;
           background-color: #4DC3BC;
           color: white;
           padding: 12px 24px;
           margin-top: 10px;
           text-decoration: none;
           border-radius: 5px;
           font-weight: bold;">
         ${buttonText}
      </a>
        <p style="margin-top: 20px;">Si el botón no funciona, copia y pega este enlace:</p>
        <p style="word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px;">${url}</p>
        <p style="margin-top: 20px; font-size: 12px; color: #666;">
          <strong>Nota:</strong> Este enlace abrirá la app Dream Lodge en tu dispositivo móvil. 
          Si no tienes la app instalada, por favor instálala primero.
        </p>
    </div>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: subject,
    text: `${message}: ${url}`,
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
    } else {
        console.log("✅ Email sent successfully:", info.response);
        console.log("Email details:", {
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected
        });
        return resolve(info);
      }
    });
  });
};

module.exports = {
    sendEmail
};