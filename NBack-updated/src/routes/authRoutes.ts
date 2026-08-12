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
import { setAuthCookies, clearAuthCookies } from "../utils/cookie.js";
import { authenticateToken } from "../middleware/authenticateToken.js";
import refreshTokenSchema from "../models/refreshTokenSchema.js";
const router = Router();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

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
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  ipv6Subnet: 56,
});
const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  skip: (req, res) => res.statusCode === 429,
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
  windowMs: 15 * 60 * 1000,
  limit: 4,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  ipv6Subnet: 56,
});

const DUMMY_HASH =
  "$2b$12$1HNN1qFZHzeHdX50CzmWoudVmfLCNZwdeluSjuYKQiDwr4f8v1h22";

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

async function issueTokenPair(user: IUserLike): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const familyId = crypto.randomUUID();
  const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

  await RefreshToken.create({ tokenHash, userName: user.userName, familyId, used: false });

  return { accessToken, refreshToken };
}

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
      setAuthCookies(res, accessToken, refreshToken);

      res
        .status(200)
        .json({
          message: "Login successfully",
          userName: existingUser.userName,
          role: existingUser.role,
        });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  },
);

router.post("/token", tokenLimiter, async (req: Request<unknown, unknown, RefreshBody>, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) {
      res.sendStatus(401);
      return;
    }

    let decoded: AccessTokenPayload;
    try {
      decoded = jwt.verify(refreshToken, requireEnv("REFRESH_TOKEN_SECRET"), {
        algorithms: ["HS256"],
      }) as AccessTokenPayload;
    } catch {
      res.sendStatus(403);
      return;
    }

    const incomingHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    const storedToken = await RefreshToken.findOneAndUpdate(
      { tokenHash: incomingHash, used: false },
      { $set: { used: true } },
      { returnDocument: "after" }
    );

    if (!storedToken) {
      const usedToken = await RefreshToken.findOne({ tokenHash: incomingHash });

      if (!usedToken) {
        res.sendStatus(401);
        return;
      }

      const gracePeriodMs = 10 * 1000;
      const timeSinceUsed = Date.now() - new Date(usedToken.updatedAt).getTime();

      if (timeSinceUsed <= gracePeriodMs) {
        
        res.status(429).json({ message: "Token refresh in progress. Please wait." });
        return;
      }

      await RefreshToken.deleteMany({ familyId: usedToken.familyId });
      clearAuthCookies(res);
      res.sendStatus(403);
      return;
    }

    // 4. Verify User
    const currentUser = await User.findOne({ userName: decoded.userName });
    if (!currentUser) {
      res.sendStatus(401);
      return;
    }

    // 5. Generate New Tokens
    const accessToken = generateAccessToken({ userName: currentUser.userName, role: currentUser.role });
    const newRefreshToken = generateRefreshToken({ userName: currentUser.userName, role: currentUser.role });
    const newTokenHash = crypto.createHash("sha256").update(newRefreshToken).digest("hex");

    // 6. Save new token in the same family
    await RefreshToken.create({
      tokenHash: newTokenHash,
      userName: currentUser.userName,
      familyId: storedToken.familyId,
      used: false,
    });

    setAuthCookies(res, accessToken, newRefreshToken);
    res.json({ userName: currentUser.userName, role: currentUser.role });
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(500).send("Server error");
  }
});

router.delete(
  "/logout",
  async (req: Request<unknown, unknown, RefreshBody>, res: Response) => {
    try {
      const token = req.cookies?.refreshToken as string | undefined;

      if (token) {
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const storedToken = await RefreshToken.findOne({ tokenHash });
        if (storedToken) {
          await RefreshToken.deleteMany({ familyId: storedToken.familyId });
        } else {
          await RefreshToken.deleteOne({ tokenHash });
        }
      }

      clearAuthCookies(res);
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

      const genericResponse = {
        message:
          "If an account with that email exists, a password reset link has been sent.",
      };

      const existingUser = await User.findOne({ email: email.toLowerCase() });

      if (existingUser) {
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
        setAuthCookies(res, accessToken, refreshToken);

        const params = new URLSearchParams({
          role: user.role,
          userName: user.userName,
        });
 
        res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
      } catch (e) {
        console.error(e);
        res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
      }
    },
  )(req, res, next);
});
router.delete("/user/delete", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userName = req.user?.userName;
    if (!userName) {
      res.status(401).json({ message: "Unauthorized: Missing user information" });
      return;
    }
    const result = await User.deleteOne({ userName });
    if (result.deletedCount === 0) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    await RefreshToken.deleteMany({ userName });
    clearAuthCookies(res);
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Server error" });
  }
});
export default router