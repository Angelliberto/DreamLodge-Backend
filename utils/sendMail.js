const nodemailer = require("nodemailer");
require("dotenv").config();

let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendEmail = (email, subject, message, url, buttonText = "Open link") => {
  const htmlContent = `
    <div style="font-family: sans-serif; line-height: 1.5;">
      <h2>Hi! 👋</h2>
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
      <p style="margin-top: 20px;">If the button doesn't work, copy and paste this link in your browser:</p>
      <p style="word-break: break-all;">${url}</p>
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
        console.error("Error while sending email:", error);
    } else {
      console.log("Email sent:", info.response);
    }
  });
};

module.exports = {
    sendEmail
};