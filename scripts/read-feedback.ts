/**
 * Read user-submitted feature suggestions (newest first).
 *
 * Usage:
 *   npx tsx scripts/read-feedback.ts            # all submissions
 *   npx tsx scripts/read-feedback.ts --since 7d # last 7 days (also: 24h, 30m)
 *   npx tsx scripts/read-feedback.ts --json     # raw JSON dump
 *
 * Reads from Vercel Blob when BLOB_READ_WRITE_TOKEN is set, else data/feedback/.
 */

import fs from "fs";
import path from "path";

// Load .env.local (same pattern as scripts/upload-blob.ts) so the blob token is
// available when run from the shell.
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

function parseSince(arg: string | undefined): number | null {
  if (!arg) return null;
  const m = arg.match(/^(\d+)\s*([mhd])$/i);
  if (!m) {
    console.error(`Invalid --since value: ${arg} (use forms like 30m, 24h, 7d)`);
    process.exit(1);
  }
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const ms = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return Date.now() - n * ms;
}

(async () => {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const sinceIdx = argv.indexOf("--since");
  const sinceMs = parseSince(sinceIdx >= 0 ? argv[sinceIdx + 1] : undefined);

  // Imported after env is loaded so BLOB_READ_WRITE_TOKEN is in scope.
  const { listFeedback } = await import("../lib/db");
  let entries = await listFeedback();

  if (sinceMs !== null) {
    entries = entries.filter((e) => Date.parse(e.submittedAt) >= sinceMs);
  }

  if (asJson) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log("No feedback submissions found.");
    return;
  }

  console.log(`${entries.length} suggestion(s), newest first:\n`);
  for (const e of entries) {
    const when = e.submittedAt;
    const who = e.email ? ` · ${e.email}` : "";
    const where = e.country ? ` · ${e.country}` : "";
    console.log(`── ${when}${who}${where}`);
    console.log(e.message);
    console.log("");
  }
})();
