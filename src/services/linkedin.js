import crypto from "node:crypto";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const NATIVE_PKCE_AUTH_URL = "https://www.linkedin.com/oauth/native-pkce/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const PROFILE_URL = "https://api.linkedin.com/v2/me";
const EMAIL_URL = "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))";

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
  return "web";
}

export function isPkceFlow() {
  return getOAuthFlow() === "local-pkce";
}

export function getLinkedInAuthType() {
  const configured = process.env.LINKEDIN_AUTH_TYPE;
  if (configured === "oidc" || configured === "legacy") {
    return configured;
  }

  const scopes = (process.env.LINKEDIN_SCOPES || "").split(/\s+/).filter(Boolean);
  if (scopes.some((scope) => ["openid", "profile", "email"].includes(scope))) {
    return "oidc";
  }
  return "legacy";
}

export function getLinkedInScopes() {
  const configured = process.env.LINKEDIN_SCOPES;
  if (!isPkceFlow()) {
    const authType = getLinkedInAuthType();
    if (!configured) {
      return authType === "oidc" ? "openid profile email" : "r_liteprofile r_emailaddress";
    }
    const scopes = configured.split(/\s+/).filter(Boolean);
    const hasLegacyScope = scopes.some((scope) => ["r_liteprofile", "r_emailaddress"].includes(scope));
    const hasOpenIdScope = scopes.some((scope) => ["openid", "profile", "email"].includes(scope));
    if (authType === "oidc") {
      return hasLegacyScope ? "openid profile email" : scopes.join(" ");
    }
    return hasOpenIdScope ? "r_liteprofile r_emailaddress" : scopes.join(" ");
  }

  if (!configured) {
    return "r_liteprofile r_emailaddress";
  }

  const scopes = configured.split(/\s+/).filter(Boolean);
  const hasOpenIdScope = scopes.some((scope) => ["openid", "profile", "email"].includes(scope));
  return hasOpenIdScope ? "r_liteprofile r_emailaddress" : scopes.join(" ");
}

export function buildAuthorizationUrl({ state, codeVerifier, redirectUri }) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requiredEnv("LINKEDIN_CLIENT_ID"),
    redirect_uri: redirectUri,
    state,
    scope: getLinkedInScopes()
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

function localizedName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.localized) {
    return Object.values(value.localized)[0] || "";
  }
  return "";
}

function profilePictureUrl(profile) {
  const elements = profile.profilePicture?.["displayImage~"]?.elements || [];
  const largest = elements.at(-1);
  return largest?.identifiers?.[0]?.identifier || "";
}

async function fetchLegacyProfile(tokens) {
  const profileResponse = await fetch(PROFILE_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` }
  });
  const profile = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok) {
    throw new Error(profile.message || profile.serviceErrorCode || "LinkedIn profile lookup failed");
  }

  let email = "";
  if (getLinkedInScopes().split(/\s+/).includes("r_emailaddress")) {
    const emailResponse = await fetch(EMAIL_URL, {
      headers: { authorization: `Bearer ${tokens.access_token}` }
    });
    const emailPayload = await emailResponse.json().catch(() => ({}));
    email = emailResponse.ok ? emailPayload.elements?.[0]?.["handle~"]?.emailAddress || "" : "";
  }

  const firstName = profile.localizedFirstName || localizedName(profile.firstName);
  const lastName = profile.localizedLastName || localizedName(profile.lastName);
  return {
    provider: "linkedin",
    id: profile.id,
    name: [firstName, lastName].filter(Boolean).join(" ") || "LinkedIn member",
    email,
    headline: profile.localizedHeadline || profile.headline || "LinkedIn member",
    picture: profilePictureUrl(profile),
    location: "",
    skills: []
  };
}

export async function fetchLinkedInProfile(tokens) {
  if (isPkceFlow() || getLinkedInAuthType() === "legacy") {
    return fetchLegacyProfile(tokens);
  }

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
