const PROFILE_REFRESH_EVENTS = new Set([
  'INITIAL_SESSION',
  'SIGNED_IN',
  'USER_UPDATED'
]);

const USER_IDENTITY_FIELDS = [
  'id',
  'email',
  'username',
  'name',
  'accessLevel',
  'active'
];

export const shouldRefreshAuthProfile = event => PROFILE_REFRESH_EVENTS.has(event);

export const keepStableUserReference = (currentUser, nextUser) => {
  if (currentUser === nextUser || !currentUser || !nextUser) return nextUser;

  const isSameUser = USER_IDENTITY_FIELDS.every(
    field => currentUser[field] === nextUser[field]
  );

  return isSameUser ? currentUser : nextUser;
};
