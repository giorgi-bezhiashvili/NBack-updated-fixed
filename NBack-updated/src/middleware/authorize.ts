// middleware/authorize.ts
import {type Request,type Response,type NextFunction } from "express";

// Make sure your Request type includes `user` if extended
export interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    userName: string;
    role: string;
  };
}

export const requireRole = (allowedRole: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== allowedRole) {
      res.status(403).json({ error: `Access denied. ${allowedRole} permission required.` });
      return;
    }
    next();
  };
};