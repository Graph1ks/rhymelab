import { describe, expect, it } from 'vitest';
import coverage from '../../parity-coverage.json';

describe('React Studio migration parity inventory', () => {
  it('starts from the complete captured baseline', () => {
    expect(coverage.legacy_capabilities).toHaveLength(82);
    expect(coverage.additional_current_capabilities).toHaveLength(11);
    expect(new Set([
      ...coverage.legacy_capabilities.map((row) => row.id),
      ...coverage.additional_current_capabilities.map((row) => row.id),
    ]).size).toBe(93);
  });

  it('does not accidentally claim cutover readiness at scaffold stage', () => {
    const rows = [...coverage.legacy_capabilities, ...coverage.additional_current_capabilities];
    expect(rows.every((row) => row.status === 'verified')).toBe(false);
  });
});
