const express = require("express")
const { body, validationResult } = require("express-validator")
const Ticket = require("../models/Ticket")
const AuditLog = require("../models/AuditLog")
const { auth, authorize } = require("../middleware/auth")
const { triggerTriage } = require("../services/agentStub")
const logger = require("../config/logger")
const { v4: uuidv4 } = require("uuid")

const router = express.Router()

// @desc    Create ticket
// @route   POST /api/tickets
// @access  Private
router.post(
  "/",
  [
    auth,
    body("title").trim().isLength({ min: 1 }).withMessage("Title is required"),
    body("description").trim().isLength({ min: 1 }).withMessage("Description is required"),
    body("category").optional().isIn(["billing", "tech", "shipping", "other"]).withMessage("Invalid category"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { title, description, category } = req.body
      const traceId = uuidv4()

      const ticket = new Ticket({
        title,
        description,
        category: category || "other",
        createdBy: req.user._id,
      })

      await ticket.save()

      // Log ticket creation
      await new AuditLog({
        ticketId: ticket._id,
        traceId,
        actor: "user",
        action: "TICKET_CREATED",
        meta: {
          userId: req.user._id,
          category: ticket.category,
        },
      }).save()

      // Trigger agentic triage
      triggerTriage(ticket._id, traceId)

      await ticket.populate("createdBy", "name email")

      logger.info(`Ticket created: ${title} by ${req.user.email}`, { ticketId: ticket._id, traceId })
      res.status(201).json(ticket)
    } catch (error) {
      logger.error("Ticket creation error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

// @desc    Get tickets
// @route   GET /api/tickets
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const { status, my } = req.query
    const filter = {}

    // Filter by status
    if (status) {
      filter.status = status
    }

    // Filter by user's tickets
    if (my === "true" || req.user.role === "user") {
      filter.createdBy = req.user._id
    }

    const tickets = await Ticket.find(filter)
      .populate("createdBy", "name email")
      .populate("assignee", "name email")
      .sort({ updatedAt: -1 })
      .limit(50)

    res.json(tickets)
  } catch (error) {
    logger.error("Tickets fetch error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @desc    Get single ticket
// @route   GET /api/tickets/:id
// @access  Private
router.get("/:id", auth, async (req, res) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid ticket ID" })
    }

    const ticket = await Ticket.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("assignee", "name email")
      .populate("replies.author", "name email")
      .populate("agentSuggestionId")

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" })
    }

    // Check access permissions
    if (req.user.role === "user" && ticket.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" })
    }

    res.json(ticket)
  } catch (error) {
    logger.error("Ticket fetch error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @desc    Add reply to ticket
// @route   POST /api/tickets/:id/reply
// @access  Private (Agent/Admin)
router.post(
  "/:id/reply",
  [
    auth,
    authorize("agent", "admin"),
    body("content").trim().isLength({ min: 1 }).withMessage("Reply content is required"),
    body("status")
      .optional()
      .isIn(["open", "triaged", "waiting_human", "resolved", "closed"])
      .withMessage("Invalid status"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { content, status } = req.body
      const traceId = uuidv4()

      const ticket = await Ticket.findById(req.params.id)
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" })
      }

      // Add reply
      ticket.replies.push({
        content,
        author: req.user._id,
        isAgent: true,
        timestamp: new Date(),
      })

      // Update status if provided
      if (status) {
        ticket.status = status
      }

      await ticket.save()

      // Log reply
      await new AuditLog({
        ticketId: ticket._id,
        traceId,
        actor: "agent",
        action: "REPLY_SENT",
        meta: {
          agentId: req.user._id,
          newStatus: ticket.status,
        },
      }).save()

      await ticket.populate("createdBy", "name email")
      await ticket.populate("assignee", "name email")
      await ticket.populate("replies.author", "name email")

      logger.info(`Reply added to ticket ${ticket._id} by ${req.user.email}`, { ticketId: ticket._id, traceId })
      res.json(ticket)
    } catch (error) {
      logger.error("Reply error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

// @desc    Assign ticket
// @route   POST /api/tickets/:id/assign
// @access  Private (Agent/Admin)
router.post(
  "/:id/assign",
  [auth, authorize("agent", "admin"), body("assigneeId").isMongoId().withMessage("Valid assignee ID is required")],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { assigneeId } = req.body
      const traceId = uuidv4()

      const ticket = await Ticket.findById(req.params.id)
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" })
      }

      ticket.assignee = assigneeId
      ticket.status = "waiting_human"
      await ticket.save()

      // Log assignment
      await new AuditLog({
        ticketId: ticket._id,
        traceId,
        actor: "agent",
        action: "TICKET_ASSIGNED",
        meta: {
          assignedBy: req.user._id,
          assignedTo: assigneeId,
        },
      }).save()

      await ticket.populate("createdBy", "name email")
      await ticket.populate("assignee", "name email")

      logger.info(`Ticket ${ticket._id} assigned to ${assigneeId} by ${req.user.email}`, {
        ticketId: ticket._id,
        traceId,
      })
      res.json(ticket)
    } catch (error) {
      logger.error("Assignment error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

// @desc    Get tickets audit logs
// @route   GET /api/tickets/:id/audit
// @access  Private
router.get("/:id/audit", auth, async (req, res) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid ticket ID" })
    }

    const ticket = await Ticket.findById(req.params.id)
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" })
    }

    // Check access permissions
    if (req.user.role === "user" && ticket.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied" })
    }

    const auditLogs = await AuditLog.find({ ticketId: req.params.id }).sort({ timestamp: -1 }).limit(50)

    res.json(auditLogs)
  } catch (error) {
    logger.error("Audit logs fetch error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
