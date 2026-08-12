import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.accessToken as string | undefined;
  if (!token) {
    next();
    return;
  }
  jwt.verify(token, requireEnv("ACCESS_TOKEN_SECRET"), { algorithms: ["HS256"] }, (err, decoded) => {
    if (!err && decoded && typeof decoded !== "string") {
      req.user = decoded as unknown as Express.User;
    }
    next();
  });
}