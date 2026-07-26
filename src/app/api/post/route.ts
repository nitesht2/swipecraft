import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const run = promisify(execFile);

// Schedule / publish a carousel to social via the Postiz CLI.
//
// DISABLED BY DEFAULT, and it must stay that way on anything publicly reachable.
// This route publishes to the host's own connected social accounts, so an open
// instance would let any caller post as the host. It only runs when ENABLE_POSTIZ
// is set, which is meant for a local machine that nobody else can reach.
//
// Requirements (all on the machine running this server):
//   - ENABLE_POSTIZ=1 in .env.local
//   - `postiz` CLI installed and on PATH (npm i -g postiz)
//   - POSTIZ_API_KEY set in .env.local
//   - at least one channel connected in Postiz (TikTok, Instagram, etc.)
// Body: { imagesBase64: string[], caption: string, scheduleISO?: string, integrationId?: string }

const POSTIZ_BIN = process.env.POSTIZ_BIN || "postiz";

function postizEnabled(): boolean {
  const v = (process.env.ENABLE_POSTIZ || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function postiz(args: string[], env: NodeJS.ProcessEnv) {
  const { stdout } = await run(POSTIZ_BIN, args, { env, maxBuffer: 1024 * 1024 * 16 });
  return stdout;
}

export async function POST(req: NextRequest) {
  if (!postizEnabled()) {
    return NextResponse.json(
      { error: "Scheduling is disabled on this instance. It posts to the host's own social accounts, so it only runs locally with ENABLE_POSTIZ=1." },
      { status: 403 }
    );
  }

  const apiKey = process.env.POSTIZ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "POSTIZ_API_KEY not set. Install Postiz, connect a channel, then add POSTIZ_API_KEY to .env.local." },
      { status: 500 }
    );
  }
  const env = { ...process.env, POSTIZ_API_KEY: apiKey };

  let body: { imagesBase64?: string[]; caption?: string; scheduleISO?: string; integrationId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const images = body.imagesBase64 || [];
  const caption = (body.caption || "").trim();
  if (images.length === 0) return NextResponse.json({ error: "No images provided" }, { status: 400 });

  // Resolve target channel
  let integrationId = body.integrationId;
  try {
    if (!integrationId) {
      const listRaw = await postiz(["integrations:list"], env);
      const list = JSON.parse(listRaw);
      const tiktok = list.find((i: { identifier?: string; id: string }) => i.identifier === "tiktok");
      integrationId = (tiktok || list[0])?.id;
    }
    if (!integrationId) throw new Error("No connected channels found in Postiz. Connect a channel first.");
  } catch (e) {
    return NextResponse.json({ error: `Postiz channel lookup failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }

  // Write images to temp, upload, collect URLs
  const dir = await mkdtemp(join(tmpdir(), "qsc-post-"));
  const mediaUrls: string[] = [];
  try {
    for (let i = 0; i < images.length; i++) {
      const b64 = images[i].includes(",") ? images[i].split(",")[1] : images[i];
      const file = join(dir, `${String(i + 1).padStart(2, "0")}.png`);
      await writeFile(file, Buffer.from(b64, "base64"));
      const uploadRaw = await postiz(["upload", file], env);
      const uploaded = JSON.parse(uploadRaw);
      if (uploaded.path) mediaUrls.push(uploaded.path);
    }

    const schedule = body.scheduleISO || new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const args = ["posts:create", "-c", caption || " ", "-m", mediaUrls.join(","), "-s", schedule, "-i", integrationId];
    const createRaw = await postiz(args, env);
    return NextResponse.json({ ok: true, integrationId, scheduledFor: schedule, result: createRaw.slice(0, 2000) });
  } catch (e) {
    return NextResponse.json({ error: `Postiz post failed: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
