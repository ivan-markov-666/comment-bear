import { removeComments } from '../src/index';

/**
 * Regression test: CRLF input should not leave a dangling lone '\r' at the end
 * of the output (the final line's '\r' was orphaned when the trailing newline
 * was dropped). Mid-file CRLF line endings must remain intact.
 */
describe('CRLF handling', () => {
  const strayCR = (s: string) => (s.match(/\r(?!\n)/g) || []).length;

  for (const language of ['javascript', 'typescript', 'c', 'cpp', 'go', 'rust', 'java', 'shell', 'toml']) {
    test(`no dangling lone CR at EOF (${language})`, () => {
      const code = 'a = 1 # c\r\nb = 2\r\nc = 3\r\n';
      const out = removeComments(code, { language: language as any }).code;
      expect(strayCR(out)).toBe(0);
    });
  }

  test('mid-file CRLF line endings are preserved', () => {
    const out = removeComments('a = 1; // c\r\nb = 2;\r\nc = 3;\r\n', { language: 'javascript' }).code;
    expect(out).toContain('b = 2;\r\n');
    expect(strayCR(out)).toBe(0);
  });
});
