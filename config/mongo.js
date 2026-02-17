const mongoose = require('mongoose');

const dbConnect = () => {
    const db_uri = process.env.DB_URI;
    
    if (!db_uri) {
        console.error("❌ DB_URI is not defined in environment variables");
        return;
    }
    
    mongoose.set("strictQuery", false);

    mongoose.connect(db_uri)
        .then(() => {
            console.log("DB connected");
        })
        .catch((error) => {
            console.error("❌ Error connecting to the DB:", error.message);
            // Don't exit the process, let it continue running
            // The app can still serve other endpoints
        });

    mongoose.connection.on("connected", () => {
        console.log("✅ MongoDB connected successfully");
    });

    mongoose.connection.on("error", (error) => {
        console.error("❌ MongoDB connection error:", error.message);
    });

    mongoose.connection.on("disconnected", () => {
        console.log("⚠️ MongoDB disconnected");
    });
};

module.exports = dbConnect