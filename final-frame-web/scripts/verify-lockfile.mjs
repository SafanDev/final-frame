#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

if (!existsSync("package-lock.json")) {
  console.error("package-lock.json is missing. Generate it with npm install --package-lock-only, review it, and commit it before using npm ci or releasing.");
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));
const errors = [];

if (lockfile.lockfileVersion !== 3) errors.push("package-lock.json must use lockfileVersion 3.");
const root = lockfile.packages?.[""];
if (!root) errors.push("package-lock.json is missing the root package entry.");

for (const section of ["dependencies", "devDependencies"]) {
  const expected = packageJson[section] || {};
  const actual = root?.[section] || {};
  for (const [name, version] of Object.entries(expected)) {
    if (actual[name] !== version) errors.push(`${section}.${name} is ${version} in package.json but ${actual[name] ?? "missing"} in package-lock.json.`);
  }
  for (const name of Object.keys(actual)) {
    if (!(name in expected)) errors.push(`${section}.${name} exists in package-lock.json but not package.json.`);
  }
}

const serialized = JSON.stringify(lockfile);
for (const pattern of [/pkgs\.dev\.azure\.com/i, /artifactory/i, /npm\.pkg\.github\.com/i, /localhost:\d+/i, /_authToken/i]) {
  if (pattern.test(serialized)) errors.push(`package-lock.json contains a disallowed registry or credential pattern: ${pattern}`);
}

for (const [section, dependencies] of Object.entries({
  dependencies: packageJson.dependencies || {},
  devDependencies: packageJson.devDependencies || {},
})) {
  for (const [name, version] of Object.entries(dependencies)) {
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
      errors.push(`${section}.${name} must use an exact version, received ${version}.`);
    }
  }
}

if (errors.length) {
  console.error("Lockfile verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Lockfile matches package.json, uses exact versions, and contains no disallowed registry or credential patterns.");
