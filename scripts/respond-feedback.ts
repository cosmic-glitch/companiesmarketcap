/**
 * Set (or clear) the owner's public response to a feature suggestion, by id.
 * The response shows in the in-app suggestion list, in its own column next to
 * the idea. There is no in-app UI for writing responses — this script is the
 * only path.
 *
 * Find ids with: npx tsx scripts/read-feedback.ts --json   (the "id" field)
 *
 * Usage:
 *   npx tsx scripts/respond-feedback.ts <id> "Your response text"
 *   npx tsx scripts/respond-feedback.ts <id> --clear      # remove a response
 *
 * Writes to Vercel Blob when BLOB_READ_WRITE_TOKEN is set, else data/feedback/.
 */

import fs from "fs";
import path from "path";

// Load .env.local (same pattern as scripts/read-feedback.ts) so the blob token
// is available when run from the shell.
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const idx = line.indexOf("=");
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).replace(/^["']|["']$/g, "").trim();
      if (key && val && process.env[key] === undefined) {
        process.env[key] = val;
      }
    });
}

const argv = process.argv.slice(2);
const clear = argv.includes("--clear");
const positional = argv.filter((a) => !a.startsWith("-"));
const id = positional[0];
const responseText = positional.slice(1).join(" ");

function usage(): never {
  console.error('Usage: tsx scripts/respond-feedback.ts <id> "Your response text"');
  console.error("       tsx scripts/respond-feedback.ts <id> --clear");
  console.error("Find ids with: tsx scripts/read-feedback.ts --json");
  process.exit(1);
}

if (!id || (!clear && !responseText)) usage();

(async () => {
  // Import after env is loaded so the blob token is in scope.
  const { setFeedbackResponse } = await import("../lib/db");

  const ok = await setFeedbackResponse(id, clear ? null : responseText);
  if (!ok) {
    console.error(`Not found: ${id}`);
    process.exit(2);
  }
  console.log(clear ? `Cleared response: ${id}` : `Responded: ${id}`);
})();
