const mongoose = require("mongoose")

const articleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please add a title"],
      trim: true,
      maxlength: [200, "Title cannot be more than 200 characters"],
    },
    body: {
      type: String,
      required: [true, "Please add article body"],
      maxlength: [5000, "Body cannot be more than 5000 characters"],
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
)

// Create text index for search
articleSchema.index({
  title: "text",
  body: "text",
  tags: "text",
})

module.exports = mongoose.model("Article", articleSchema)
