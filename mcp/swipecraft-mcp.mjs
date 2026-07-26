#!/usr/bin/env node
// Swipecraft MCP server — lets an assistant hand finished carousels to the app.
//
// The editor keeps projects in browser localStorage, which a server process
// cannot write to. So this drops each carousel into an inbox directory and the
// app imports from it via /api/inbox. Nothing here talks to a model: the
// assistant has already written the copy by the time it calls these tools.
//
// Zero dependencies. Speaks JSON-RPC 2.0 over stdio, newline-delimited.

import { mkdir, readdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const INBOX = process.env.SWIPECRAFT_INBOX || join(homedir(), ".swipecraft", "inbox");
const PROTOCOL_VERSION = "2024-11-05";

const SLIDE_TYPES = [
  "hook", "body", "cta", "quote", "stats", "list",
  "checklist", "process", "comparison", "image", "emoji", "number",
];

const CREATE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Project name shown in the sidebar." },
    slides: {
      type: "array",
      minItems: 1,
      description: "Slides in order. Slide 1 is normally the hook, the last is normally the cta.",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: SLIDE_TYPES },
          text: { type: "string", description: "Body copy. Use \\n for line breaks; max ~5 lines." },
          title: { type: "string", description: "Short heading, e.g. '1. ANY MODEL'." },
          highlight: { type: "string", description: "Must appear verbatim inside this slide's text or title." },
          handle: { type: "string", description: "Channel handle, cta slides only." },
          items: { type: "array", items: { type: "string" }, description: "list / checklist slides." },
          stats: {
            type: "array",
            description: "stats slides.",
            items: {
              type: "object",
              properties: { value: { type: "string" }, label: { type: "string" } },
              required: ["value", "label"],
            },
          },
        },
        required: ["type"],
      },
    },
  },
  required: ["name", "slides"],
};

const TOOLS = [
  {
    name: "swipecraft_create_carousel",
    description:
      "Send a finished carousel to Swipecraft. Write the slide copy yourself before calling this — " +
      "the tool only stores what you pass in. The carousel appears in the app's Import panel, " +
      "where the user pulls it in as a new project. Keep hooks under 30 words across 3 short lines, " +
      "body slides to one idea and max 5 lines, and make every `highlight` appear verbatim in that " +
      "slide's own text or title or it will not render.",
    inputSchema: CREATE_SCHEMA,
  },
  {
    name: "swipecraft_list_pending",
    description: "List carousels sitting in the inbox that the user has not imported yet.",
    inputSchema: { type: "object", properties: {} },
  },
];

function validate(args) {
  const errors = [];
  const name = typeof args?.name === "string" ? args.name.trim() : "";
  if (!name) errors.push("`name` is required and must be a non-empty string.");

  const slides = Array.isArray(args?.slides) ? args.slides : null;
  if (!slides || slides.length === 0) {
    errors.push("`slides` is required and must be a non-empty array.");
    return { errors };
  }

  const clean = [];
  slides.forEach((s, i) => {
    const at = `slides[${i}]`;
    if (!s || typeof s !== "object") return errors.push(`${at} must be an object.`);
    if (!SLIDE_TYPES.includes(s.type)) {
      return errors.push(`${at}.type "${s.type}" is not one of: ${SLIDE_TYPES.join(", ")}`);
    }
    // A highlight that isn't present verbatim silently fails to render, so reject it here.
    if (typeof s.highlight === "string" && s.highlight.trim()) {
      const haystack = `${s.text || ""}\n${s.title || ""}`;
      if (!haystack.includes(s.highlight)) {
        errors.push(`${at}.highlight ${JSON.stringify(s.highlight)} does not appear verbatim in that slide's text or title.`);
      }
    }
    clean.push(s);
  });

  return { errors, name, slides: clean };
}

async function createCarousel(args) {
  const { errors, name, slides } = validate(args);
  if (errors.length) {
    return { isError: true, text: `Carousel rejected:\n- ${errors.join("\n- ")}` };
  }

  await mkdir(INBOX, { recursive: true });
  const id = randomUUID();
  const payload = { id, name, slides, createdAt: Date.now(), source: "mcp" };
  await writeFile(join(INBOX, `${id}.json`), JSON.stringify(payload, null, 2), "utf8");

  return {
    text:
      `Sent "${name}" (${slides.length} slides) to Swipecraft.\n` +
      `Open the app and click "Import" to pull it in as a new project.`,
  };
}

async function listPending() {
  let files = [];
  try {
    files = (await readdir(INBOX)).filter((f) => f.endsWith(".json"));
  } catch {
    return { text: "Inbox is empty (no carousels waiting)." };
  }
  if (files.length === 0) return { text: "Inbox is empty (no carousels waiting)." };
  return { text: `${files.length} carousel(s) waiting to be imported.` };
}

// ---- JSON-RPC plumbing ----

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;

  // Notifications carry no id and take no response.
  if (id === undefined || id === null) return;

  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "swipecraft", version: "1.0.0" },
      });

    case "ping":
      return reply(id, {});

    case "tools/list":
      return reply(id, { tools: TOOLS });

    case "tools/call": {
      const toolName = params?.name;
      const args = params?.arguments || {};
      try {
        let out;
        if (toolName === "swipecraft_create_carousel") out = await createCarousel(args);
        else if (toolName === "swipecraft_list_pending") out = await listPending();
        else return replyError(id, -32602, `Unknown tool: ${toolName}`);

        return reply(id, {
          content: [{ type: "text", text: out.text }],
          isError: Boolean(out.isError),
        });
      } catch (e) {
        return reply(id, {
          content: [{ type: "text", text: `Failed: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        });
      }
    }

    default:
      return replyError(id, -32601, `Method not found: ${method}`);
  }
}

// Handlers are async, so track them and drain before exiting — otherwise a
// close on stdin can kill the process mid-write and silently drop a carousel.
const inFlight = new Set();

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // ignore malformed frames rather than killing the server
    }
    const task = handle(msg)
      .catch((e) => {
        if (msg?.id != null) replyError(msg.id, -32603, e instanceof Error ? e.message : String(e));
      })
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
  }
});

process.stdin.on("end", async () => {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
  process.exit(0);
});
