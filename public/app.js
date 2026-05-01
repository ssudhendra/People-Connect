const profileBlock = document.querySelector("#profileBlock");
const statusBadge = document.querySelector("#statusBadge");
const opportunityList = document.querySelector("#opportunityList");
const connectionsList = document.querySelector("#connectionsList");
const setupPanel = document.querySelector("#setupPanel");
const generateButton = document.querySelector("#generateButton");
const resetSearchButton = document.querySelector("#resetSearchButton");
const logoutButton = document.querySelector("#logoutButton");
const connectLinkedInButton = document.querySelector("#connectLinkedInButton");
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
const jobSearchInput = document.querySelector("#jobSearchInput");
const jobLocationInput = document.querySelector("#jobLocationInput");
const datePostedSelect = document.querySelector("#datePostedSelect");
const experienceSelect = document.querySelector("#experienceSelect");
const workplaceSelect = document.querySelector("#workplaceSelect");
const jobTypeSelect = document.querySelector("#jobTypeSelect");
const companyFilterInput = document.querySelector("#companyFilterInput");
const sortSelect = document.querySelector("#sortSelect");
const maxResultsInput = document.querySelector("#maxResultsInput");

let connectorHealth = null;
let allOpportunities = [];
let visibleOpportunities = [];
let currentJobSourceStatus = null;

const defaultSearchState = {
  title: "AI Product Manager",
  location: "Remote",
  industries: ["AI", "SaaS", "Developer Tools"],
  datePosted: "any",
  experienceLevel: "any",
  workplace: "any",
  jobType: "any",
  company: "",
  sort: "relevance",
  maxResults: "75"
};

const searchOptionGroups = [
  {
    container: titleOptions,
    input: jobSearchInput,
    mode: "single",
    values: [
      "AI Product Manager",
      "Platform Product Manager",
      "Senior Product Manager",
      "Product Lead, Recruiting Intelligence",
      "Group Product Manager, Developer Experience",
      "Principal Product Manager, Data Products",
      "Recruiter",
      "Hiring Manager"
    ]
  },
  {
    container: locationOptions,
    input: jobLocationInput,
    mode: "single",
    values: ["Remote", "Chicago", "New York", "San Francisco", "Seattle", "Boston"]
  },
  {
    container: industryOptions,
    input: null,
    mode: "multi",
    selected: new Set(defaultSearchState.industries),
    values: ["AI", "SaaS", "Developer Tools", "Marketplaces", "Fintech", "Enterprise Software"]
  }
];

function currentGroupValues(group) {
  if (group.mode === "multi") {
    return [...group.selected];
  }
  return group.input.value.trim() ? [group.input.value.trim()] : [];
}

function syncOptionGroup(group) {
  const selected = new Set(currentGroupValues(group));
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
      if (group.mode === "multi") {
        if (group.selected.has(button.dataset.value)) {
          group.selected.delete(button.dataset.value);
        } else {
          group.selected.add(button.dataset.value);
        }
      } else {
        group.input.value = button.dataset.value;
      }
      syncOptionGroup(group);
    });
    if (group.input) {
      group.input.addEventListener("input", () => syncOptionGroup(group));
    }
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
  const connectionState = profile.provider === "linkedin"
    ? "LinkedIn connected"
    : profile.provider === "local" && authenticated
      ? "Local login active"
      : "Demo profile active";
  profileBlock.innerHTML = `
    <strong>${escapeHtml(profile.name || "Demo member")}</strong>
    <span>${escapeHtml(profile.headline || "No headline available")}</span>
    <span>${escapeHtml(profile.email || "No email connected")}</span>
    <span>${connectionState}</span>
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

function postedDays(job) {
  const raw = String(job.posted || "").trim();
  if (/today|just|hour|minute/i.test(raw)) return 0;
  if (/yesterday/i.test(raw)) return 1;
  const parsedDate = Date.parse(raw);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, Math.floor((Date.now() - parsedDate) / 86_400_000));
  }
  const match = raw.match(/(\d+)/);
  return match ? Number(match[1]) : 999;
}

function applyFilters() {
  const keyword = keywordFilter.value.trim().toLowerCase();
  const minFit = Number(minFitFilter.value || 0);
  const degree = degreeFilter.value;
  visibleOpportunities = allOpportunities
    .filter((job) => job.fitScore >= minFit && jobMatchesKeyword(job, keyword) && jobMatchesDegree(job, degree))
    .sort((a, b) => {
      if (sortSelect.value === "recent") return postedDays(a) - postedDays(b);
      if (sortSelect.value === "network") return b.networkStrength - a.networkStrength;
      return b.fitScore - a.fitScore || b.networkStrength - a.networkStrength;
    });
  renderOpportunities(visibleOpportunities);
  renderConnections(visibleOpportunities);
  const source = currentJobSourceStatus?.mode === "live-provider" ? currentJobSourceStatus.providerName : "Demo data";
  statusBadge.textContent = `${visibleOpportunities.length} shown · ${source}`;
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
        <p class="job-meta">${escapeHtml(job.source || "Demo provider")}${job.applicants ? ` · ${escapeHtml(job.applicants)} applicants` : ""}</p>
        <p class="job-meta">${escapeHtml(job.summary)}</p>
        <div class="job-badges">
          <span class="job-badge">${escapeHtml(job.experienceLevel || "Mid-Senior level")}</span>
          <span class="job-badge">${escapeHtml(job.jobType || "Full-time")}</span>
          <span class="job-badge">${escapeHtml(job.applyMethod || "Apply")}</span>
        </div>
        ${job.jobUrl ? `<a class="job-link" href="${escapeHtml(job.jobUrl)}" target="_blank" rel="noreferrer">View job</a>` : ""}
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
  const jobSourceStatus = connectorHealth.jobSourceStatus || {};
  setupPanel.innerHTML = [
    setupItem("Active LinkedIn redirect URI", connectorHealth.linkedInRedirectUri),
    setupItem("LinkedIn auth type", connectorHealth.linkedInAuthType),
    setupItem("OAuth flow", connectorHealth.linkedInOAuthFlow),
    setupItem("OAuth scopes", connectorHealth.linkedInScopes),
    setupItem("Job source mode", jobSourceStatus.mode || "demo"),
    setupItem("Job source provider", jobSourceStatus.providerName || "Demo provider"),
    setupItem("Exact live jobs required", jobSourceStatus.exactRequired ? "true" : "false"),
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
    connectLinkedInButton.setAttribute("href", "/auth/linkedin/start?authType=oidc");
    connectLinkedInButton.setAttribute("aria-disabled", "false");
    configMessage.textContent = "LinkedIn sign-in is ready.";
    return;
  }

  connectLinkedInButton.classList.add("disabled");
  connectLinkedInButton.setAttribute("href", "#");
  connectLinkedInButton.setAttribute("aria-disabled", "true");
  configMessage.textContent = "LinkedIn sign-in needs LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env.";
}

async function generateOpportunities() {
  statusBadge.textContent = "Generating";
  generateButton.disabled = true;
  try {
    searchOptionGroups.forEach(syncOptionGroup);
    const selectedIndustries = currentGroupValues(searchOptionGroups[2]);
    const payload = await api("/api/opportunities", {
      method: "POST",
      body: JSON.stringify({
        targetTitles: currentGroupValues(searchOptionGroups[0]),
        locations: currentGroupValues(searchOptionGroups[1]),
        industries: selectedIndustries.length ? selectedIndustries : ["AI", "SaaS", "Developer Tools"],
        datePosted: datePostedSelect.value,
        experienceLevel: experienceSelect.value,
        workplace: workplaceSelect.value,
        jobType: jobTypeSelect.value,
        company: companyFilterInput.value.trim(),
        sort: sortSelect.value,
        maxResults: maxResultsInput.value
      })
    });
    allOpportunities = payload.opportunities;
    currentJobSourceStatus = payload.jobSourceStatus || connectorHealth?.jobSourceStatus || null;
    renderProfile(payload.profile, payload.profile.provider !== "demo");
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

function resetResultFilters() {
  keywordFilter.value = "";
  minFitFilter.value = "0";
  minFitValue.textContent = "0%";
  degreeFilter.value = "all";
}

async function resetSearch() {
  statusBadge.textContent = "Resetting search";
  resetSearchButton.disabled = true;
  try {
    jobSearchInput.value = defaultSearchState.title;
    jobLocationInput.value = defaultSearchState.location;
    searchOptionGroups[2].selected = new Set(defaultSearchState.industries);
    datePostedSelect.value = defaultSearchState.datePosted;
    experienceSelect.value = defaultSearchState.experienceLevel;
    workplaceSelect.value = defaultSearchState.workplace;
    jobTypeSelect.value = defaultSearchState.jobType;
    companyFilterInput.value = defaultSearchState.company;
    sortSelect.value = defaultSearchState.sort;
    maxResultsInput.value = defaultSearchState.maxResults;
    resetResultFilters();
    searchOptionGroups.forEach(syncOptionGroup);
    await generateOpportunities();
  } catch (error) {
    statusBadge.textContent = error.message;
  } finally {
    resetSearchButton.disabled = false;
  }
}

generateButton.addEventListener("click", generateOpportunities);
resetSearchButton.addEventListener("click", resetSearch);
applyFiltersButton.addEventListener("click", applyFilters);
clearFiltersButton.addEventListener("click", () => {
  resetResultFilters();
  applyFilters();
});
minFitFilter.addEventListener("input", () => {
  minFitValue.textContent = `${minFitFilter.value}%`;
});
keywordFilter.addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyFilters();
});
degreeFilter.addEventListener("change", applyFilters);
sortSelect.addEventListener("change", applyFilters);

logoutButton.addEventListener("click", async () => {
  statusBadge.textContent = "Logging out";
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
    resetResultFilters();
    await loadProfile();
    await generateOpportunities();
    statusBadge.textContent = "Logged out";
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
