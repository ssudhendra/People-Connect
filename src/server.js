import http from "node:http";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAuthorizationUrl, exchangeCodeForToken, fetchLinkedInProfile, getLinkedInScopes, getOAuthFlow, isPkceFlow } from "./services/linkedin.js";
import { getProfileForSession, getSession } from "./services/session.js";
import { createOpportunities } from "./services/opportunities.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");

function loadEnvFile(filePath) {
  try {
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [rawKey, ...rawValue] = trimmed.split("=");
      const key = rawKey.trim();
      let value = rawValue.join("=").trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

loadEnvFile(path.join(rootDir, ".env"));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://${HOST}:${PORT}`;
const CONNECTOR_MODE = process.env.CONNECTOR_MODE || "demo";
const LINKEDIN_REDIRECT_URI = `${PUBLIC_BASE_URL}/auth/linkedin/callback`;

function isLinkedInConfigured() {
  if (!process.env.LINKEDIN_CLIENT_ID) return false;
  if (isPkceFlow()) return true;
  return Boolean(process.env.LINKEDIN_CLIENT_SECRET);
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".yaml", "application/yaml; charset=utf-8"],
  [".yml", "application/yaml; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 1_000_000) {
      throw new Error("Request body is too large.");
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function serveStatic(req, res) {
  const url = new URL(req.url, PUBLIC_BASE_URL);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = mimeTypes.get(path.extname(filePath)) || "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": contentType.startsWith("text/html") ? "no-store" : "public, max-age=300"
    });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, PUBLIC_BASE_URL);
  const session = getSession(req, res);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      mode: CONNECTOR_MODE,
      linkedInConfigured: isLinkedInConfigured(),
      linkedInOAuthFlow: getOAuthFlow(),
      linkedInScopes: getLinkedInScopes(),
      linkedInRedirectUri: LINKEDIN_REDIRECT_URI,
      jobSourceConfigured: Boolean(process.env.JOB_SOURCE_API_URL),
      baseUrl: PUBLIC_BASE_URL
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/profile") {
    sendJson(res, 200, {
      profile: getProfileForSession(session),
      authenticated: Boolean(session.profile?.provider === "linkedin")
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/opportunities") {
    const payload = await readBody(req);
    const profile = getProfileForSession(session);
    const opportunities = await createOpportunities(profile, payload);
    sendJson(res, 200, { profile, opportunities });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    session.profile = null;
    session.tokens = null;
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

async function handleAuth(req, res) {
  const url = new URL(req.url, PUBLIC_BASE_URL);
  const session = getSession(req, res);

  if (req.method === "GET" && url.pathname === "/auth/linkedin/start") {
    if (!isLinkedInConfigured()) {
      redirect(res, "/?authError=missing-linkedin-oauth-config");
      return;
    }

    const state = crypto.randomBytes(24).toString("base64url");
    const usePkce = isPkceFlow();
    const codeVerifier = usePkce ? crypto.randomBytes(48).toString("base64url") : null;
    session.oauth = {
      state,
      codeVerifier,
      usePkce,
      createdAt: Date.now()
    };

    redirect(res, buildAuthorizationUrl({
      state,
      codeVerifier,
      redirectUri: LINKEDIN_REDIRECT_URI
    }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/linkedin/callback") {
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      redirect(res, `/?authError=${encodeURIComponent(error)}`);
      return;
    }

    if (!code || !state || !session.oauth || session.oauth.state !== state) {
      redirect(res, "/?authError=invalid-oauth-state");
      return;
    }

    if (Date.now() - session.oauth.createdAt > 10 * 60 * 1000) {
      redirect(res, "/?authError=expired-oauth-state");
      return;
    }

    try {
      const tokens = await exchangeCodeForToken({
        code,
        codeVerifier: session.oauth.codeVerifier,
        usePkce: session.oauth.usePkce,
        redirectUri: LINKEDIN_REDIRECT_URI
      });
      const profile = await fetchLinkedInProfile(tokens);
      session.tokens = tokens;
      session.profile = profile;
      session.oauth = null;
      redirect(res, "/?auth=linkedin");
    } catch (err) {
      redirect(res, `/?authError=${encodeURIComponent(err.message)}`);
    }
    return;
  }

  sendJson(res, 404, { error: "Unknown auth route" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, PUBLIC_BASE_URL);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    if (url.pathname.startsWith("/auth/")) {
      await handleAuth(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Internal server error" });
  }
});

server.on("error", (err) => {
  console.error(`Unable to start server on ${HOST}:${PORT}: ${err.message}`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`People Connections Connector running at ${PUBLIC_BASE_URL}`);
});
