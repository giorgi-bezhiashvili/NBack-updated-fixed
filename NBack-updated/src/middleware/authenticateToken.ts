import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];
  if (!token) {
    res.sendStatus(401);
    return;
  }
  jwt.verify(token, requireEnv("ACCESS_TOKEN_SECRET"), (err, decoded) => {
    if (err || !decoded || typeof decoded === "string") {
      res.sendStatus(403);
      return;
    }
    req.user = decoded as unknown as Express.User;
    next();
  });
}
