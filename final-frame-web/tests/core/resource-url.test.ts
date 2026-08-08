import assert from 'node:assert/strict';
import test from 'node:test';
import { isApiResourceReference } from '../../lib/api/resource-url-core.ts';

test('accepts only absolute or root-relative API resource references', () => {
  assert.equal(isApiResourceReference('/api/media/assets/asset-1/preview'), true);
  assert.equal(isApiResourceReference('https://app.example.test/backend/api/media'), true);
  assert.equal(isApiResourceReference('javascript:alert(1)'), false);
  assert.equal(isApiResourceReference('api/media'), false);
});
