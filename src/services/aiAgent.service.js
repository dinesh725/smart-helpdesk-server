const OpenAI = require("openai")
const Article = require("../models/Article")
const Ticket = require("../models/Ticket")
const AgentSuggestion = require("../models/AgentSuggestion")
const AuditLog = require("../models/AuditLog")
const Config = require("../models/Config")
const logger = require("../config/logger")

class AIAgentService {
  constructor() {
    this.isStubMode = process.env.STUB_MODE === "true"
    this.openai = null

    // Initialize OpenAI if API key is provided and not in stub mode
    if (!this.isStubMode && process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    }
  }

  // Classify ticket category using OpenAI or stub
  async classify(text) {
    const startTime = Date.now()

    try {
      if (this.isStubMode || !this.openai) {
        return this.stubClassify(text, startTime)
      }

      return await this.openaiClassify(text, startTime)
    } catch (error) {
      logger.error("Classification error:", error)
      // Fallback to stub mode on error
      return this.stubClassify(text, startTime)
    }
  }

  async openaiClassify(text, startTime) {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a support ticket classifier. Classify the following ticket into one of these categories: billing, tech, shipping, other. 
          
          Respond with a JSON object containing:
          - predictedCategory: one of "billing", "tech", "shipping", "other"
          - confidence: a number between 0 and 1
          
          Examples:
          - Payment issues, refunds, invoices → billing
          - Login problems, bugs, errors → tech  
          - Delivery, tracking, packages → shipping
          - General inquiries → other`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.1,
      max_tokens: 100,
    })

    const response = completion.choices[0].message.content
    const latencyMs = Date.now() - startTime

    try {
      const result = JSON.parse(response)
      return {
        predictedCategory: result.predictedCategory,
        confidence: Math.min(0.95, Math.max(0.1, result.confidence)),
        latencyMs,
      }
    } catch (parseError) {
      logger.error("Failed to parse OpenAI classification response:", parseError)
      return this.stubClassify(text, startTime)
    }
  }

  stubClassify(text, startTime) {
    const lowerText = text.toLowerCase()

    const billingKeywords = ["refund", "invoice", "payment", "charge", "billing", "money", "cost", "price"]
    const techKeywords = ["error", "bug", "crash", "stack", "login", "password", "technical", "broken"]
    const shippingKeywords = ["delivery", "shipment", "package", "tracking", "shipping", "order"]

    let category = "other"
    let matchCount = 0

    const billingMatches = billingKeywords.filter((keyword) => lowerText.includes(keyword)).length
    const techMatches = techKeywords.filter((keyword) => lowerText.includes(keyword)).length
    const shippingMatches = shippingKeywords.filter((keyword) => lowerText.includes(keyword)).length

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
      let articles = await Article.find({
        status: "published",
        tags: { $in: [category] },
      }).limit(3)

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

  // Draft a reply using OpenAI or stub
  async draft(text, articles) {
    const startTime = Date.now()

    try {
      if (this.isStubMode || !this.openai) {
        return this.stubDraft(text, articles, startTime)
      }

      return await this.openaiDraft(text, articles, startTime)
    } catch (error) {
      logger.error("Drafting error:", error)
      return this.stubDraft(text, articles, startTime)
    }
  }

  async openaiDraft(text, articles, startTime) {
    const articlesContext = articles
      .map((article) => `Title: ${article.title}\nContent: ${article.body.substring(0, 500)}...`)
      .join("\n\n")

    const completion = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a helpful customer support agent. Draft a professional, empathetic response to the customer's inquiry using the provided knowledge base articles as reference.

          Guidelines:
          - Be professional and empathetic
          - Reference relevant articles when applicable
          - Keep responses concise but helpful
          - End with an offer for further assistance
          - Sign as "Support Team"`,
        },
        {
          role: "user",
          content: `Customer inquiry: ${text}

          Available knowledge base articles:
          ${articlesContext}

          Please draft a response.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    const draftReply = completion.choices[0].message.content
    const latencyMs = Date.now() - startTime

    return {
      draftReply,
      citations: articles.map((a) => a._id.toString()),
      latencyMs,
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

      const ticket = await Ticket.findById(ticketId)
      if (!ticket) {
        throw new Error("Ticket not found")
      }

      const config = (await Config.findOne()) || new Config()
      const classificationText = `${ticket.title} ${ticket.description}`

      // Step 1: Classify
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
          provider: this.isStubMode ? "stub" : "openai",
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
          provider: this.isStubMode ? "stub" : "openai",
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
          provider: this.isStubMode ? "stub" : "openai",
          model: this.isStubMode ? "deterministic-v1" : "gpt-3.5-turbo",
          promptVersion: "1.0",
          latencyMs: classification.latencyMs + (draft.latencyMs || 0),
        },
      })

      await suggestion.save()
      ticket.agentSuggestionId = suggestion._id
      ticket.status = "triaged"
      await ticket.save()

      // Step 5: Auto-close or assign to human
      if (config.autoCloseEnabled && classification.confidence >= config.confidenceThreshold) {
        ticket.status = "resolved"
        ticket.replies.push({
          content: draft.draftReply,
          author: null,
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

        logger.info(`Ticket ${ticketId} auto-closed with confidence ${classification.confidence}`)
      } else {
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

        logger.info(`Ticket ${ticketId} assigned to human with confidence ${classification.confidence}`)
      }

      logger.info(`Triage completed for ticket ${ticketId}`, { ticketId, traceId })
      return suggestion
    } catch (error) {
      logger.error(`Triage failed for ticket ${ticketId}:`, error, { ticketId, traceId })

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

const aiAgent = new AIAgentService()

const triggerTriage = async (ticketId, traceId) => {
  setImmediate(async () => {
    try {
      await aiAgent.performTriage(ticketId, traceId)
    } catch (error) {
      logger.error(`Background triage failed for ticket ${ticketId}:`, error)
    }
  })
}

module.exports = {
  aiAgent,
  triggerTriage,
}
