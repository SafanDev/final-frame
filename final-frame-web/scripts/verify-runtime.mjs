#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const requiredNodeMajor = 24;
const requiredNpmMajor = 11;
const nodeMajor = Number(process.versions.node.split('.')[0]);
const userAgentNpm = process.env.npm_config_user_agent?.match(/npm\/(\d+)(?:\.|\s|$)/)?.[1];
let npmMajor = userAgentNpm ? Number(userAgentNpm) : Number.NaN;
let npmVersion = userAgentNpm ?? 'unknown';

if (!Number.isFinite(npmMajor)) {
  const binary = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8', shell: false });
  npmVersion = result.stdout?.trim() || 'unknown';
  npmMajor = Number(npmVersion.split('.')[0]);
}

if (nodeMajor !== requiredNodeMajor || npmMajor !== requiredNpmMajor) {
  console.error(`FinalFrame requires Node.js 24.x and npm 11.x. Found Node.js ${process.versions.node} and npm ${npmVersion}.`);
  console.error('Switch runtimes before installing dependencies; do not bypass this check for release builds.');
  process.exit(1);
}
