import { formatStatusLabel, cn } from '../utils';

describe('utils - formatStatusLabel', () => {
  it('should return "Unknown" for null, undefined, or empty string', () => {
    expect(formatStatusLabel(null)).toBe('Unknown');
    expect(formatStatusLabel(undefined)).toBe('Unknown');
    expect(formatStatusLabel('')).toBe('Unknown');
  });

  it('should format a single word status (lowercase)', () => {
    expect(formatStatusLabel('active')).toBe('Active');
  });

  it('should format a single word status (uppercase)', () => {
    expect(formatStatusLabel('ACTIVE')).toBe('Active');
  });

  it('should format a snake_case status', () => {
    expect(formatStatusLabel('part_time')).toBe('Part Time');
    expect(formatStatusLabel('on_leave')).toBe('On Leave');
  });

  it('should format a snake_case status with mixed casing', () => {
    expect(formatStatusLabel('pENDING_aPPROVAL')).toBe('Pending Approval');
  });

  it('should correctly format space-separated strings', () => {
    expect(formatStatusLabel('part time')).toBe('Part Time');
    expect(formatStatusLabel('PART TIME')).toBe('Part Time');
  });

  it('should handle already formatted strings', () => {
    expect(formatStatusLabel('Active')).toBe('Active');
    expect(formatStatusLabel('Part Time')).toBe('Part Time');
  });
});

describe('utils - cn', () => {
  it('should merge multiple class strings', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('should handle conditional classes', () => {
    expect(cn('class1', true && 'class2', false && 'class3')).toBe('class1 class2');
  });

  it('should correctly merge tailwind classes using twMerge', () => {
    // twMerge should resolve 'px-2 px-4' to 'px-4'
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('should handle object notation for classes', () => {
    expect(cn({ 'class1': true, 'class2': false })).toBe('class1');
  });
});
