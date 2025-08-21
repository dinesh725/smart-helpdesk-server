const mongoose = require("mongoose")
const logger = require("./logger")


console.log("[debug] Full environment keys available:", Object.keys(process.env));
console.log("[debug] Raw MONGO_URI value:", process.env.MONGO_URI);

const connectDB = async () => {
  try {
    console.log("[v0] Attempting to connect to MongoDB...")
    
    console.log("[v0] MONGO_URI exists:", !!process.env.MONGO_URI)
    console.log(
      "[v0] MONGO_URI preview:",
      process.env.MONGO_URI ? process.env.MONGO_URI.substring(0, 20) + "..." : "Not set",
    )

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    })

    console.log("[v0] MongoDB connection successful!")
    console.log("[v0] Connected to host:", conn.connection.host)
    console.log("[v0] Database name:", conn.connection.name)
    console.log("[v0] Connection ready state:", conn.connection.readyState)

    logger.info(`MongoDB Connected: ${conn.connection.host}`)
    logger.info(`Database Name: ${conn.connection.name}`)

    mongoose.connection.on("error", (err) => {
      console.error("[v0] MongoDB connection error:", err)
      logger.error("MongoDB connection error:", err)
    })

    mongoose.connection.on("disconnected", () => {
      console.warn("[v0] MongoDB disconnected")
      logger.warn("MongoDB disconnected")
    })

    mongoose.connection.on("reconnected", () => {
      console.log("[v0] MongoDB reconnected")
      logger.info("MongoDB reconnected")
    })
  } catch (error) {
    console.error("[v0] Database connection failed:", error)
    console.error("[v0] Error details:", error.message)
    console.error("[v0] MONGO_URI status:", process.env.MONGO_URI ? "Set" : "Not set")
    logger.error("Database connection failed:", error)
    logger.error("MONGO_URI:", process.env.MONGO_URI ? "Set" : "Not set")
    process.exit(1)
  }
}

module.exports = connectDB
