/**
 * Upload companies.json to Vercel Blob
 *
 * Usage:
 *   npx tsx scripts/upload-blob.ts
 *
 * Requires BLOB_READ_WRITE_TOKEN in .env.local
 */

import fs from "fs";
import path from "path";
import { put } from "@vercel/blob";

// Load .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const idx = line.indexOf("=");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).replace(/^["']|["']$/g, "").trim();
    if (key && val && process.env[key] === undefined) {
      process.env[key] = val;
    }
  });
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) {
  console.error("Error: BLOB_READ_WRITE_TOKEN not found in .env.local");
  process.exit(1);
}

const jsonPath = path.join(process.cwd(), "data", "companies.json");
if (!fs.existsSync(jsonPath)) {
  console.error("Error: data/companies.json not found");
  process.exit(1);
}

const data = fs.readFileSync(jsonPath, "utf-8");
const parsed = JSON.parse(data);
console.log(`Uploading ${parsed.companies.length} companies to Vercel Blob...`);

put("companies.json", data, {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  token: BLOB_TOKEN,
})
  .then((blob) => {
    console.log(`Uploaded to: ${blob.url}`);
  })
  .catch((err) => {
    console.error("Failed:", err.message);
    process.exit(1);
  });
