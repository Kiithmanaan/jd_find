import { randomUUID } from "node:crypto";
import { hashPassword } from "../application/auth.js";
import { loadEnvFile } from "../config/load-env.js";
import type { User } from "../domain/types.js";
import { createPrismaClient, PrismaUserRepository } from "../infrastructure/prisma/prisma-repositories.js";

loadEnvFile();

const email = readRequiredEnv("USER_EMAIL").trim().toLowerCase();
const password = readRequiredEnv("USER_PASSWORD");
const prisma = createPrismaClient();
const users = new PrismaUserRepository(prisma);

try {
  const existingUser = await users.findByEmail(email);
  const user: User = {
    id: existingUser?.id ?? randomUUID(),
    email,
    passwordHash: hashPassword(password, undefined),
    pluginTokenVersion: existingUser?.pluginTokenVersion ?? 1,
    createdAt: existingUser?.createdAt ?? new Date(),
  };

  await users.save(user);
  console.log(JSON.stringify({ id: user.id, email: user.email }));
} finally {
  await prisma.$disconnect();
}

function readRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}
