import { describe, it, expect } from 'vitest';
import { formatBytes, formatDuration, formatDate, formatLatency, getErrorMessage } from './format';

describe('format utilities', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(null)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1073741824)).toBe('1 GB');
    expect(formatBytes(1610612736)).toBe('1.5 GB');
  });

  it('formats duration in seconds', () => {
    expect(formatDuration(0)).toBe('0秒');
    expect(formatDuration(45)).toBe('45秒');
    expect(formatDuration(125)).toBe('2分 5秒');
    expect(formatDuration(3665)).toBe('1小时 1分 5秒');
    expect(formatDuration(90000)).toBe('1天 1小时');
  });

  it('formats latency status', () => {
    expect(formatLatency(null).text).toBe('未测试');
    expect(formatLatency(0).text).toBe('超时');
    expect(formatLatency(50).color).toContain('emerald');
    expect(formatLatency(200).color).toContain('amber');
    expect(formatLatency(500).color).toContain('rose');
  });

  it('formats date string gracefully', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('')).toBe('-');
    expect(formatDate('invalid-date')).toBe('invalid-date');
    const valid = formatDate('2026-11-03T10:00:00Z');
    expect(valid).toContain('2026');
  });

  it('extracts error messages reliably', () => {
    expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
    expect(getErrorMessage({ message: 'Custom obj error' })).toBe('Custom obj error');
    expect(getErrorMessage('Raw string error')).toBe('Raw string error');
  });
});
