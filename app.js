// Imports
const express = require("express"); // Framework
const cors = require("cors"); // Access control
require("dotenv").config(); // .env
const port = process.env.PORT || 3000; // Listening port
const dbConnect = require("./config/mongo"); // DB connection

// Documentation
const swaggerUi = require("swagger-ui-express");
const swaggerSpecs = require("./docs/swagger");

// Create app
const app = express();

// CORS configuration
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:8081",
  "http://192.168.1.77:3000", // your local frontend
  process.env.FRONTEND_URL, // Production frontend URL from environment variable
].filter(Boolean); // Remove undefined values

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

/*app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman, Expo)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);*/

// Middlewares
app.use(express.json());

// Routes
app.use("/api", require("./routes")); // routes/index.js
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// OAuth redirect page - serves HTML that activates deep link
app.get("/oauth-redirect", (req, res) => {
  const deepLink = req.query.deep_link;
  if (!deepLink) {
    return res.status(400).send("Missing deep_link parameter");
  }
  
  // Serve HTML page that activates the deep link
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirecting to Dream Lodge...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .spinner {
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Redirecting to Dream Lodge...</h2>
    <p>If the app doesn't open automatically, <a href="${deepLink}" style="color: white; text-decoration: underline;">click here</a>.</p>
  </div>
  <script>
    // Try to activate the deep link immediately
    const deepLink = "${deepLink}";
    
    // Method 1: Direct redirect (works on some browsers)
    try {
      window.location.href = deepLink;
    } catch (e) {
      console.error("Error with window.location.href:", e);
    }
    
    // Method 2: Create a hidden iframe (fallback)
    setTimeout(() => {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = deepLink;
        document.body.appendChild(iframe);
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      } catch (e) {
        console.error("Error with iframe method:", e);
      }
    }, 100);
    
    // Method 3: Create a link and click it (another fallback)
    setTimeout(() => {
      try {
        const link = document.createElement('a');
        link.href = deepLink;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
        }, 100);
      } catch (e) {
        console.error("Error with link click method:", e);
      }
    }, 200);
    
    // Show manual link after 2 seconds if nothing worked
    setTimeout(() => {
      const container = document.querySelector('.container');
      const manualLink = document.createElement('p');
      manualLink.innerHTML = '<a href="' + deepLink + '" style="color: white; text-decoration: underline; font-size: 1.2rem;">Tap here to open Dream Lodge</a>';
      container.appendChild(manualLink);
    }, 2000);
  </script>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Listening
app.listen(port, () => {
  console.log("✅ Server listening on PORT " + port);
  dbConnect();
});

// Exports
module.exports = app;
