import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { JOB_STATUSES, type JobStatus, loadState, loadUserState } from "../state/store.js";
import { recordStatus } from "../state/userState.js";
import { APP_CSS } from "./app.css.js";
import { renderHome, renderJob, renderNotFound } from "./html.js";
import { buildView, jobDetail } from "./model.js";
import { type Git, pushUserState } from "./sync.js";

export interface DashboardOptions {
  instanceDir: string;
  port: number;
  sync: boolean;
  now?: () => Date;
  git?: Git;
}

const HEADERS = {
  "Content-Security-Policy":
    "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};
const MAX_FORM_BYTES = 4_096;

function send(
  res: ServerResponse,
  status: number,
  body: string,
  type = "text/html; charset=utf-8",
  extra = {},
) {
  res.writeHead(status, { ...HEADERS, "Content-Type": type, ...extra });
  res.end(body);
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams | null> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_FORM_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

const sameToken = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Local-only dashboard. Writes nothing but data/user-state.json (the laptop-owned file). */
export async function startDashboard(
  opts: DashboardOptions,
): Promise<{ url: string; close(): Promise<void> }> {
  const csrf = randomBytes(24).toString("base64url");
  const now = opts.now ?? (() => new Date());
  let syncNote: string | null = opts.sync ? null : "Sync is off: status changes stay on this computer.";
  let origin = "";
  let allowedHosts = new Set<string>();

  const server = createServer(async (req, res) => {
    try {
      // DNS-rebinding guard: a malicious site can point its own hostname at 127.0.0.1, but not change Host.
      if (!allowedHosts.has(req.headers.host ?? ""))
        return send(res, 421, "Misdirected request", "text/plain");
      const url = new URL(req.url ?? "/", origin);

      if (req.method === "GET" && url.pathname === "/app.css")
        return send(res, 200, APP_CSS, "text/css; charset=utf-8");
      if (req.method === "GET" && url.pathname === "/") {
        const view = buildView(loadState(opts.instanceDir), loadUserState(opts.instanceDir), {
          show: url.searchParams.get("show") === "all" ? "all" : "open",
        });
        return send(res, 200, renderHome(view, csrf, syncNote, now()));
      }
      const jobPath = /^\/job\/([^/]+)(\/status)?$/.exec(url.pathname);
      if (jobPath) {
        const id = decodeURIComponent(jobPath[1] ?? "");
        if (req.method === "GET" && !jobPath[2]) {
          const d = jobDetail(loadState(opts.instanceDir), loadUserState(opts.instanceDir), id);
          return d ? send(res, 200, renderJob(d, csrf, now())) : send(res, 404, renderNotFound());
        }
        if (req.method === "POST" && jobPath[2]) {
          // CSRF guard: other sites can make the browser POST here, but cannot read our token.
          const reqOrigin = req.headers.origin;
          if (reqOrigin && reqOrigin !== origin) return send(res, 403, "Forbidden", "text/plain");
          const form = await readForm(req);
          if (!form || !sameToken(form.get("csrf") ?? "", csrf))
            return send(res, 403, "Forbidden", "text/plain");
          if (!jobDetail(loadState(opts.instanceDir), loadUserState(opts.instanceDir), id)) {
            return send(res, 404, renderNotFound());
          }
          const status = form.get("status") ?? "";
          if (!(JOB_STATUSES as readonly string[]).includes(status))
            return send(res, 400, "Unknown status", "text/plain");
          recordStatus(opts.instanceDir, id, status as JobStatus, now());
          if (opts.sync) syncNote = (await pushUserState(opts.instanceDir, opts.git)).note;
          return send(res, 303, "", "text/plain", { Location: `/job/${encodeURIComponent(id)}` });
        }
      }
      return send(res, 404, renderNotFound());
    } catch (e) {
      return send(
        res,
        500,
        `Something went wrong: ${e instanceof Error ? e.message : String(e)}`,
        "text/plain",
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
  allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  return {
    url: origin,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
