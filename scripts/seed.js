require("dotenv").config()
const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const User = require("../src/models/User")
const Article = require("../src/models/Article")
const Ticket = require("../src/models/Ticket")
const Config = require("../src/models/Config")

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log("MongoDB Connected for seeding")
  } catch (error) {
    console.error("Database connection failed:", error)
    process.exit(1)
  }
}

const seedData = async () => {
  try {
    // Clear existing data
    await User.deleteMany({})
    await Article.deleteMany({})
    await Ticket.deleteMany({})
    await Config.deleteMany({})

    console.log("Cleared existing data")

    // Create users
    const hashedPassword = await bcrypt.hash("password123", 10)

    const admin = await User.create({
      name: "Admin User",
      email: "admin@helpdesk.com",
      password: hashedPassword,
      role: "admin",
    })

    const agent = await User.create({
      name: "Support Agent",
      email: "agent@helpdesk.com",
      password: hashedPassword,
      role: "agent",
    })

    const user = await User.create({
      name: "John Doe",
      email: "user@helpdesk.com",
      password: hashedPassword,
      role: "user",
    })

    console.log("Created users")

    // Create KB articles
    const articles = await Article.create([
      {
        title: "How to update payment method",
        body: 'To update your payment method:\n\n1. Log into your account\n2. Go to Account Settings\n3. Click on Billing\n4. Select "Update Payment Method"\n5. Enter your new card details\n6. Click Save\n\nIf you encounter any issues, please contact our support team.',
        tags: ["billing", "payments", "account"],
        status: "published",
        createdBy: admin._id,
      },
      {
        title: "Troubleshooting 500 errors",
        body: "If you're experiencing 500 Internal Server Errors:\n\n1. Clear your browser cache and cookies\n2. Try accessing the site in incognito/private mode\n3. Check if the issue persists across different browsers\n4. Wait a few minutes and try again\n\nIf the problem continues:\n- Check our status page for known issues\n- Contact support with the exact error message\n- Include the time when the error occurred",
        tags: ["tech", "errors", "troubleshooting"],
        status: "published",
        createdBy: admin._id,
      },
      {
        title: "Tracking your shipment",
        body: 'To track your order:\n\n1. Check your email for the shipping confirmation\n2. Click the tracking link in the email\n3. Or visit our website and go to "Track Order"\n4. Enter your order number and email address\n\nShipping times:\n- Standard: 5-7 business days\n- Express: 2-3 business days\n- Overnight: Next business day\n\nIf your package is delayed, please contact us with your tracking number.',
        tags: ["shipping", "delivery", "tracking"],
        status: "published",
        createdBy: admin._id,
      },
    ])

    console.log("Created KB articles")

    // Create sample tickets
    const tickets = await Ticket.create([
      {
        title: "Refund for double charge",
        description:
          "I was charged twice for order #1234. I only made one purchase but see two charges on my credit card statement. Please help me get a refund for the duplicate charge.",
        category: "other",
        createdBy: user._id,
      },
      {
        title: "App shows 500 error on login",
        description:
          "Every time I try to log into the app, I get a 500 Internal Server Error. The stack trace mentions something about the auth module. This started happening yesterday.",
        category: "other",
        createdBy: user._id,
      },
      {
        title: "Where is my package?",
        description:
          "I ordered something 5 days ago and it still hasn't arrived. The tracking shows it was shipped but there are no updates. My order number is #5678.",
        category: "other",
        createdBy: user._id,
      },
    ])

    console.log("Created sample tickets")

    // Create config
    await Config.create({
      autoCloseEnabled: process.env.AUTO_CLOSE_ENABLED === "true",
      confidenceThreshold: Number.parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.78,
      slaHours: Number.parseInt(process.env.SLA_HOURS) || 24,
    })

    console.log("Created system config")

    console.log("\n=== Seed Data Created Successfully ===")
    console.log("\nTest Accounts:")
    console.log("Admin: admin@helpdesk.com / password123")
    console.log("Agent: agent@helpdesk.com / password123")
    console.log("User: user@helpdesk.com / password123")
    console.log("\nKnowledge Base Articles: 3")
    console.log("Sample Tickets: 3")
  } catch (error) {
    console.error("Seeding failed:", error)
  } finally {
    mongoose.connection.close()
  }
}

const run = async () => {
  await connectDB()
  await seedData()
}

run()
