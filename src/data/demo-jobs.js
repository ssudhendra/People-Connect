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

export function generateDemoJobs(criteria) {
  const jobs = [];
  const count = Math.max(criteria.maxResults, 75);
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
      workplace: location.toLowerCase().includes("remote") ? "Remote" : criteria.remotePreference,
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
