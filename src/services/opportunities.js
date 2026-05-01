import { demoConnections, demoContacts } from "../data/demo-network.js";
import { generateDemoJobs } from "../data/demo-jobs.js";

const defaultCriteria = {
  targetTitles: ["Product Manager", "AI Product Manager", "Platform Product Manager"],
  locations: ["Chicago", "Remote", "New York", "San Francisco"],
  industries: ["AI", "SaaS", "Developer Tools", "Marketplaces"],
  datePosted: "any",
  experienceLevel: "any",
  workplace: "any",
  jobType: "any",
  company: "",
  sort: "relevance",
  maxResults: 75,
  remotePreference: "hybrid"
};

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

export function getJobSourceStatus() {
  const configured = Boolean(process.env.JOB_SOURCE_API_URL);
  const liveMode = process.env.CONNECTOR_MODE === "live";
  const exactRequired = enabled(process.env.REQUIRE_LIVE_JOB_SOURCE);
  return {
    configured,
    liveMode,
    exactRequired,
    providerName: process.env.JOB_SOURCE_PROVIDER_NAME || (configured ? "Configured jobs provider" : "Demo provider"),
    mode: liveMode && configured ? "live-provider" : "demo"
  };
}

function clampResultCount(value) {
  const parsed = Number(value || defaultCriteria.maxResults);
  if (Number.isNaN(parsed)) return defaultCriteria.maxResults;
  return Math.min(100, Math.max(50, parsed));
}

function normalizeCriteria(payload = {}) {
  return {
    targetTitles: payload.targetTitles?.length ? payload.targetTitles : defaultCriteria.targetTitles,
    locations: payload.locations?.length ? payload.locations : defaultCriteria.locations,
    industries: payload.industries?.length ? payload.industries : defaultCriteria.industries,
    datePosted: payload.datePosted || defaultCriteria.datePosted,
    experienceLevel: payload.experienceLevel || defaultCriteria.experienceLevel,
    workplace: payload.workplace || payload.remotePreference || defaultCriteria.workplace,
    jobType: payload.jobType || defaultCriteria.jobType,
    company: payload.company || defaultCriteria.company,
    sort: payload.sort || defaultCriteria.sort,
    remotePreference: payload.remotePreference || payload.workplace || defaultCriteria.remotePreference,
    maxResults: clampResultCount(payload.maxResults)
  };
}

function scoreJob(job, profile, criteria) {
  const tags = Array.isArray(job.tags) ? job.tags : [];
  const text = `${job.title || ""} ${job.company || ""} ${job.industry || ""} ${tags.join(" ")} ${profile.headline || ""}`.toLowerCase();
  const titleHits = criteria.targetTitles.filter((title) => text.includes(title.toLowerCase().split(" ")[0])).length;
  const industryHits = criteria.industries.filter((industry) => text.includes(industry.toLowerCase())).length;
  const locationHits = criteria.locations.some((location) => job.location.toLowerCase().includes(location.toLowerCase())) ? 1 : 0;
  const skillHits = (profile.skills || []).filter((skill) => text.includes(skill.toLowerCase().split(" ")[0])).length;
  return Math.min(98, 58 + titleHits * 7 + industryHits * 8 + locationHits * 6 + skillHits * 3 + (job.priority || 0));
}

function degreeRank(degree) {
  return { "1st": 1, "2nd": 2, "3rd": 3 }[degree] || 4;
}

function connectionPathFor(contact, orgConnections) {
  if (contact.degree === "1st") {
    return [`You`, contact.name];
  }
  const bridge = orgConnections.find((connection) => connection.degree === "1st") || demoConnections[0];
  if (contact.degree === "2nd") {
    return [`You`, bridge.name, contact.name];
  }
  const secondDegree = orgConnections.find((connection) => connection.degree === "2nd") || demoConnections[1];
  return [`You`, bridge.name, secondDegree.name, contact.name];
}

function enrichJob(job, profile) {
  const normalizedJob = {
    tags: [],
    priority: 0,
    workplace: "Hybrid",
    salaryRange: "Not listed",
    posted: "Recently posted",
    applicants: null,
    applyMethod: "Apply",
    jobUrl: "",
    summary: "Role details are available from the configured job provider.",
    ...job
  };
  const orgConnections = demoConnections.filter((connection) => connection.company === normalizedJob.company);
  const relatedContacts = demoContacts
    .filter((contact) => contact.company === normalizedJob.company || contact.industry === normalizedJob.industry)
    .slice(0, 4)
    .map((contact) => ({
      ...contact,
      connectionPath: connectionPathFor(contact, orgConnections)
    }))
    .sort((a, b) => degreeRank(a.degree) - degreeRank(b.degree));

  const networkStrength = orgConnections.reduce((sum, connection) => sum + (4 - degreeRank(connection.degree)), 0);
  return {
    ...normalizedJob,
    fitScore: scoreJob(job, profile, normalizeCriteria()),
    networkStrength,
    existingConnections: orgConnections,
    keyContacts: relatedContacts
  };
}

function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
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

function datePostedLimit(value) {
  return {
    "past-24h": 1,
    "past-week": 7,
    "past-month": 30
  }[value] || null;
}

function matchesCriteria(job, criteria) {
  const companyFilter = normalized(criteria.company);
  if (companyFilter && !normalized(job.company).includes(companyFilter)) return false;

  if (criteria.workplace !== "any" && normalized(job.workplace) !== normalized(criteria.workplace)) return false;
  if (criteria.jobType !== "any" && normalized(job.jobType) !== normalized(criteria.jobType)) return false;
  if (criteria.experienceLevel !== "any" && !normalized(job.experienceLevel).includes(normalized(criteria.experienceLevel))) return false;

  const limit = datePostedLimit(criteria.datePosted);
  if (limit && postedDays(job) > limit) return false;

  return true;
}

function sortJobs(a, b, criteria) {
  if (criteria.sort === "recent") return postedDays(a) - postedDays(b) || b.fitScore - a.fitScore;
  if (criteria.sort === "network") return b.networkStrength - a.networkStrength || b.fitScore - a.fitScore;
  return b.fitScore - a.fitScore || b.networkStrength - a.networkStrength;
}

function buildProviderPayload(criteria, profile) {
  return {
    source: "linkedin-jobs-search",
    keywords: criteria.targetTitles.join(" OR "),
    location: criteria.locations.join(" OR "),
    filters: {
      industries: criteria.industries,
      datePosted: criteria.datePosted,
      experienceLevel: criteria.experienceLevel,
      workplace: criteria.workplace,
      jobType: criteria.jobType,
      company: criteria.company,
      sort: criteria.sort,
      maxResults: criteria.maxResults
    },
    profile: {
      name: profile.name,
      headline: profile.headline,
      skills: profile.skills || []
    }
  };
}

function jobSourceHeaders() {
  const headers = { "content-type": "application/json" };
  if (process.env.JOB_SOURCE_API_KEY) {
    headers[process.env.JOB_SOURCE_AUTH_HEADER || "authorization"] = `Bearer ${process.env.JOB_SOURCE_API_KEY}`;
  }
  return headers;
}

function normalizeProviderJobs(payload) {
  const jobs = Array.isArray(payload) ? payload : payload.jobs || payload.results || payload.elements;
  if (!Array.isArray(jobs)) {
    throw new Error("Job source response must be an array or include jobs/results/elements.");
  }
  return jobs;
}

async function fetchExternalJobs(criteria, profile) {
  const sourceStatus = getJobSourceStatus();
  if (!sourceStatus.configured) {
    if (sourceStatus.exactRequired) {
      throw new Error("Exact LinkedIn Jobs data requires JOB_SOURCE_API_URL from an approved LinkedIn Jobs/Talent provider.");
    }
    return null;
  }
  if (!sourceStatus.liveMode) return null;

  const response = await fetch(process.env.JOB_SOURCE_API_URL, {
    method: "POST",
    headers: jobSourceHeaders(),
    body: JSON.stringify(buildProviderPayload(criteria, profile))
  });
  if (!response.ok) {
    throw new Error(`Job source failed with ${response.status}`);
  }
  const payload = await response.json();
  return normalizeProviderJobs(payload).map((job) => ({
    source: sourceStatus.providerName,
    ...job
  }));
}

export async function createOpportunities(profile, payload = {}) {
  const criteria = normalizeCriteria(payload);
  const externalJobs = await fetchExternalJobs(criteria, profile);
  const jobs = externalJobs || generateDemoJobs(criteria);

  return jobs
    .map((job) => ({
      ...enrichJob(job, profile),
      fitScore: scoreJob(job, profile, criteria)
    }))
    .filter((job) => matchesCriteria(job, criteria))
    .sort((a, b) => sortJobs(a, b, criteria))
    .slice(0, criteria.maxResults);
}
