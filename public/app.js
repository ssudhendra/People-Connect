const profileBlock = document.querySelector("#profileBlock");
const statusBadge = document.querySelector("#statusBadge");
const opportunityList = document.querySelector("#opportunityList");
const connectionsList = document.querySelector("#connectionsList");
const setupPanel = document.querySelector("#setupPanel");
const generateButton = document.querySelector("#generateButton");
const logoutButton = document.querySelector("#logoutButton");
const connectLinkedInButton = document.querySelector("#connectLinkedInButton");
const connectLegacyButton = document.querySelector("#connectLegacyButton");
const localLoginButton = document.querySelector("#localLoginButton");
const configMessage = document.querySelector("#configMessage");
const countMetric = document.querySelector("#countMetric");
const firstMetric = document.querySelector("#firstMetric");
const secondMetric = document.querySelector("#secondMetric");
const thirdMetric = document.querySelector("#thirdMetric");
const keywordFilter = document.querySelector("#keywordFilter");
const minFitFilter = document.querySelector("#minFitFilter");
const minFitValue = document.querySelector("#minFitValue");
const degreeFilter = document.querySelector("#degreeFilter");
const applyFiltersButton = document.querySelector("#applyFiltersButton");
const clearFiltersButton = document.querySelector("#clearFiltersButton");
const titleOptions = document.querySelector("#titleOptions");
const locationOptions = document.querySelector("#locationOptions");
const industryOptions = document.querySelector("#industryOptions");

let connectorHealth = null;
let allOpportunities = [];
let visibleOpportunities = [];

const searchOptionGroups = [
  {
    container: titleOptions,
    textarea: document.querySelector("#titlesInput"),
    values: [
      "AI Product Manager",
      "Platform Product Manager",
      "Senior Product Manager",
      "Product Lead, Recruiting Intelligence",
      "Group Product Manager, Developer Experience",
      "Principal Product Manager, Data Products"
    ]
  },
  {
    container: locationOptions,
    textarea: document.querySelector("#locationsInput"),
    values: ["Chicago", "Remote", "New York", "San Francisco", "Seattle", "Boston"]
  },
  {
    container: industryOptions,
    textarea: document.querySelector("#industriesInput"),
    values: ["AI", "SaaS", "Developer Tools", "Marketplaces", "Fintech", "Enterprise Software"]
  }
];

function linesFrom(elementId) {
  return document.querySelector(elementId).value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function valuesFromTextarea(textarea) {
  return textarea.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function writeTextareaValues(textarea, values) {
  textarea.value = values.join("\n");
}

function syncOptionGroup(group) {
  const selected = new Set(valuesFromTextarea(group.textarea));
  group.container.querySelectorAll(".option-chip").forEach((button) => {
    button.classList.toggle("active", selected.has(button.dataset.value));
    button.setAttribute("aria-pressed", selected.has(button.dataset.value) ? "true" : "false");
  });
}

function renderSearchOptions() {
  for (const group of searchOptionGroups) {
    group.container.innerHTML = group.values.map((value) => `
      <button class="option-chip" type="button" data-value="${escapeHtml(value)}" aria-pressed="false">${escapeHtml(value)}</button>
    `).join("");
    group.container.addEventListener("click", (event) => {
      const button = event.target.closest(".option-chip");
      if (!button) return;
      const values = valuesFromTextarea(group.textarea);
      const selected = new Set(values);
      if (selected.has(button.dataset.value)) {
        selected.delete(button.dataset.value);
      } else {
        selected.add(button.dataset.value);
      }
      writeTextareaValues(group.textarea, [...selected]);
      syncOptionGroup(group);
    });
    group.textarea.addEventListener("input", () => syncOptionGroup(group));
    syncOptionGroup(group);
  }
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

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
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

function jobMatchesKeyword(job, keyword) {
  if (!keyword) return true;
  const text = [
    job.title,
    job.company,
    job.industry,
    job.location,
    job.summary,
    ...(job.tags || []),
    ...(job.keyContacts || []).flatMap((contact) => [contact.name, contact.title, contact.type])
  ].join(" ").toLowerCase();
  return text.includes(keyword);
}

function jobMatchesDegree(job, degree) {
  if (degree === "all") return true;
  return (job.keyContacts || []).some((contact) => contact.degree === degree);
}

function applyFilters() {
  const keyword = keywordFilter.value.trim().toLowerCase();
  const minFit = Number(minFitFilter.value || 0);
  const degree = degreeFilter.value;
  visibleOpportunities = allOpportunities.filter((job) => {
    return job.fitScore >= minFit && jobMatchesKeyword(job, keyword) && jobMatchesDegree(job, degree);
  });
  renderOpportunities(visibleOpportunities);
  renderConnections(visibleOpportunities);
  statusBadge.textContent = `${visibleOpportunities.length} shown`;
}

function renderOpportunities(opportunities) {
  renderMetrics(opportunities);
  if (!opportunities.length) {
    opportunityList.innerHTML = `<div class="empty-state">No opportunities match the current filters.</div>`;
    return;
  }
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

function renderConnections(opportunities) {
  const contacts = new Map();
  for (const job of opportunities) {
    for (const contact of job.keyContacts || []) {
      const key = `${contact.name}-${contact.company}-${contact.degree}`;
      const existing = contacts.get(key);
      const roles = existing?.roles || [];
      roles.push(`${job.title} at ${job.company}`);
      contacts.set(key, { ...contact, roles });
    }
  }

  const values = [...contacts.values()];
  if (!values.length) {
    connectionsList.innerHTML = `<div class="empty-state">No contacts match the current filters.</div>`;
    return;
  }

  connectionsList.innerHTML = values.map((contact) => `
    <article class="connection-card">
      <strong>${escapeHtml(contact.name)} <span class="degree">${escapeHtml(contact.degree)}</span></strong>
      <span class="contact-meta">${escapeHtml(contact.title)} · ${escapeHtml(contact.company)} · ${escapeHtml(contact.type)}</span>
      <span class="path">${escapeHtml((contact.connectionPath || []).join(" -> "))}</span>
      <span class="job-meta">${escapeHtml(contact.roles.slice(0, 3).join("; "))}</span>
    </article>
  `).join("");
}

function setupItem(title, value) {
  return `
    <article class="setup-item">
      <strong>${escapeHtml(title)}</strong>
      <code>${escapeHtml(value)}</code>
      <div class="setup-actions">
        <button class="small-button copy-button" type="button" data-copy="${escapeHtml(value)}">Copy</button>
      </div>
    </article>
  `;
}

function renderSetup() {
  if (!connectorHealth) {
    setupPanel.innerHTML = `<div class="empty-state">Loading connector setup.</div>`;
    return;
  }
  const localRedirects = connectorHealth.linkedInLocalRedirectUris || [];
  const authOptions = connectorHealth.linkedInAuthOptions || [];
  setupPanel.innerHTML = [
    setupItem("Active LinkedIn redirect URI", connectorHealth.linkedInRedirectUri),
    setupItem("LinkedIn auth type", connectorHealth.linkedInAuthType),
    setupItem("OAuth flow", connectorHealth.linkedInOAuthFlow),
    setupItem("OAuth scopes", connectorHealth.linkedInScopes),
    ...localRedirects.map((uri, index) => setupItem(`LinkedIn portal callback ${index + 1}`, uri)),
    ...authOptions.map((option) => setupItem(`LinkedIn ${option.authType} start URL`, option.startUrl))
  ].join("");
}

async function loadProfile() {
  const payload = await api("/api/profile");
  renderProfile(payload.profile, payload.authenticated);
}

async function loadHealth() {
  connectorHealth = await api("/api/health");
  renderSetup();
  if (connectorHealth.linkedInConfigured) {
    connectLinkedInButton.classList.remove("disabled");
    connectLegacyButton.classList.remove("disabled");
    connectLinkedInButton.setAttribute("href", "/auth/linkedin/start?authType=oidc");
    connectLegacyButton.setAttribute("href", "/auth/linkedin/start?authType=legacy");
    connectLinkedInButton.setAttribute("aria-disabled", "false");
    connectLegacyButton.setAttribute("aria-disabled", "false");
    configMessage.textContent = `LinkedIn callback: ${connectorHealth.linkedInRedirectUri}`;
    return;
  }

  connectLinkedInButton.classList.add("disabled");
  connectLegacyButton.classList.add("disabled");
  connectLinkedInButton.setAttribute("href", "#");
  connectLegacyButton.setAttribute("href", "#");
  connectLinkedInButton.setAttribute("aria-disabled", "true");
  connectLegacyButton.setAttribute("aria-disabled", "true");
  configMessage.textContent = "LinkedIn sign-in needs LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env. Demo mode is active.";
}

async function generateOpportunities() {
  statusBadge.textContent = "Generating";
  generateButton.disabled = true;
  try {
    searchOptionGroups.forEach(syncOptionGroup);
    const payload = await api("/api/opportunities", {
      method: "POST",
      body: JSON.stringify({
        targetTitles: linesFrom("#titlesInput"),
        locations: linesFrom("#locationsInput"),
        industries: linesFrom("#industriesInput"),
        maxResults: document.querySelector("#maxResultsInput").value
      })
    });
    allOpportunities = payload.opportunities;
    renderProfile(payload.profile, payload.profile.provider === "linkedin");
    applyFilters();
  } catch (error) {
    statusBadge.textContent = error.message;
  } finally {
    generateButton.disabled = false;
  }
}

function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  document.querySelectorAll(".tab-view").forEach((view) => {
    view.classList.toggle("active", view.id === `${name}View`);
  });
}

generateButton.addEventListener("click", generateOpportunities);
applyFiltersButton.addEventListener("click", applyFilters);
clearFiltersButton.addEventListener("click", () => {
  keywordFilter.value = "";
  minFitFilter.value = "0";
  minFitValue.textContent = "0%";
  degreeFilter.value = "all";
  applyFilters();
});
minFitFilter.addEventListener("input", () => {
  minFitValue.textContent = `${minFitFilter.value}%`;
});
keywordFilter.addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyFilters();
});
degreeFilter.addEventListener("change", applyFilters);

logoutButton.addEventListener("click", async () => {
  statusBadge.textContent = "Resetting";
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
    keywordFilter.value = "";
    minFitFilter.value = "0";
    minFitValue.textContent = "0%";
    degreeFilter.value = "all";
    await loadProfile();
    await generateOpportunities();
  } catch (error) {
    statusBadge.textContent = error.message;
  }
});

connectLinkedInButton.addEventListener("click", async (event) => {
  if (!connectorHealth?.linkedInConfigured) {
    event.preventDefault();
    statusBadge.textContent = "LinkedIn config needed";
    configMessage.textContent = "Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env, then restart npm start.";
  }
});
connectLegacyButton.addEventListener("click", async (event) => {
  if (!connectorHealth?.linkedInConfigured) {
    event.preventDefault();
    statusBadge.textContent = "LinkedIn config needed";
    configMessage.textContent = "Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env, then restart npm start.";
  }
});
localLoginButton.addEventListener("click", () => {
  statusBadge.textContent = "Signing in locally";
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
});

setupPanel.addEventListener("click", async (event) => {
  const button = event.target.closest(".copy-button");
  if (!button) return;
  await copyText(button.dataset.copy);
  statusBadge.textContent = "Copied";
});

const authError = new URLSearchParams(window.location.search).get("authError");
if (authError) {
  statusBadge.textContent = `Auth issue: ${authError}`;
}

await loadHealth();
await loadProfile();
renderSearchOptions();
await generateOpportunities();
