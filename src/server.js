require("dotenv").config()

// if (process.env.NODE_ENV !== "production") {
//   require("dotenv").config();
// }

const app = require("./app")
const logger = require("./config/logger")

const PORT = process.env.PORT || 8080

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`)
  logger.info(`Stub Mode: ${process.env.STUB_MODE === "true" ? "enabled" : "disabled"}`)
})

// Handle unhandled promise rejections
process.on("unhandledRejection", (err, promise) => {
  logger.error("Unhandled Promise Rejection:", err)
  // Close server & exit process
  server.close(() => {
    process.exit(1)
  })
})

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err)
  process.exit(1)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Shutting down gracefully...")
  server.close(() => {
    logger.info("Process terminated")
  })
})
