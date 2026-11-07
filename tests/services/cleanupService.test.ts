import { describe, it, expect, vi } from 'vitest';
import { CleanupService } from '../../src/services/cleanupService.js';

describe('CleanupService', () => {
  it('identifies and deletes objects from storage where delete_after is past', async () => {
    const mockStorage = {
      deleteObject: vi.fn().mockResolvedValue(undefined),
    } as any;
    const mockDb = {
      query: vi.fn()
        // Query expired files
        .mockResolvedValueOnce({
          rows: [
            { id: 'file-1', storage_key: 'objects/1.zip' },
            { id: 'file-2', storage_key: 'objects/2.zip' },
          ]
        })
        // Update file-1 status
        .mockResolvedValueOnce({ rowCount: 1 })
        // Update file-2 status
        .mockResolvedValueOnce({ rowCount: 1 }),
    } as any;

    const cleanup = new CleanupService(mockDb, mockStorage);
    const result = await cleanup.purgeExpiredFiles();

    expect(result.deletedCount).toBe(2);
    expect(mockStorage.deleteObject).toHaveBeenCalledWith('objects/1.zip');
    expect(mockStorage.deleteObject).toHaveBeenCalledWith('objects/2.zip');
  });

  it('aborts stalled upload sessions', async () => {
    const mockStorage = {
      abortMultipart: vi.fn().mockResolvedValue(undefined),
    } as any;
    const mockDb = {
      query: vi.fn()
        // Query stalled sessions
        .mockResolvedValueOnce({
          rows: [{ id: 'session-1', storage_key: 'objects/temp.zip', upload_id: 'upload-xyz' }]
        })
        // Mark session expired
        .mockResolvedValueOnce({ rowCount: 1 }),
    } as any;

    const cleanup = new CleanupService(mockDb, mockStorage);
    const result = await cleanup.abortStalledUploads();

    expect(result.abortedCount).toBe(1);
    expect(mockStorage.abortMultipart).toHaveBeenCalledWith('objects/temp.zip', 'upload-xyz');
  });
});
