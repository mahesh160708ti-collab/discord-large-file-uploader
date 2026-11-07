import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Public Web Interfaces', () => {
  it('upload.html contains required upload controls and progress elements', () => {
    const html = fs.readFileSync(path.resolve('public/upload.html'), 'utf-8');
    expect(html).toContain('id="drop-zone"');
    expect(html).toContain('id="file-input"');
    expect(html).toContain('id="progress-bar"');
    expect(html).toContain('id="download-link"');
  });

  it('download.html contains security warning notice and download button', () => {
    const html = fs.readFileSync(path.resolve('public/download.html'), 'utf-8');
    expect(html).toContain('Safety Notice');
    expect(html).toContain('id="download-btn"');
    expect(html).toContain('id="report-btn"');
  });
});
