import { demoConnections, demoContacts } from "../data/demo-network.js";
import { generateDemoJobs } from "../data/demo-jobs.js";

const defaultCriteria = {
  targetTitles: ["Product Manager", "AI Product Manager", "Platform Product Manager"],
  locations: ["Chicago", "Remote", "New York", "San Francisco"],
  industries: ["AI", "SaaS", "Developer Tools", "Marketplaces"],
  maxResults: 75,
  remotePreference: "hybrid"
};

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
    remotePreference: payload.remotePreference || defaultCriteria.remotePreference,
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

async function fetchExternalJobs(criteria) {
  if (!process.env.JOB_SOURCE_API_URL) return null;
  const response = await fetch(process.env.JOB_SOURCE_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(criteria)
  });
  if (!response.ok) {
    throw new Error(`Job source failed with ${response.status}`);
  }
  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.jobs;
}

export async function createOpportunities(profile, payload = {}) {
  const criteria = normalizeCriteria(payload);
  const externalJobs = await fetchExternalJobs(criteria);
  const jobs = externalJobs || generateDemoJobs(criteria);

  return jobs
    .map((job) => ({
      ...enrichJob(job, profile),
      fitScore: scoreJob(job, profile, criteria)
    }))
    .sort((a, b) => b.fitScore - a.fitScore || b.networkStrength - a.networkStrength)
    .slice(0, criteria.maxResults);
}
