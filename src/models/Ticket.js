const mongoose = require("mongoose")

const ticketSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please add a title"],
      trim: true,
      maxlength: [200, "Title cannot be more than 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Please add a description"],
      maxlength: [2000, "Description cannot be more than 2000 characters"],
    },
    category: {
      type: String,
      enum: ["billing", "tech", "shipping", "other"],
      default: "other",
    },
    status: {
      type: String,
      enum: ["open", "triaged", "waiting_human", "resolved", "closed"],
      default: "open",
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    assignee: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    agentSuggestionId: {
      type: mongoose.Schema.ObjectId,
      ref: "AgentSuggestion",
    },
    replies: [
      {
        content: String,
        author: {
          type: mongoose.Schema.ObjectId,
          ref: "User",
        },
        isAgent: {
          type: Boolean,
          default: false,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
)

module.exports = mongoose.model("Ticket", ticketSchema)
