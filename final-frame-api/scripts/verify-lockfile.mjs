#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

const fail = (errors) => {
  console.error('Lockfile verification failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
};

if (!existsSync('package-lock.json')) {
  fail(['package-lock.json is missing. Generate it with Node 24 and npm 11 before release.']);
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const errors = [];

if (lockfile.lockfileVersion !== 3) errors.push('package-lock.json must use lockfileVersion 3.');
const root = lockfile.packages?.[''];
if (!root) errors.push('package-lock.json is missing its root package entry.');

for (const section of ['dependencies', 'devDependencies']) {
  const expected = manifest[section] ?? {};
  const actual = root?.[section] ?? {};
  for (const [name, version] of Object.entries(expected)) {
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
      errors.push(`${section}.${name} must use an exact version; received ${version}.`);
    }
    if (actual[name] !== version) {
      errors.push(`${section}.${name} is ${version} in package.json but ${actual[name] ?? 'missing'} in package-lock.json.`);
    }
    if (!lockfile.packages?.[`node_modules/${name}`]) {
      errors.push(`package-lock.json has no installed-package entry for ${name}.`);
    }
  }
  for (const name of Object.keys(actual)) {
    if (!(name in expected)) errors.push(`${section}.${name} exists in package-lock.json but not package.json.`);
  }
}

const serialized = JSON.stringify(lockfile);
for (const pattern of [
  /pkgs\.dev\.azure\.com/i,
  /artifactory/i,
  /npm\.pkg\.github\.com/i,
  /localhost:\d+/i,
  /_authToken/i,
]) {
  if (pattern.test(serialized)) errors.push(`package-lock.json contains a disallowed registry or credential pattern: ${pattern}.`);
}

if (errors.length > 0) fail(errors);
console.log('Lockfile matches package.json, uses exact versions, and contains no disallowed registry or credential patterns.');
