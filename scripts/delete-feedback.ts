/**
 * Delete user-submitted feature suggestions by id. Safety valve for abusive or
 * test submissions — there is no in-app delete UI.
 *
 * Find ids with: npx tsx scripts/read-feedback.ts --json   (the "id" field)
 *
 * Usage:
 *   npx tsx scripts/delete-feedback.ts <id> [<id> ...]
 *
 * Deletes from Vercel Blob when BLOB_READ_WRITE_TOKEN is set, else data/feedback/.
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

const ids = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (ids.length === 0) {
  console.error("Usage: tsx scripts/delete-feedback.ts <id> [<id> ...]");
  console.error("Find ids with: tsx scripts/read-feedback.ts --json");
  process.exit(1);
}

(async () => {
  // Import after env is loaded so the blob token is in scope.
  const { deleteFeedback } = await import("../lib/db");

  let failed = 0;
  for (const id of ids) {
    const ok = await deleteFeedback(id);
    if (ok) {
      console.log(`Deleted: ${id}`);
    } else {
      console.error(`Not found: ${id}`);
      failed++;
    }
  }
  process.exit(failed > 0 ? 2 : 0);
})();
