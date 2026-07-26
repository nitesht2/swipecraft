import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, unlink } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

// Carousels handed over by the MCP server (see mcp/swipecraft-mcp.mjs).
//
// The editor stores projects in browser localStorage, which a server process
// cannot reach, so the MCP server writes JSON files here and the browser pulls
// them in. GET lists what is waiting; DELETE removes one once imported.
//
// Local only. This reads a directory on the host and is meaningless on a shared
// deployment, so it is off unless ENABLE_MCP_INBOX is set.

const INBOX = process.env.SWIPECRAFT_INBOX || join(homedir(), ".swipecraft", "inbox");

function inboxEnabled(): boolean {
  const v = (process.env.ENABLE_MCP_INBOX || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const DISABLED = {
  error: "MCP inbox is disabled on this instance. Set ENABLE_MCP_INBOX=1 to use it locally.",
};

/** Reject anything that isn't a plain uuid-ish filename before touching the filesystem. */
function safeId(id: string | null): string | null {
  if (!id) return null;
  return /^[a-zA-Z0-9-]{8,64}$/.test(id) ? id : null;
}

export async function GET() {
  if (!inboxEnabled()) return NextResponse.json(DISABLED, { status: 403 });

  let files: string[];
  try {
    files = (await readdir(INBOX)).filter((f) => f.endsWith(".json"));
  } catch {
    return NextResponse.json({ carousels: [] }); // no inbox dir yet is the empty case
  }

  const carousels = [];
  for (const f of files) {
    try {
      const raw = await readFile(join(INBOX, f), "utf8");
      const parsed = JSON.parse(raw);
      if (parsed?.id && Array.isArray(parsed.slides)) carousels.push(parsed);
    } catch {
      // Skip an unreadable or half-written file rather than failing the whole list.
    }
  }
  carousels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return NextResponse.json({ carousels });
}

export async function DELETE(req: NextRequest) {
  if (!inboxEnabled()) return NextResponse.json(DISABLED, { status: 403 });

  const id = safeId(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Valid id required" }, { status: 400 });

  try {
    await unlink(join(INBOX, `${id}.json`));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
