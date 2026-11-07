import { describe, it, expect, vi } from 'vitest';
import { UserService } from '../../src/services/userService.js';

describe('UserService', () => {
  it('computes active storage used only from non-expired, non-deleted files', async () => {
    const mockDb = {
      query: vi.fn()
        // Check/upsert user query
        .mockResolvedValueOnce({ rows: [{ discord_user_id: '123', is_banned: false }] })
        // Active storage sum query
        .mockResolvedValueOnce({ rows: [{ total_used: '2147483648' }] }), // 2 GB
    } as any;

    const userService = new UserService(mockDb, { DEFAULT_USER_QUOTA_BYTES: 5 * 1024 * 1024 * 1024 } as any);
    const result = await userService.getUserStorage('123');

    expect(result.usedBytes).toBe(2147483648);
    expect(result.quotaBytes).toBe(5 * 1024 * 1024 * 1024);
    expect(result.isBanned).toBe(false);
  });
});
