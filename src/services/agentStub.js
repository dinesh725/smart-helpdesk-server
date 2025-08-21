const Article = require("../models/Article")
const Ticket = require("../models/Ticket")
const AgentSuggestion = require("../models/AgentSuggestion")
const AuditLog = require("../models/AuditLog")
const Config = require("../models/Config")
const logger = require("../config/logger")

class AgentStub {
  constructor() {
    this.isStubMode = process.env.STUB_MODE === "true"
  }

  // Classify ticket category based on keywords
  async classify(text) {
    const startTime = Date.now()

    try {
      if (this.isStubMode) {
        return this.stubClassify(text, startTime)
      }

      // TODO: Implement real LLM classification
      return this.stubClassify(text, startTime)
    } catch (error) {
      logger.error("Classification error:", error)
      throw error
    }
  }

  stubClassify(text, startTime) {
    const lowerText = text.toLowerCase()

    // Keyword-based classification
    const billingKeywords = ["refund", "invoice", "payment", "charge", "billing", "money", "cost", "price"]
    const techKeywords = ["error", "bug", "crash", "stack", "login", "password", "technical", "broken"]
    const shippingKeywords = ["delivery", "shipment", "package", "tracking", "shipping", "order"]

    let category = "other"
    let matchCount = 0

    // Count keyword matches for each category
    const billingMatches = billingKeywords.filter((keyword) => lowerText.includes(keyword)).length
    const techMatches = techKeywords.filter((keyword) => lowerText.includes(keyword)).length
    const shippingMatches = shippingKeywords.filter((keyword) => lowerText.includes(keyword)).length

    // Determine category based on highest match count
    if (billingMatches > matchCount) {
      category = "billing"
      matchCount = billingMatches
    }
    if (techMatches > matchCount) {
      category = "tech"
      matchCount = techMatches
    }
    if (shippingMatches > matchCount) {
      category = "shipping"
      matchCount = shippingMatches
    }

    // Calculate confidence based on keyword matches and text length
    const totalWords = text.split(" ").length
    const confidence = Math.min(0.95, Math.max(0.3, (matchCount * 2) / Math.max(totalWords, 5)))

    const latencyMs = Date.now() - startTime

    return {
      predictedCategory: category,
      confidence: Number.parseFloat(confidence.toFixed(2)),
      latencyMs,
    }
  }

  // Retrieve relevant KB articles
  async retrieveKB(text, category) {
    try {
      // First try category-based search
      let articles = await Article.find({
        status: "published",
        tags: { $in: [category] },
      }).limit(3)

      // If not enough articles, do text search
      if (articles.length < 2) {
        const textSearchArticles = await Article.find(
          {
            status: "published",
            $text: { $search: text },
          },
          {
            score: { $meta: "textScore" },
          },
        )
          .sort({ score: { $meta: "textScore" } })
          .limit(3)

        // Merge and deduplicate
        const existingIds = articles.map((a) => a._id.toString())
        const newArticles = textSearchArticles.filter((a) => !existingIds.includes(a._id.toString()))

        articles = [...articles, ...newArticles].slice(0, 3)
      }

      return articles
    } catch (error) {
      logger.error("KB retrieval error:", error)
      return []
    }
  }

  // Draft a reply based on articles
  async draft(text, articles) {
    const startTime = Date.now()

    try {
      if (this.isStubMode) {
        return this.stubDraft(text, articles, startTime)
      }

      // TODO: Implement real LLM drafting
      return this.stubDraft(text, articles, startTime)
    } catch (error) {
      logger.error("Drafting error:", error)
      throw error
    }
  }

  stubDraft(text, articles, startTime) {
    let draftReply = "Thank you for contacting our support team. "

    if (articles.length === 0) {
      draftReply +=
        "We've received your request and will review it shortly. Our team will get back to you with a detailed response."
    } else {
      draftReply += "Based on your inquiry, here are some resources that might help:\n\n"

      articles.forEach((article, index) => {
        draftReply += `${index + 1}. ${article.title}\n`
        // Add a snippet of the article body
        const snippet = article.body.substring(0, 150) + (article.body.length > 150 ? "..." : "")
        draftReply += `   ${snippet}\n\n`
      })

      draftReply +=
        "If these resources don't fully address your concern, please let us know and we'll provide additional assistance."
    }

    draftReply += "\n\nBest regards,\nSupport Team"

    const latencyMs = Date.now() - startTime

    return {
      draftReply,
      citations: articles.map((a) => a._id.toString()),
      latencyMs,
    }
  }

  // Main triage workflow
  async performTriage(ticketId, traceId) {
    try {
      logger.info(`Starting triage for ticket ${ticketId}`, { ticketId, traceId })

      // Get ticket
      const ticket = await Ticket.findById(ticketId)
      if (!ticket) {
        throw new Error("Ticket not found")
      }

      // Get config
      const config = (await Config.findOne()) || new Config()

      // Step 1: Classify
      const classificationText = `${ticket.title} ${ticket.description}`
      const classification = await this.classify(classificationText)

      await new AuditLog({
        ticketId,
        traceId,
        actor: "system",
        action: "AGENT_CLASSIFIED",
        meta: {
          predictedCategory: classification.predictedCategory,
          confidence: classification.confidence,
          latencyMs: classification.latencyMs,
        },
      }).save()

      // Step 2: Retrieve KB articles
      const articles = await this.retrieveKB(classificationText, classification.predictedCategory)

      await new AuditLog({
        ticketId,
        traceId,
        actor: "system",
        action: "KB_RETRIEVED",
        meta: {
          articleCount: articles.length,
          articleIds: articles.map((a) => a._id),
        },
      }).save()

      // Step 3: Draft reply
      const draft = await this.draft(classificationText, articles)

      await new AuditLog({
        ticketId,
        traceId,
        actor: "system",
        action: "DRAFT_GENERATED",
        meta: {
          draftLength: draft.draftReply.length,
          citationCount: draft.citations.length,
          latencyMs: draft.latencyMs,
        },
      }).save()

      // Step 4: Create agent suggestion
      const suggestion = new AgentSuggestion({
        ticketId,
        predictedCategory: classification.predictedCategory,
        articleIds: articles.map((a) => a._id),
        draftReply: draft.draftReply,
        confidence: classification.confidence,
        modelInfo: {
          provider: "stub",
          model: "deterministic-v1",
          promptVersion: "1.0",
          latencyMs: classification.latencyMs + (draft.latencyMs || 0),
        },
      })

      await suggestion.save()

      // Update ticket with suggestion reference
      ticket.agentSuggestionId = suggestion._id
      ticket.status = "triaged"
      await ticket.save()

      // Step 5: Decision - Auto-close or assign to human
      if (config.autoCloseEnabled && classification.confidence >= config.confidenceThreshold) {
        // Auto-close ticket
        ticket.status = "resolved"
        ticket.replies.push({
          content: draft.draftReply,
          author: null, // System reply
          isAgent: true,
          timestamp: new Date(),
        })

        suggestion.autoClosed = true
        await suggestion.save()
        await ticket.save()

        await new AuditLog({
          ticketId,
          traceId,
          actor: "system",
          action: "AUTO_CLOSED",
          meta: {
            confidence: classification.confidence,
            threshold: config.confidenceThreshold,
          },
        }).save()

        logger.info(`Ticket ${ticketId} auto-closed with confidence ${classification.confidence}`, {
          ticketId,
          traceId,
        })
      } else {
        // Assign to human
        ticket.status = "waiting_human"
        await ticket.save()

        await new AuditLog({
          ticketId,
          traceId,
          actor: "system",
          action: "ASSIGNED_TO_HUMAN",
          meta: {
            confidence: classification.confidence,
            threshold: config.confidenceThreshold,
            reason: config.autoCloseEnabled ? "low_confidence" : "auto_close_disabled",
          },
        }).save()

        logger.info(`Ticket ${ticketId} assigned to human with confidence ${classification.confidence}`, {
          ticketId,
          traceId,
        })
      }

      logger.info(`Triage completed for ticket ${ticketId}`, { ticketId, traceId })
      return suggestion
    } catch (error) {
      logger.error(`Triage failed for ticket ${ticketId}:`, error, { ticketId, traceId })

      // Log the error
      await new AuditLog({
        ticketId,
        traceId,
        actor: "system",
        action: "TRIAGE_FAILED",
        meta: {
          error: error.message,
        },
      }).save()

      throw error
    }
  }
}

const agentStub = new AgentStub()

// Async function to trigger triage (can be called from routes)
const triggerTriage = async (ticketId, traceId) => {
  // Run triage in background
  setImmediate(async () => {
    try {
      await agentStub.performTriage(ticketId, traceId)
    } catch (error) {
      logger.error(`Background triage failed for ticket ${ticketId}:`, error)
    }
  })
}

module.exports = {
  agentStub,
  triggerTriage,
}
