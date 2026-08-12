import crypto from "crypto";
import type { Response, CookieOptions } from "express";

const isProd = process.env.NODE_ENV === "production";

const BASE_COOKIE_OPTIONS: CookieOptions = {
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
};

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15m
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7d

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie("accessToken", accessToken, {
    ...BASE_COOKIE_OPTIONS,
    httpOnly: true,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  res.cookie("refreshToken", refreshToken, {
    ...BASE_COOKIE_OPTIONS,
    httpOnly: true,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
  res.cookie("csrfToken", crypto.randomBytes(32).toString("hex"), {
    ...BASE_COOKIE_OPTIONS,
    httpOnly: false,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

export function clearAuthCookies(res: Response): void {
  const opts: CookieOptions = { ...BASE_COOKIE_OPTIONS };
  res.clearCookie("accessToken", opts);
  res.clearCookie("refreshToken", opts);
  res.clearCookie("csrfToken", opts);
}