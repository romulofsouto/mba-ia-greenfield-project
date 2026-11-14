import { PUBLIC_ID_LENGTH, generatePublicId } from './public-id.util';

describe('generatePublicId', () => {
  it('should return 11 characters from the URL-safe alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const id = generatePublicId();
      expect(id).toHaveLength(PUBLIC_ID_LENGTH);
      expect(id).toMatch(/^[A-Za-z0-9_-]{11}$/);
    }
  });

  it('should return distinct values on successive calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generatePublicId()));
    expect(ids.size).toBe(1000);
  });
});
