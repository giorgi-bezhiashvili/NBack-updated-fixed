import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Joi from "joi";
import rateLimit from "express-rate-limit";
import passport from "passport";
import User from "../models/userSchema.js";
import RefreshToken from "../models/refreshTokenSchema.js";
import { validate } from "../middleware/validate.js";
import PasswordResetToken from "../models/passwordResetTokenSchema.js";
import { sendPasswordResetEmail } from "../utils/mailer.js";
const router = Router();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// --- TYPES & SCHEMAS ---

interface RegisterBody {
  userName: string;
  password: string;
  email: string;
}

interface LoginBody {
  identifier: string;
  password: string;
}

interface RefreshBody {
  token?: string;
}

interface AccessTokenPayload {
  userName: string;
  role: string;
}

interface IUserLike {
  userName: string;
  role: string;
}
interface ForgotPasswordBody {
  email: string;
}

interface ResetPasswordBody {
  token: string;
  password: string;
}

const forgotPasswordSchema = Joi.object<ForgotPasswordBody>({
  email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object<ResetPasswordBody>({
  token: Joi.string().required(),
  password: Joi.string().min(8).max(30).required(),
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  ipv6Subnet: 56,
});
const registerSchema = Joi.object<RegisterBody>({
  userName: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(8).max(30).required(),
  email: Joi.string().email().required(),
});

const loginSchema = Joi.object<LoginBody>({
  identifier: Joi.string().required(),
  password: Joi.string().required(),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 4,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  ipv6Subnet: 56,
});

// Valid 10-round bcrypt hash for dummy comparisons
const DUMMY_HASH =
  "$2b$12$1HNN1qFZHzeHdX50CzmWoudVmfLCNZwdeluSjuYKQiDwr4f8v1h22";

// --- HELPERS ---

function generateAccessToken(
  user: Pick<IUserLike, "userName" | "role">,
): string {
  const payload: AccessTokenPayload = {
    userName: user.userName,
    role: user.role,
  };
  return jwt.sign(payload, requireEnv("ACCESS_TOKEN_SECRET"), {
    expiresIn: "15m",
  });
}

function generateRefreshToken(
  user: Pick<IUserLike, "userName" | "role">,
): string {
  const payload: AccessTokenPayload = {
    userName: user.userName,
    role: user.role,
  };
  return jwt.sign(payload, requireEnv("REFRESH_TOKEN_SECRET"), {
    expiresIn: "7d",
  });
}

// Issues a token pair + refresh-token-family record, used by both
// /login and /google/callback so every auth path gets the same
// rotation/replay protection.
async function issueTokenPair(user: IUserLike): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const familyId = crypto.randomUUID();

  await RefreshToken.create({
    token: refreshToken,
    userName: user.userName,
    familyId,
    used: false,
  });

  return { accessToken, refreshToken };
}

// --- ROUTES ---

router.post(
  "/register",
  authLimiter,
  validate<RegisterBody>(registerSchema),
  async (req: Request<unknown, unknown, RegisterBody>, res: Response) => {
    try {
      const { userName, email, password } = req.body;

      const existingUser = await User.findOne({
        $or: [{ userName }, { email: email.toLowerCase() }],
      });

      if (existingUser) {
        res.status(400).json({ message: "Username or email already in use" });
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const newUser = new User({
        userName,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: "user",
      });

      await newUser.save();
      res.status(201).json({ message: "User registered successfully." });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  },
);

router.post(
  "/login",
  authLimiter,
  validate<LoginBody>(loginSchema),
  async (req: Request<unknown, unknown, LoginBody>, res: Response) => {
    try {
      const { identifier, password } = req.body;

      const existingUser = await User.findOne({
        $or: [{ userName: identifier }, { email: identifier.toLowerCase() }],
      });

      const hashToCompare = existingUser?.password ?? DUMMY_HASH;
      const isMatch = await bcrypt.compare(password, hashToCompare);

      if (!existingUser || !isMatch) {
        res.status(401).send("Invalid credentials");
        return;
      }

      const { accessToken, refreshToken } = await issueTokenPair(existingUser);

      res
        .status(200)
        .json({
          message: "Login successfully",
          accessToken,
          refreshToken,
          role: existingUser.role,
        });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  },
);

router.post("/token", async (req: Request<unknown, unknown, RefreshBody>, res: Response) => {
  try {
    const refreshToken = req.body.token;
    if (!refreshToken) {
      res.sendStatus(401);
      return;
    }

    let decoded: AccessTokenPayload;
    try {
      decoded = jwt.verify(refreshToken, requireEnv("REFRESH_TOKEN_SECRET")) as AccessTokenPayload;
    } catch {
      res.sendStatus(403);
      return;
    }

    const storedToken = await RefreshToken.findOne({ token: refreshToken });
    if (!storedToken) {
      res.sendStatus(401);
      return;
    }

    if (storedToken.used) {
      // Replay attack detected: revoke entire family
      await RefreshToken.deleteMany({ familyId: storedToken.familyId });
      res.sendStatus(403);
      return;
    }

    // Fresh lookup — role may have changed since this token was issued
    const currentUser = await User.findOne({ userName: decoded.userName });
    if (!currentUser) {
      res.sendStatus(401);
      return;
    }

    const accessToken = generateAccessToken({ userName: currentUser.userName, role: currentUser.role });
    const newRefreshToken = generateRefreshToken({ userName: currentUser.userName, role: currentUser.role });

    await RefreshToken.create({
      token: newRefreshToken,
      userName: currentUser.userName,
      familyId: storedToken.familyId,
      used: false,
    });

    storedToken.used = true;
    await storedToken.save();

    res.json({ accessToken, refreshToken: newRefreshToken, role: currentUser.role });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.delete(
  "/logout",
  async (req: Request<unknown, unknown, RefreshBody>, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        res.sendStatus(400);
        return;
      }

      const storedToken = await RefreshToken.findOne({ token });
      if (storedToken) {
        await RefreshToken.deleteMany({ familyId: storedToken.familyId });
      } else {
        await RefreshToken.deleteOne({ token });
      }

      res.sendStatus(204);
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  },
);
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate<ForgotPasswordBody>(forgotPasswordSchema),
  async (req: Request<unknown, unknown, ForgotPasswordBody>, res: Response) => {
    try {
      const { email } = req.body;

      // Always return the same message so attackers can't use this endpoint
      // to figure out which emails are registered.
      const genericResponse = {
        message:
          "If an account with that email exists, a password reset link has been sent.",
      };

      const existingUser = await User.findOne({ email: email.toLowerCase() });

      if (existingUser) {
        // Invalidate any previously issued reset links for this user
        await PasswordResetToken.deleteMany({
          userName: existingUser.userName,
        });

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto
          .createHash("sha256")
          .update(rawToken)
          .digest("hex");

        await PasswordResetToken.create({
          tokenHash,
          userName: existingUser.userName,
        });

        const resetLink = `${requireEnv("FRONTEND_URL")}/reset-password?token=${rawToken}`;

        try {
          await sendPasswordResetEmail(existingUser.email, resetLink);
        } catch (mailErr) {
          console.error("Failed to send password reset email:", mailErr);
          // Don't leak the failure to the client — still respond generically
        }
      }

      res.status(200).json(genericResponse);
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  },
);

router.post(
  "/reset-password",
  authLimiter,
  validate<ResetPasswordBody>(resetPasswordSchema),
  async (req: Request<unknown, unknown, ResetPasswordBody>, res: Response) => {
    try {
      const { token, password } = req.body;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const storedToken = await PasswordResetToken.findOne({
        tokenHash,
        used: false,
      });
      if (!storedToken) {
        res
          .status(400)
          .json({ message: "This reset link is invalid or has expired." });
        return;
      }

      const user = await User.findOne({ userName: storedToken.userName });
      if (!user) {
        res
          .status(400)
          .json({ message: "This reset link is invalid or has expired." });
        return;
      }

      user.password = await bcrypt.hash(password, 12);
      await user.save();

      storedToken.used = true;
      await storedToken.save();

      // Password changed — log the user out everywhere for safety
      await RefreshToken.deleteMany({ userName: user.userName });

      res
        .status(200)
        .json({ message: "Password has been reset successfully." });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  },
);

// --- GOOGLE OAUTH ---
// Requires passport.initialize() to be mounted once in your app entrypoint,
// and the GoogleStrategy registered (see googleStrategy.ts). Mounting this
// router at "/auth" gives you /auth/google and /auth/google/callback,
// matching the paths the old app used.

router.get(
  "/google",
  passport.authenticate("google", { scope: ["email", "profile"], session: false }),
);

router.get("/google/callback", (req: Request, res: Response, next) => {
  passport.authenticate(
    "google",
    { session: false },
    async (err: Error | null, user: IUserLike | false | null) => {
      const frontendUrl = requireEnv("FRONTEND_URL");
 
      if (err || !user) {
        res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
        return;
      }
 
      try {
        const { accessToken, refreshToken } = await issueTokenPair(user);
 
        const params = new URLSearchParams({
          accessToken,
          refreshToken,
          role: user.role,
          userName: user.userName,
        });
 
        res.redirect(`${frontendUrl}/auth/callback#${params.toString()}`);
      } catch (e) {
        console.error(e);
        res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
      }
    },
  )(req, res, next);
});
 
export default router;