import { describe, it, expect } from 'vitest';
import { uploadCommand } from '../../src/bot/commands/upload.js';
import { filesCommand } from '../../src/bot/commands/files.js';
import { infoCommand } from '../../src/bot/commands/info.js';
import { deleteCommand } from '../../src/bot/commands/delete.js';
import { extendCommand } from '../../src/bot/commands/extend.js';
import { fileBanCommand } from '../../src/bot/commands/fileBan.js';

describe('Discord Bot Slash Commands Definition', () => {
  it('defines /upload command with proper options', () => {
    const data = uploadCommand.data.toJSON();
    expect(data.name).toBe('upload');
    expect(data.options?.some((o: any) => o.name === 'expires')).toBe(true);
    expect(data.options?.some((o: any) => o.name === 'private')).toBe(true);
    expect(data.options?.some((o: any) => o.name === 'max_downloads')).toBe(true);
  });

  it('defines /files command for viewing user uploads', () => {
    const data = filesCommand.data.toJSON();
    expect(data.name).toBe('files');
  });

  it('defines /info command for file details', () => {
    const data = infoCommand.data.toJSON();
    expect(data.name).toBe('info');
    expect(data.options?.some((o: any) => o.name === 'public_id')).toBe(true);
  });

  it('defines /delete command for file removal', () => {
    const data = deleteCommand.data.toJSON();
    expect(data.name).toBe('delete');
    expect(data.options?.some((o: any) => o.name === 'public_id')).toBe(true);
  });

  it('defines /extend command for adjusting expiration', () => {
    const data = extendCommand.data.toJSON();
    expect(data.name).toBe('extend');
    expect(data.options?.some((o: any) => o.name === 'public_id')).toBe(true);
    expect(data.options?.some((o: any) => o.name === 'expires')).toBe(true);
  });

  it('defines /file-ban command with moderator restrictions', () => {
    const data = fileBanCommand.data.toJSON();
    expect(data.name).toBe('file-ban');
    expect(data.options?.some((o: any) => o.name === 'public_id')).toBe(true);
  });
});
