const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
const morgan = require("morgan")
const connectDB = require("./config/db")
const errorHandler = require("./middleware/errorHandler")
const logger = require("./config/logger")
const mongoose = require("mongoose") // Added to use mongoose.connection.readyState

// Route imports
const authRoutes = require("./routes/auth.routes")
const kbRoutes = require("./routes/kb.routes")
const ticketRoutes = require("./routes/ticket.routes")
const agentRoutes = require("./routes/agent.routes")
const configRoutes = require("./routes/config.routes")
const auditRoutes = require("./routes/audit.routes")

const app = express()

// Connect to database
connectDB()

app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    logger.error("Database not connected")
    return res.status(503).json({ message: "Database connection unavailable" })
  }
  next()
})

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
})
app.use("/api/", limiter)

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: "Too many authentication attempts, please try again later.",
})
app.use("/api/auth", authLimiter)

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))

// Logging middleware
app.use(
  morgan("combined", {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }),
)

// Health check endpoints
app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() })
})

app.get("/readyz", (req, res) => {
  // Add any readiness checks here (database connection, etc.)
  res.status(200).json({ status: "Ready", timestamp: new Date().toISOString() })
})

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Smart Helpdesk API",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  })
})

// API routes
app.use("/api/auth", authRoutes)
app.use("/api/kb", kbRoutes)
app.use("/api/tickets", ticketRoutes)
app.use("/api/agent", agentRoutes)
app.use("/api/config", configRoutes)
app.use("/api", auditRoutes)

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" })
})

// Error handling middleware (must be last)
app.use(errorHandler)

module.exports = app
