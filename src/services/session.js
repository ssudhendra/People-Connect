import crypto from "node:crypto";

const sessions = new Map();

const demoProfile = {
  provider: "demo",
  id: "demo-member",
  name: "Alex Morgan",
  email: "alex@example.com",
  headline: "Senior Product Manager focused on AI platforms",
  picture: "",
  location: "Chicago, IL",
  skills: ["AI platforms", "product strategy", "marketplaces", "developer tools"]
};

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("=") || "")];
  }).filter(([key]) => key));
}

function createSession() {
  return {
    id: crypto.randomBytes(24).toString("base64url"),
    profile: null,
    tokens: null,
    oauth: null,
    createdAt: Date.now()
  };
}

export function getSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  let session = cookies.pc_session ? sessions.get(cookies.pc_session) : null;
  if (!session) {
    session = createSession();
    sessions.set(session.id, session);
    res.setHeader("set-cookie", [
      `pc_session=${encodeURIComponent(session.id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
    ]);
  }
  return session;
}

export function requireSession(req, res) {
  return getSession(req, res);
}

export function getProfileForSession(session) {
  return session.profile || demoProfile;
}

export function signInWithDemoProfile(session) {
  session.profile = {
    ...demoProfile,
    provider: "local"
  };
  session.tokens = null;
  session.oauth = null;
  return session.profile;
}

export function logoutSession(session, res) {
  if (session?.id) {
    sessions.delete(session.id);
  }
  res.setHeader("set-cookie", [
    "pc_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
  ]);
}
