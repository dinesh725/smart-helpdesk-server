const express = require("express")
const router = express.Router()

// Health check endpoint for Railway deployment
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Smart Helpdesk API",
  })
})

module.exports = router
