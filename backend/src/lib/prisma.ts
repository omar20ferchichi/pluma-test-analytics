import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

export const prisma = new PrismaClient();
