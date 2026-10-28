import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSeenTour, markTourSeen } from './tour.storage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('tour.storage', () => {
  it('AC-012-02 tras marcarlo como visto, la misma persona ya no lo ve como nuevo', () => {
    expect(hasSeenTour('Ana López')).toBe(false);
    markTourSeen('Ana López');
    expect(hasSeenTour('Ana López')).toBe(true);
  });

  it('AC-012-03 la marca es por persona: otro nombre sí lo ve su primera vez', () => {
    markTourSeen('Ana López');
    expect(hasSeenTour('Luis Pérez')).toBe(false);
  });

  it('AC-012-09 sin localStorage no lanza error y se trata como no visto', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => markTourSeen('Ana López')).not.toThrow();
    expect(hasSeenTour('Ana López')).toBe(false);
  });
});
