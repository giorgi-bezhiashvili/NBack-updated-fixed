import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ObjectSchema } from "joi";

export function validate<T>(schema: ObjectSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.body) {
      res.status(400).json({ message: "Request body is missing" });
      return;
    }
    const { error } = schema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0]?.message ?? "Invalid request body" });
      return;
    }
    next();
  };
}
