import assert from 'node:assert/strict';
import test from 'node:test';

import {
  keepStableUserReference,
  shouldRefreshAuthProfile
} from '../src/services/authState.js';

const user = {
  id: 'user-1',
  email: 'admin@example.com',
  username: 'admin@example.com',
  name: 'Administrador',
  accessLevel: 'admin',
  active: true
};

test('token refresh does not request another profile load', () => {
  assert.equal(shouldRefreshAuthProfile('TOKEN_REFRESHED'), false);
  assert.equal(shouldRefreshAuthProfile('SIGNED_IN'), true);
  assert.equal(shouldRefreshAuthProfile('USER_UPDATED'), true);
});

test('equivalent auth users keep the same reference', () => {
  const equivalentUser = { ...user };
  assert.equal(keepStableUserReference(user, equivalentUser), user);
});

test('a real profile change replaces the authenticated user', () => {
  const updatedUser = { ...user, accessLevel: 'user' };
  assert.equal(keepStableUserReference(user, updatedUser), updatedUser);
  assert.equal(keepStableUserReference(user, null), null);
});
