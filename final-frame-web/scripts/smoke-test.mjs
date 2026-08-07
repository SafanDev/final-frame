#!/usr/bin/env node
const webBase = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const apiBase = (process.env.SMOKE_API_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
const requireApi = process.env.SMOKE_REQUIRE_API !== "false";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 10_000);

async function check(url, validator) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "manual" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await validator(response);
    console.log(`PASS ${url}`);
  } finally {
    clearTimeout(timer);
  }
}

const checks = [
  check(`${webBase}/api/health`, async (response) => {
    const body = await response.json();
    if (body.status !== "ok" || body.service !== "FinalFrame Web") throw new Error("Unexpected web health response.");
  }),
  check(`${webBase}/`, async (response) => {
    const body = await response.text();
    if (!body.includes("FinalFrame")) throw new Error("Public page did not contain the product name.");
  }),
  check(`${webBase}/robots.txt`, async (response) => {
    const body = await response.text();
    if (!body.includes("sitemap.xml")) throw new Error("robots.txt does not reference the sitemap.");
  }),
  check(`${webBase}/sitemap.xml`, async (response) => {
    const body = await response.text();
    if (!body.includes("<loc>")) throw new Error("sitemap.xml does not contain the public product page.");
  }),
];

if (requireApi) {
  checks.push(
    check(`${apiBase}/health`, async (response) => {
      const body = await response.json();
      if (body.status !== "ok") throw new Error("Unexpected API health response.");
    }),
    check(`${apiBase}/health/ready`, async (response) => {
      const body = await response.json();
      if (body.status !== "ready" || body.database !== "connected") throw new Error("API is not database-ready.");
    }),
  );
}

const results = await Promise.allSettled(checks);
const failures = results.filter((result) => result.status === "rejected");
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure.reason?.message || failure.reason}`);
  process.exit(1);
}
console.log("FinalFrame smoke checks passed.");
