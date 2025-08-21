const express = require("express")
const { body, validationResult } = require("express-validator")
const Article = require("../models/Article")
const { auth, authorize } = require("../middleware/auth")
const logger = require("../config/logger")

const router = express.Router()

// @desc    Get articles (with search)
// @route   GET /api/kb
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const { query, status } = req.query
    const filter = {}

    // Only show published articles to non-admin users
    if (req.user.role !== "admin") {
      filter.status = "published"
    } else if (status) {
      filter.status = status
    }

    let articles
    if (query) {
      // Text search
      articles = await Article.find(
        {
          ...filter,
          $text: { $search: query },
        },
        {
          score: { $meta: "textScore" },
        },
      )
        .sort({ score: { $meta: "textScore" } })
        .populate("createdBy", "name email")
        .limit(20)
    } else {
      articles = await Article.find(filter).populate("createdBy", "name email").sort({ updatedAt: -1 }).limit(50)
    }

    res.json(articles)
  } catch (error) {
    logger.error("KB search error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// @desc    Create article
// @route   POST /api/kb
// @access  Private (Admin only)
router.post(
  "/",
  [
    auth,
    authorize("admin"),
    body("title").trim().isLength({ min: 1 }).withMessage("Title is required"),
    body("body").trim().isLength({ min: 1 }).withMessage("Body is required"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
    body("status").optional().isIn(["draft", "published"]).withMessage("Invalid status"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { title, body, tags, status } = req.body

      const article = new Article({
        title,
        body,
        tags: tags || [],
        status: status || "draft",
        createdBy: req.user._id,
      })

      await article.save()
      await article.populate("createdBy", "name email")

      logger.info(`Article created: ${title} by ${req.user.email}`)
      res.status(201).json(article)
    } catch (error) {
      logger.error("Article creation error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

// @desc    Update article
// @route   PUT /api/kb/:id
// @access  Private (Admin only)
router.put(
  "/:id",
  [
    auth,
    authorize("admin"),
    body("title").optional().trim().isLength({ min: 1 }).withMessage("Title cannot be empty"),
    body("body").optional().trim().isLength({ min: 1 }).withMessage("Body cannot be empty"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
    body("status").optional().isIn(["draft", "published"]).withMessage("Invalid status"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const article = await Article.findById(req.params.id)
      if (!article) {
        return res.status(404).json({ message: "Article not found" })
      }

      const { title, body, tags, status } = req.body

      if (title !== undefined) article.title = title
      if (body !== undefined) article.body = body
      if (tags !== undefined) article.tags = tags
      if (status !== undefined) article.status = status

      await article.save()
      await article.populate("createdBy", "name email")

      logger.info(`Article updated: ${article.title} by ${req.user.email}`)
      res.json(article)
    } catch (error) {
      logger.error("Article update error:", error)
      res.status(500).json({ message: "Server error" })
    }
  },
)

// @desc    Delete article
// @route   DELETE /api/kb/:id
// @access  Private (Admin only)
router.delete("/:id", auth, authorize("admin"), async (req, res) => {
  try {
    const article = await Article.findById(req.params.id)
    if (!article) {
      return res.status(404).json({ message: "Article not found" })
    }

    await Article.findByIdAndDelete(req.params.id)

    logger.info(`Article deleted: ${article.title} by ${req.user.email}`)
    res.json({ message: "Article deleted successfully" })
  } catch (error) {
    logger.error("Article deletion error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router
