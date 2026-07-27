import express, { type Request, type Response } from "express";
import mongoose from "mongoose";
import cors from "cors";
import passport from "passport";
import formulaRoutes from "../src/routes/formulaRoutes.js";
import projectRoutes from "../src/routes/projectRoutes.js";
import authRoutes from "../src/routes/authRoutes.js";
import streakRoutes from "../src/routes/streakRoutes.js";
import quizRoutes from "../src/routes/quizRoutes.js";
import dotenv from "dotenv";
import helmet from "helmet";
import sanitize from "mongo-sanitize";
import rateLimit from "express-rate-limit";
import { xss } from "express-xss-sanitizer";
import savedRoutes from "../src/routes/savedRoutes.js";

// Registers the "google" strategy with passport as a side effect of being
// imported — this is what was missing. Must run before any request hits
// passport.authenticate("google", ...) in authRoutes.
import "../src/config/googleStrategy.js";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

dotenv.config();
const app = express();
app.set("trust proxy", 1);
// Enable CORS
// api/index.ts — only the origin block changes
const ALLOWED_ORIGINS = ["https://newton181.vercel.app"]; // add any other real frontend origins here, e.g. a custom domain

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("Blocked CORS request from origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Handle preflight explicitly so it never falls through to other middleware
app.use(express.json({ limit: "10kb" }));
app.use(
  helmet({
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    frameguard: {
      action: "deny",
    },
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);


app.use((req, _res, next) => {
  for (const key of Object.keys(req.query)) {
    const value = (req.query as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      (req.query as Record<string, unknown>)[key] = value[value.length - 1];
    }
  }
  next();
});

app.use((req, _res, next) => {
  if (req.body) req.body = sanitize(req.body); // body is safely reassignable
  if (req.params) sanitize(req.params); 
  if (req.query) sanitize(req.query);
  next();
});
app.use(limiter);
app.use(xss());
app.use(passport.initialize());
// Database connection helper for serverless environment
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/myapp";

let isConnected = false;
async function connectToDatabase() {
  if (isConnected) return;
  try {
    await mongoose.connect(MONGO_URI);
    isConnected = true;
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
  }
}

// Middleware to ensure database connection before processing requests
app.use(async (req, res, next) => {
  await connectToDatabase();
  next();
});

// Routes
app.use("/api/formulas", formulaRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/streak", streakRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/saved", savedRoutes);
// Export for Vercel (Do not block inside an async startServer function)
export default app;