import express, { type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
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

const ALLOWED_ORIGINS = ["https://newton181.vercel.app"]; // add any other real frontend origins here

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
    allowedHeaders: ["Content-Type", "X-CSRF-Token", "Authorization"],
    credentials: true,
  }),
);

app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Double-submit CSRF check. Auth cookies are SameSite=None in production
// (required for the cross-origin frontend/backend split on Vercel), which
// means the browser will attach them to any cross-site request — including
// ones triggered by a malicious page. We only enforce this once a session
// cookie actually exists; logged-out endpoints like /register or /login
// have no ambient authority for a forged request to abuse.
function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  const hasSessionCookie = Boolean(req.cookies?.accessToken || req.cookies?.refreshToken);
  if (!hasSessionCookie) {
    next();
    return;
  }

  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers["x-csrf-token"];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ message: "CSRF validation failed" });
    return;
  }

  next();
}
app.use(csrfProtection);

app.use(
  helmet({
    hidePoweredBy: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    frameguard: { action: "deny" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
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
  if (req.body) req.body = sanitize(req.body);
  if (req.params) sanitize(req.params);
  if (req.query) sanitize(req.query);
  next();
});
app.use(limiter);
app.use(xss());
app.use(passport.initialize());

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

app.use(async (req, res, next) => {
  await connectToDatabase();
  next();
});

app.use("/api/formulas", formulaRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/streak", streakRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/saved", savedRoutes);

export default app;