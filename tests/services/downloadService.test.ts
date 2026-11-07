import { describe, it, expect, vi } from 'vitest';
import { DownloadService } from '../../src/services/downloadService.js';

describe('DownloadService', () => {
  it('returns not accessible if file status is deleted or banned', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: '1', public_id: 'abc', status: 'banned', expires_at: new Date(Date.now() + 10000) }]
      })
    } as any;
    const service = new DownloadService(mockDb, {} as any);

    const result = await service.getFileForDownload('abc');
    expect(result.isAccessible).toBe(false);
    expect(result.reason).toMatch(/unavailable|banned/i);
  });

  it('returns not accessible if file expiration date has passed', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: '1', public_id: 'abc', status: 'completed', expires_at: new Date(Date.now() - 10000), download_count: 5, max_downloads: 100 }]
      })
    } as any;
    const service = new DownloadService(mockDb, {} as any);

    const result = await service.getFileForDownload('abc');
    expect(result.isAccessible).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it('returns not accessible and sets accelerated cleanup if max downloads exceeded', async () => {
    const mockDb = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{ id: '1', public_id: 'abc', status: 'completed', expires_at: new Date(Date.now() + 100000), download_count: 10, max_downloads: 10 }]
        })
        .mockResolvedValue({ rowCount: 1 })
    } as any;
    const service = new DownloadService(mockDb, {} as any);

    const result = await service.getFileForDownload('abc');
    expect(result.isAccessible).toBe(false);
    expect(result.reason).toMatch(/limit reached/i);
  });

  it('auto-quarantines file upon multiple abuse reports', async () => {
    const mockDb = {
      query: vi.fn()
        // File lookup
        .mockResolvedValueOnce({ rows: [{ id: 'file-123', public_id: 'abc', status: 'completed' }] })
        // Insert report
        .mockResolvedValueOnce({ rowCount: 1 })
        // Count reports
        .mockResolvedValueOnce({ rows: [{ report_count: '3' }] })
        // Update quarantine
        .mockResolvedValueOnce({ rowCount: 1 }),
    } as any;
    const service = new DownloadService(mockDb, {} as any);

    const res = await service.submitAbuseReport('abc', '127.0.0.1', 'Suspected token stealer');
    expect(res.reported).toBe(true);
    expect(res.quarantined).toBe(true);
  });

  it('atomically rejects generateDownloadUrl when download cap has been exhausted', async () => {
    const mockDb = {
      query: vi.fn()
        // getFileForDownload
        .mockResolvedValueOnce({
          rows: [{ id: 'file-1', public_id: 'capped', status: 'completed', expires_at: new Date(Date.now() + 10000), download_count: 5, max_downloads: 5 }]
        })
        .mockResolvedValue({ rowCount: 1 }),
    } as any;
    const service = new DownloadService(mockDb, {} as any);

    await expect(service.generateDownloadUrl('capped', '127.0.0.1'))
      .rejects.toThrow(/limit reached/i);
  });
});
