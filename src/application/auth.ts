import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { User } from "../domain/types.js";

export type AuthTokenType = "web" | "plugin";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  type: AuthTokenType;
  exp: number;
}

export function hashPassword(password: string, salt: string | undefined): string {
  const passwordSalt = salt ?? randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(password, passwordSalt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${passwordSalt}$${digest}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [algorithm, iterations, salt, digest] = passwordHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !digest) {
    return false;
  }

  const expected = Buffer.from(digest, "hex");
  const actual = Buffer.from(
    pbkdf2Sync(password, salt, Number(iterations), expected.length, "sha256").toString("hex"),
    "hex",
  );

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function signAuthToken(user: User, secret: string, type: AuthTokenType, expiresInSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    type,
    exp: now + expiresInSeconds,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

export function verifyAuthToken(token: string, secret: string, expectedType: AuthTokenType): AuthTokenPayload | undefined {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) {
    return undefined;
  }

  const expectedSignature = sign(`${header}.${body}`, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return undefined;
  }

  const payload = parseAuthTokenPayload(body);
  if (!payload) {
    return undefined;
  }
  if (payload.type !== expectedType || payload.exp < Math.floor(Date.now() / 1000)) {
    return undefined;
  }

  return payload;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function parseAuthTokenPayload(value: string): AuthTokenPayload | undefined {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AuthTokenPayload>;
    if (
      typeof decoded.sub !== "string" ||
      typeof decoded.email !== "string" ||
      (decoded.type !== "web" && decoded.type !== "plugin") ||
      typeof decoded.exp !== "number"
    ) {
      return undefined;
    }

    return {
      sub: decoded.sub,
      email: decoded.email,
      type: decoded.type,
      exp: decoded.exp,
    };
  } catch {
    return undefined;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
