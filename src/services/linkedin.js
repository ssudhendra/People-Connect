import crypto from "node:crypto";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const NATIVE_PKCE_AUTH_URL = "https://www.linkedin.com/oauth/native-pkce/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function base64UrlSha256(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function decodeJwtPayload(token) {
  if (!token || !token.includes(".")) return null;
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function getOAuthFlow() {
  if (process.env.LINKEDIN_OAUTH_FLOW) {
    return process.env.LINKEDIN_OAUTH_FLOW;
  }
  if (process.env.LINKEDIN_USE_PKCE === "true") {
    return "local-pkce";
  }
  if (process.env.LINKEDIN_USE_PKCE === "false") {
    return "web";
  }
  return "local-pkce";
}

export function isPkceFlow() {
  return getOAuthFlow() === "local-pkce";
}

export function buildAuthorizationUrl({ state, codeVerifier, redirectUri }) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requiredEnv("LINKEDIN_CLIENT_ID"),
    redirect_uri: redirectUri,
    state,
    scope: process.env.LINKEDIN_SCOPES || "openid profile email"
  });

  if (isPkceFlow()) {
    params.set("code_challenge", base64UrlSha256(codeVerifier));
    params.set("code_challenge_method", "S256");
    return `${NATIVE_PKCE_AUTH_URL}?${params.toString()}`;
  }

  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken({ code, codeVerifier, usePkce, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: requiredEnv("LINKEDIN_CLIENT_ID")
  });

  if (usePkce) {
    body.set("code_verifier", codeVerifier);
  } else if (process.env.LINKEDIN_CLIENT_SECRET) {
    body.set("client_secret", process.env.LINKEDIN_CLIENT_SECRET);
  } else {
    throw new Error("LINKEDIN_CLIENT_SECRET is required when LINKEDIN_USE_PKCE is false");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "LinkedIn token exchange failed");
  }
  return payload;
}

export async function fetchLinkedInProfile(tokens) {
  const response = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` }
  });
  const userinfo = await response.json().catch(() => ({}));
  const idToken = decodeJwtPayload(tokens.id_token);
  const profile = response.ok ? userinfo : idToken;

  if (!profile) {
    throw new Error(userinfo.message || "LinkedIn profile lookup failed");
  }

  return {
    provider: "linkedin",
    id: profile.sub,
    name: profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" "),
    email: profile.email,
    headline: profile.localizedHeadline || profile.headline || "LinkedIn member",
    picture: profile.picture || "",
    location: profile.locale?.country || "",
    skills: []
  };
}
