const profileBlock = document.querySelector("#profileBlock");
const statusBadge = document.querySelector("#statusBadge");
const opportunityList = document.querySelector("#opportunityList");
const generateButton = document.querySelector("#generateButton");
const logoutButton = document.querySelector("#logoutButton");
const connectLinkedInButton = document.querySelector("#connectLinkedInButton");
const configMessage = document.querySelector("#configMessage");
const countMetric = document.querySelector("#countMetric");
const firstMetric = document.querySelector("#firstMetric");
const secondMetric = document.querySelector("#secondMetric");
const thirdMetric = document.querySelector("#thirdMetric");

let connectorHealth = null;

function linesFrom(elementId) {
  return document.querySelector(elementId).value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

function renderProfile(profile, authenticated) {
  profileBlock.innerHTML = `
    <strong>${escapeHtml(profile.name || "Demo member")}</strong>
    <span>${escapeHtml(profile.headline || "No headline available")}</span>
    <span>${escapeHtml(profile.email || "No email connected")}</span>
    <span>${authenticated ? "LinkedIn connected" : "Demo profile active"}</span>
  `;
}

function renderMetrics(opportunities) {
  const contacts = opportunities.flatMap((job) => job.keyContacts || []);
  countMetric.textContent = String(opportunities.length);
  firstMetric.textContent = String(contacts.filter((contact) => contact.degree === "1st").length);
  secondMetric.textContent = String(contacts.filter((contact) => contact.degree === "2nd").length);
  thirdMetric.textContent = String(contacts.filter((contact) => contact.degree === "3rd").length);
}

function renderOpportunities(opportunities) {
  renderMetrics(opportunities);
  opportunityList.innerHTML = opportunities.map((job) => `
    <article class="job-card">
      <div class="job-main">
        <div class="job-title">
          <h3>${escapeHtml(job.title)}</h3>
          <span class="score">${escapeHtml(job.fitScore)}% fit</span>
        </div>
        <p class="job-meta">${escapeHtml(job.company)} · ${escapeHtml(job.location)} · ${escapeHtml(job.workplace)} · ${escapeHtml(job.salaryRange)} · ${escapeHtml(job.posted)}</p>
        <p class="job-meta">${escapeHtml(job.summary)}</p>
        <div class="tags">${(job.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
      <div class="contacts">
        ${(job.keyContacts || []).slice(0, 3).map((contact) => `
          <div class="contact">
            <strong>${escapeHtml(contact.name)} <span class="degree">${escapeHtml(contact.degree)}</span></strong>
            <span class="contact-meta">${escapeHtml(contact.title)} · ${escapeHtml(contact.type)}</span>
            <span class="path">${escapeHtml((contact.connectionPath || []).join(" -> "))}</span>
          </div>
        `).join("")}
      </div>
    </article>
  `).join("");
}

async function loadProfile() {
  const payload = await api("/api/profile");
  renderProfile(payload.profile, payload.authenticated);
}

async function loadHealth() {
  connectorHealth = await api("/api/health");
  if (connectorHealth.linkedInConfigured) {
    connectLinkedInButton.classList.remove("disabled");
    connectLinkedInButton.setAttribute("href", "/auth/linkedin/start");
    connectLinkedInButton.setAttribute("aria-disabled", "false");
    configMessage.textContent = `LinkedIn callback: ${connectorHealth.linkedInRedirectUri}`;
    return;
  }

  connectLinkedInButton.classList.add("disabled");
  connectLinkedInButton.setAttribute("href", "#");
  connectLinkedInButton.setAttribute("aria-disabled", "true");
  configMessage.textContent = "LinkedIn sign-in needs LINKEDIN_CLIENT_ID in .env. Demo mode is active.";
}

async function generateOpportunities() {
  statusBadge.textContent = "Generating";
  generateButton.disabled = true;
  try {
    const payload = await api("/api/opportunities", {
      method: "POST",
      body: JSON.stringify({
        targetTitles: linesFrom("#titlesInput"),
        locations: linesFrom("#locationsInput"),
        industries: linesFrom("#industriesInput"),
        maxResults: document.querySelector("#maxResultsInput").value
      })
    });
    renderProfile(payload.profile, payload.profile.provider === "linkedin");
    renderOpportunities(payload.opportunities);
    statusBadge.textContent = `${payload.opportunities.length} ready`;
  } catch (error) {
    statusBadge.textContent = error.message;
  } finally {
    generateButton.disabled = false;
  }
}

generateButton.addEventListener("click", generateOpportunities);
logoutButton.addEventListener("click", async () => {
  statusBadge.textContent = "Resetting";
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
    await loadProfile();
    await generateOpportunities();
  } catch (error) {
    statusBadge.textContent = error.message;
  }
});
connectLinkedInButton.addEventListener("click", (event) => {
  if (!connectorHealth?.linkedInConfigured) {
    event.preventDefault();
    statusBadge.textContent = "LinkedIn config needed";
    configMessage.textContent = "Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env, then restart npm start.";
  }
});

const authError = new URLSearchParams(window.location.search).get("authError");
if (authError) {
  statusBadge.textContent = `Auth issue: ${authError}`;
}

await loadHealth();
await loadProfile();
await generateOpportunities();
