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

// Listening
app.listen(port, () => {
  console.log("✅ Server listening on PORT " + port);
  dbConnect();
});

// Exports
module.exports = app;
