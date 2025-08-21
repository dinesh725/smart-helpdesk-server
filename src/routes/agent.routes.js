const express = require("express")
const AgentSuggestion = require("../models/AgentSuggestion")
const { auth, authorize } = require("../middleware/auth")
const { triggerTriage } = require("../services/agentStub")
const logger = require("../config/logger")
const { v4: uuidv4 } = require("uuid")

const router = express.Router()

// @desc    Trigger triage for a ticket
// @route   POST /api/agent/triage
// @access  Private (Internal/Admin)
router.post("/triage", auth, authorize("admin"), async (req, res) => {
  try {
    const { ticketId } = req.body

    if (!ticketId) {
      return res.status(400).json({ message: "Ticket ID is required" })
    }

    const traceId = uuidv4()
    await triggerTriage(ticketId, traceId)

    logger.info(`Manual triage triggered for ticket ${ticketId}`, { ticketId, traceId })
    res.json({ message: "Triage triggered successfully", traceId })
  } catch (error) {
    logger.error("Manual triage error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @desc    Get agent suggestion for ticket
// @route   GET /api/agent/suggestion/:ticketId
// @access  Private (Agent/Admin)
router.get("/suggestion/:ticketId", auth, authorize("agent", "admin"), async (req, res) => {
  try {
    const suggestion = await AgentSuggestion.findOne({
      ticketId: req.params.ticketId,
    }).populate("articleIds", "title body tags")

    if (!suggestion) {
      return res.status(404).json({ message: "No suggestion found for this ticket" })
    }

    res.json(suggestion)
  } catch (error) {
    logger.error("Suggestion fetch error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
