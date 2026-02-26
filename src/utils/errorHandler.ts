import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues,
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message });
  }

  const isProd = process.env.NODE_ENV === "production";
  return res.status(500).json({
    error: "Internal server error",
    ...(isProd ? {} : { stack: err instanceof Error ? err.stack : String(err) }),
  });
};
