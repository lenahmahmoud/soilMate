import { jest } from '@jest/globals';

const requireAuth = jest.fn((req, res, next) => {
  req.user = { id: 'account-1' };
  next();
});
const findOrCreateGuest = jest.fn(async () => ({ _id: 'guest-oid' }));

jest.unstable_mockModule('../../src/middleware/auth.js', () => ({ requireAuth }));
jest.unstable_mockModule('../../src/services/guestService.js', () => ({ findOrCreateGuest }));

const { requireOwner } = await import('../../src/middleware/owner.js');

const GUEST = '3f2b8a52-6c1e-4b7d-9a35-0d4f7e1c2b90';

const run = async (headers = {}) => {
  const req = { get: (name) => headers[name] };
  const next = jest.fn();
  await requireOwner(req, {}, next);
  return { req, next };
};

beforeEach(() => jest.clearAllMocks());

describe('requireOwner', () => {
  test('no Authorization and no X-Guest-Id gives 401 UNAUTHENTICATED', async () => {
    const { next } = await run();
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHENTICATED');
  });

  test('a malformed guest id gives 400 INVALID_GUEST_ID and never touches the database', async () => {
    for (const bad of ['1234', 'not-a-uuid', '3f2b8a52-6c1e-1b7d-9a35-0d4f7e1c2b90' /* version 1 */, `${GUEST}x`]) {
      const { next } = await run({ 'X-Guest-Id': bad });
      const err = next.mock.calls[0][0];
      expect(err.status).toBe(400);
      expect(err.code).toBe('INVALID_GUEST_ID');
    }
    expect(findOrCreateGuest).not.toHaveBeenCalled();
  });

  test('a valid guest id sets req.user as a guest', async () => {
    const { req, next } = await run({ 'X-Guest-Id': GUEST });
    expect(findOrCreateGuest).toHaveBeenCalledWith(GUEST);
    expect(req.user).toEqual({ id: 'guest-oid', isGuest: true });
    expect(next).toHaveBeenCalledWith();
  });

  test('upper-case UUIDs are accepted', async () => {
    const { req } = await run({ 'X-Guest-Id': GUEST.toUpperCase() });
    expect(req.user.isGuest).toBe(true);
  });

  test('a token wins over a guest id and the guest is not created', async () => {
    const { req } = await run({ Authorization: 'Bearer abc', 'X-Guest-Id': GUEST });
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(findOrCreateGuest).not.toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'account-1' });
  });

  test('a bad token is rejected by requireAuth and never falls back to the guest', async () => {
    requireAuth.mockImplementationOnce((req, res, next) => {
      const e = new Error('no');
      e.status = 401;
      next(e);
    });
    const { next } = await run({ Authorization: 'Bearer bad', 'X-Guest-Id': GUEST });
    expect(next.mock.calls[0][0].status).toBe(401);
    expect(findOrCreateGuest).not.toHaveBeenCalled();
  });

  test('a database error is passed to next(err)', async () => {
    findOrCreateGuest.mockRejectedValueOnce(new Error('db down'));
    const { next } = await run({ 'X-Guest-Id': GUEST });
    expect(next.mock.calls[0][0].message).toBe('db down');
  });
});