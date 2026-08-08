import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const environmentModule = pathToFileURL(
  join(projectRoot, 'src', 'config', 'env.ts'),
).href;

test('omitted Boolean environment values use their configured defaults', () => {
  const environment = {
    ...process.env,
    NODE_ENV: 'development',
    FRONTEND_URL: 'http://localhost:3000',
    MFA_ENCRYPTION_KEY: 'a'.repeat(32),
    MFA_RECOVERY_PEPPER: 'b'.repeat(32),
    DATABASE_URL: 'postgresql://user:password@localhost:5432/finalframe',
    NEXTAUTH_SECRET: 'c'.repeat(32),
    SESSION_COOKIE_NAME: 'next-auth.session-token',
    R2_ACCOUNT_ID: 'local-test-account',
    R2_ACCESS_KEY_ID: 'local-test-access-key',
    R2_SECRET_ACCESS_KEY: 'local-test-secret-key',
    R2_BUCKET_NAME: 'finalframe-test-assets',
    CERTIFICATE_SIGNING_KEY: 'd'.repeat(48),
    DOTENV_CONFIG_PATH: join(projectRoot, '.environment-defaults-test.missing'),
  };

  delete environment.REQUIRE_EMAIL_VERIFICATION;
  delete environment.REDIS_REQUIRED;
  delete environment.R2_FORCE_PATH_STYLE;

  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      `await import(${JSON.stringify(environmentModule)});`,
    ],
    {
      cwd: projectRoot,
      env: environment,
      encoding: 'utf8',
    },
  );

  assert.equal(
    result.status,
    0,
    `Environment module failed to load.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  );
});
