import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFeedback, FeedbackEntry } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LEN = 2000;
const MAX_EMAIL_LEN = 254;
const MAX_PATH_LEN = 512;
const MAX_UA_LEN = 512;

// Lightweight per-IP rate limit. In-memory only: on Fluid Compute an instance is
// reused across requests so this throttles the common case; it is not a hard
// global guarantee, which is fine for a low-stakes suggestion box. Paired with a
// honeypot field (below), it keeps casual spam out without a CAPTCHA or new deps.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// Crude content heuristics: bots overwhelmingly post link spam or single-token
// junk. Reject all-URL / no-letter messages. Humans suggesting features write prose.
function looksLikeSpam(message: string): boolean {
  const urlCount = (message.match(/https?:\/\//gi) ?? []).length;
  if (urlCount >= 3) return true;
  if (!/[a-z]/i.test(message)) return true;
  return false;
}

interface FeedbackBody {
  message?: unknown;
  email?: unknown;
  path?: unknown;
  // Honeypot: a field hidden from real users via CSS. Bots fill every input,
  // so a non-empty value here is a near-certain bot — we accept and discard.
  website?: unknown;
}

export async function POST(request: NextRequest) {
  let body: FeedbackBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Honeypot tripped — pretend success so the bot gets no signal, but store nothing.
  if (typeof body.website === "string" && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true });
  }

  // Validate message.
  if (typeof body.message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const message = body.message.trim();
  if (message.length === 0 || message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json(
      { error: `message must be 1-${MAX_MESSAGE_LEN} characters` },
      { status: 400 }
    );
  }
  if (looksLikeSpam(message)) {
    // Same silent-accept treatment as the honeypot.
    return NextResponse.json({ ok: true });
  }

  // Validate optional email.
  let email: string | null = null;
  if (body.email !== undefined && body.email !== null && body.email !== "") {
    if (typeof body.email !== "string" || body.email.length > MAX_EMAIL_LEN) {
      return NextResponse.json({ error: "invalid email" }, { status: 400 });
    }
    const trimmed = body.email.trim();
    // Permissive single-@ check; we don't verify deliverability.
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json({ error: "invalid email" }, { status: 400 });
    }
    email = trimmed || null;
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 }
    );
  }

  const rawPath = typeof body.path === "string" ? body.path.slice(0, MAX_PATH_LEN) : null;
  const userAgent = request.headers.get("user-agent")?.slice(0, MAX_UA_LEN) ?? null;
  const country = request.headers.get("x-vercel-ip-country") ?? null;

  const entry: FeedbackEntry = {
    id: randomUUID(),
    message,
    email,
    submittedAt: new Date().toISOString(),
    path: rawPath,
    userAgent,
    country,
  };

  try {
    await writeFeedback(entry);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const messageText = error instanceof Error ? error.message : String(error);
    console.error("Error saving feedback:", error);
    return NextResponse.json(
      { error: "Failed to save feedback", message: messageText },
      { status: 500 }
    );
  }
}
