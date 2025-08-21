const express = require("express")
const { body, validationResult } = require("express-validator")
const Config = require("../models/Config")
const { auth, authorize } = require("../middleware/auth")
const logger = require("../config/logger")

const router = express.Router()

// @desc    Get config
// @route   GET /api/config
// @access  Private (Admin)
router.get("/", auth, authorize("admin"), async (req, res) => {
  try {
    let config = await Config.findOne()

    if (!config) {
      // Create default config if none exists
      config = new Config({
        autoCloseEnabled: process.env.AUTO_CLOSE_ENABLED === "true",
        confidenceThreshold: Number.parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.78,
        slaHours: Number.parseInt(process.env.SLA_HOURS) || 24,
      })
      await config.save()
    }

    res.json(config)
  } catch (error) {
    logger.error("Config fetch error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @desc    Update config
// @route   PUT /api/config
// @access  Private (Admin)
router.put(
  "/",
  [
    auth,
    authorize("admin"),
    body("autoCloseEnabled").optional().isBoolean().withMessage("autoCloseEnabled must be boolean"),
    body("confidenceThreshold")
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage("confidenceThreshold must be between 0 and 1"),
    body("slaHours").optional().isInt({ min: 1 }).withMessage("slaHours must be at least 1"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { autoCloseEnabled, confidenceThreshold, slaHours } = req.body

      let config = await Config.findOne()
      if (!config) {
        config = new Config()
      }

      if (autoCloseEnabled !== undefined) config.autoCloseEnabled = autoCloseEnabled
      if (confidenceThreshold !== undefined) config.confidenceThreshold = confidenceThreshold
      if (slaHours !== undefined) config.slaHours = slaHours

      await config.save()

      logger.info(`Config updated by ${req.user.email}`, {
        autoCloseEnabled: config.autoCloseEnabled,
        confidenceThreshold: config.confidenceThreshold,
        slaHours: config.slaHours,
      })

      res.json(config)
    } catch (error) {
      logger.error("Config update error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

module.exports = router
