const companies = [
  ["Microsoft", "AI", "Redmond, WA"],
  ["Google", "AI", "Mountain View, CA"],
  ["ServiceNow", "SaaS", "Remote"],
  ["Salesforce", "SaaS", "Chicago, IL"],
  ["Stripe", "Fintech", "Remote"],
  ["Atlassian", "Developer Tools", "Remote"],
  ["Datadog", "Developer Tools", "New York, NY"],
  ["Workday", "Enterprise Software", "Pleasanton, CA"],
  ["LinkedIn", "Marketplaces", "Sunnyvale, CA"],
  ["Adobe", "Creative Software", "San Jose, CA"],
  ["HubSpot", "SaaS", "Boston, MA"],
  ["Shopify", "Marketplaces", "Remote"]
];

const titlePool = [
  "Senior Product Manager, AI Platform",
  "Product Manager, Marketplace Growth",
  "Group Product Manager, Developer Experience",
  "Principal Product Manager, Data Products",
  "Product Lead, Recruiting Intelligence",
  "AI Product Manager, Workflow Automation",
  "Platform Product Manager, Integrations",
  "Senior Product Manager, Enterprise Search"
];

const tags = [
  ["AI platforms", "roadmap", "enterprise"],
  ["marketplaces", "experimentation", "growth"],
  ["developer tools", "APIs", "partners"],
  ["data products", "analytics", "privacy"],
  ["recruiting", "matching", "talent"],
  ["automation", "LLMs", "workflow"]
];

const experienceLevels = ["Associate", "Mid-Senior level", "Director", "Executive"];
const jobTypes = ["Full-time", "Contract", "Part-time"];
const applyMethods = ["Easy Apply", "Apply"];
const workplaceModes = ["Remote", "Hybrid", "On-site"];

function formatWorkplace(location, criteria, index) {
  if (criteria.workplace && criteria.workplace !== "any") {
    return { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }[criteria.workplace] || criteria.workplace;
  }
  if (location.toLowerCase().includes("remote")) return "Remote";
  return workplaceModes[index % workplaceModes.length];
}

export function generateDemoJobs(criteria) {
  const jobs = [];
  const configuredCount = Number(process.env.DEMO_JOB_COUNT || 240);
  const count = Number.isNaN(configuredCount) ? 240 : Math.max(120, configuredCount);
  for (let index = 0; index < count; index += 1) {
    const company = companies[index % companies.length];
    const title = criteria.targetTitles[index % criteria.targetTitles.length] || titlePool[index % titlePool.length];
    const fallbackTitle = titlePool[index % titlePool.length];
    const location = criteria.locations[index % criteria.locations.length] || company[2];
    const tagSet = tags[index % tags.length];
    const salaryLow = 145 + (index % 8) * 10;
    const salaryHigh = salaryLow + 45 + (index % 5) * 8;
    jobs.push({
      id: `demo-job-${index + 1}`,
      title: index % 3 === 0 ? fallbackTitle : title,
      company: company[0],
      industry: company[1],
      location,
      workplace: formatWorkplace(location, criteria, index),
      experienceLevel: experienceLevels[index % experienceLevels.length],
      jobType: jobTypes[index % jobTypes.length],
      applyMethod: applyMethods[index % applyMethods.length],
      applicants: 18 + (index % 65),
      salaryRange: `$${salaryLow}k-$${salaryHigh}k`,
      posted: `${1 + (index % 21)} days ago`,
      source: "Demo provider",
      priority: index % 7,
      tags: tagSet,
      summary: `Own product strategy for ${tagSet[0]} initiatives across cross-functional enterprise teams.`
    });
  }
  return jobs;
}
