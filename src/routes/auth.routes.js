const express = require("express")
const { body, validationResult } = require("express-validator")
const jwt = require("jsonwebtoken")
const User = require("../models/User")
const logger = require("../config/logger")

const router = express.Router()

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post(
  "/register",
  [
    body("name").trim().isLength({ min: 1 }).withMessage("Name is required"),
    body("email").isEmail().withMessage("Please include a valid email"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("role").optional().isIn(["admin", "agent", "user"]).withMessage("Invalid role"),
  ],
  async (req, res) => {
    try {
      console.log("[v0] Registration attempt started")
      console.log("[v0] Request body:", req.body)

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        console.log("[v0] Validation errors:", errors.array())
        return res.status(400).json({ errors: errors.array() })
      }

      const { name, email, password, role } = req.body
      console.log("[v0] Validation passed, checking if user exists")

      // Check if user exists
      let user = await User.findOne({ email })
      if (user) {
        console.log("[v0] User already exists:", email)
        return res.status(400).json({ message: "User already exists" })
      }

      console.log("[v0] User doesn't exist, creating new user")

      // Create user
      user = new User({
        name,
        email,
        password,
        role: role || "user",
      })

      console.log("[v0] User object created:", {
        name: user.name,
        email: user.email,
        role: user.role,
        id: user._id,
      })

      console.log("[v0] About to save user to database...")
      await user.save()
      console.log("[v0] User successfully saved to database!")
      console.log("[v0] Saved user details:", {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })

      // Create JWT token
      const payload = {
        id: user._id,
        role: user.role,
      }

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "24h",
      })

      console.log("[v0] JWT token created successfully")
      logger.info(`User registered: ${email}`)

      const response = {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      }

      console.log("[v0] Sending response:", response)
      res.status(201).json(response)
    } catch (error) {
      console.error("[v0] Registration error occurred:", error)
      console.error("[v0] Error stack:", error.stack)
      logger.error("Registration error:", error)
      res.status(500).json({ message: "Server error", error: error.message })
    }
  },
)

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Please include a valid email"),
    body("password").exists().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      console.log("[v0] Login attempt started")
      console.log("[v0] Request body:", req.body)

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        console.log("[v0] Validation errors:", errors.array())
        return res.status(400).json({ errors: errors.array() })
      }

      const { email, password } = req.body
      console.log("[v0] Validation passed, checking for user")

      // Check for user
      const user = await User.findOne({ email }).select("+password")
      if (!user) {
        console.log("[v0] User not found:", email)
        return res.status(401).json({ message: "Invalid credentials" })
      }

      console.log("[v0] User found, checking password")

      // Check password
      const isMatch = await user.matchPassword(password)
      if (!isMatch) {
        console.log("[v0] Password mismatch")
        return res.status(401).json({ message: "Invalid credentials" })
      }

      console.log("[v0] Password match, creating JWT token")

      // Create JWT token
      const payload = {
        id: user._id,
        role: user.role,
      }

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "24h",
      })

      console.log("[v0] JWT token created successfully")
      logger.info(`User logged in: ${email}`)

      const response = {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      }

      console.log("[v0] Sending response:", response)
      res.json(response)
    } catch (error) {
      console.error("[v0] Login error occurred:", error)
      console.error("[v0] Error stack:", error.stack)
      logger.error("Login error:", error)
      res.status(500).json({ message: "Server error", error: error.message })
    }
  },
)

module.exports = router
