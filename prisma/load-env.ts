// Side-effect module: load .env into process.env BEFORE anything that reads it.
// Imported first by seed.ts so that @/lib/prisma (instantiated at import time)
// sees DATABASE_URL. Minimal parser, no dependency.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
