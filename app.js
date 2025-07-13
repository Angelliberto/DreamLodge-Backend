// Imports
const express = require("express"); //Framework
const cors = require("cors"); //Access control
require("dotenv").config(); //.env
const port = process.env.PORT || 3000; //Listening port
const dbConnect = require("./config/mongo"); //DB connection

//Documentation
const swaggerUi = require("swagger-ui-express");
const swaggerSpecs = require("./docs/swagger");

// Create app
const app = express();

// Requirements
app.use(cors({
    origin: ["http://localhost:3000", "http://localhost:3001"
    ],
    credentials: true
}));
app.use(express.json());
app.use("/api", require("./routes")); //goes to routes/index by default
app.use("/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpecs)
);

// Listening
app.listen(port, () => {
    console.log("Server listening on PORT " + port);
    dbConnect();
});

// Exports
module.exports = app