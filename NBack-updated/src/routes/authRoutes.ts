import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Joi from "joi";
import rateLimit from "express-rate-limit";
import User from "../models/userSchema.js";
import RefreshToken from "../models/refreshTokenSchema.js";
import { validate } from "../middleware/validate.js";
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
}

interface LoginBody {
  userName: string;
  password: string;
}

interface RefreshBody {
  token?: string;
}

interface AccessTokenPayload {
  userName: string;
}

interface IUserLike {
  userName: string;
}

const registerSchema = Joi.object<RegisterBody>({
  userName: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(8).max(30).required(),
});

const loginSchema = Joi.object<LoginBody>({
  userName: Joi.string().required(),
  password: Joi.string().required(),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  ipv6Subnet: 56,
});

function generateAccessToken(user: Pick<IUserLike, "userName">): string {
  const payload: AccessTokenPayload = { userName: user.userName };
  return jwt.sign(payload, requireEnv("ACCESS_TOKEN_SECRET"), { expiresIn: "15m" });
}

function generateRefreshToken(user: Pick<IUserLike, "userName">): string {
  const payload: AccessTokenPayload = { userName: user.userName };
  return jwt.sign(payload, requireEnv("REFRESH_TOKEN_SECRET"), { expiresIn: "7d" });
}

const DUMMY_HASH = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

// --- ROUTES ---

router.post(
  "/register",
  authLimiter,
  validate<RegisterBody>(registerSchema),
  async (req: Request<unknown, unknown, RegisterBody>, res: Response) => {
    try {
      const { userName, password } = req.body;
      const existingUser = await User.findOne({ userName });
      if (existingUser) {
        res.status(400).json({ message: "User already exists" });
        return;
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      const newUser = new User({ userName, password: hashedPassword });
      await newUser.save();
      res.status(201).json({ message: "User registered successfully." });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  }
);

router.post(
  "/login",
  authLimiter,
  validate<LoginBody>(loginSchema),
  async (req: Request<unknown, unknown, LoginBody>, res: Response) => {
    try {
      const { userName, password } = req.body;
      const existingUser = await User.findOne({ userName });

      const hashToCompare = existingUser?.password ?? DUMMY_HASH;
      const isMatch = await bcrypt.compare(password, hashToCompare);

      if (!existingUser || !isMatch) {
        res.status(401).send("Username or password is incorrect");
        return;
      }

      const accessToken = generateAccessToken(existingUser);
      const refreshToken = generateRefreshToken(existingUser);

      // familyId groups every token descended from this login. Reuse of any
      // token in the family causes the whole family to be revoked.
      const familyId = crypto.randomUUID();

      await RefreshToken.create({
        token: refreshToken,
        userName: existingUser.userName,
        familyId,
        used: false,
      });

      res.status(200).json({ message: "Login Successfully", accessToken, refreshToken });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  }
);

router.post("/token", async (req: Request<unknown, unknown, RefreshBody>, res: Response) => {
  try {
    const refreshToken = req.body.token;
    if (!refreshToken) {
      res.sendStatus(401);
      return;
    }

    // Verify signature/expiry first so we never trust an invalid token,
    // regardless of what's in the DB.
    let decoded: AccessTokenPayload;
    try {
      decoded = jwt.verify(refreshToken, requireEnv("REFRESH_TOKEN_SECRET")) as AccessTokenPayload;
    } catch {
      res.sendStatus(403);
      return;
    }

    const storedToken = await RefreshToken.findOne({ token: refreshToken });

    if (!storedToken) {
      // Never issued, or already cleaned up after its family was revoked.
      res.sendStatus(401);
      return;
    }

    if (storedToken.used) {
      // This exact token was already rotated away once before. Someone is
      // replaying an old token — treat the whole family as compromised.
      await RefreshToken.deleteMany({ familyId: storedToken.familyId });
      res.sendStatus(403);
      return;
    }

    // Rotate: mark this token used, issue a new token in the same family.
    storedToken.used = true;
    await storedToken.save();

    const accessToken = generateAccessToken({ userName: decoded.userName });
    const newRefreshToken = generateRefreshToken({ userName: decoded.userName });

    await RefreshToken.create({
      token: newRefreshToken,
      userName: decoded.userName,
      familyId: storedToken.familyId,
      used: false,
    });

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

router.delete("/logout", async (req: Request<unknown, unknown, RefreshBody>, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.sendStatus(400);
      return;
    }

    // Log out the whole session lineage, not just the single token in hand.
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
});

export default router;