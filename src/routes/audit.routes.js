const express = require("express")
const AuditLog = require("../models/AuditLog")
const { auth } = require("../middleware/auth")
const logger = require("../config/logger")

const router = express.Router()

// @desc    Get audit logs for a ticket
// @route   GET /api/tickets/:id/audit
// @access  Private
router.get("/tickets/:id/audit", auth, async (req, res) => {
  try {
    const auditLogs = await AuditLog.find({
      ticketId: req.params.id,
    }).sort({ timestamp: 1 })

    res.json(auditLogs)
  } catch (error) {
    logger.error("Audit logs fetch error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
