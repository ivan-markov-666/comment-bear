import { detectLanguageByContent } from '../src/detectors/language-detector';
import { removeComments } from '../src/index';

/**
 * Regression tests for catastrophic-backtracking (ReDoS) in
 * `detectLanguageByContent`. This function runs on EVERY input that has no
 * explicit language, so a quadratic regex there freezes the whole library.
 *
 * The historical offenders were:
 *   - Ruby heuristics pairing a greedy token run with a lazy `[\s\S]*?`/`.*`
 *     (e.g. `def\s+\w+ ... [\s\S]*?\n\s*end`), and
 *   - the CSS selector check `/[.#]?\w+\s*\{[\s\S]*\}/` — a `+` run that must be
 *     followed by `{` backtracks quadratically when no `{` is present.
 *
 * Each test feeds a large non-matching input and asserts it returns quickly.
 * A regression makes these hang (and the per-test timeout fails fast).
 */
describe('detectLanguageByContent ReDoS regression', () => {
  const BIG = 200000;

  const fast = (label: string, input: string) => {
    test(label + ' returns quickly', () => {
      const start = Date.now();
      detectLanguageByContent(input);
      // A linear scan of 200k chars is sub-millisecond-to-low-ms; the old
      // quadratic code took ~6s. 1s is a huge margin that still catches a
      // genuine super-linear regression.
      expect(Date.now() - start).toBeLessThan(1000);
    }, 5000);
  };

  fast('long word', 'a'.repeat(BIG));
  fast('def + long word (no end)', 'def ' + 'a'.repeat(BIG));
  fast('begin + long word (no end)', 'begin ' + 'x'.repeat(BIG));
  fast('do | + long word', 'do |' + 'a'.repeat(BIG));
  fast('=begin + long body (no =end)', '=begin\n' + 'a'.repeat(BIG));
  fast('class + long word (no end)', 'class A\n' + 'x'.repeat(BIG));
  fast('long word then brace (no close)', 'a'.repeat(BIG) + '{');
  fast('type-sig bait', 'x :: ' + 'a '.repeat(BIG / 2));

  test('full removeComments with auto-detection stays fast on pathological input', () => {
    const start = Date.now();
    removeComments('def ' + 'a'.repeat(BIG)); // no language -> triggers detection
    expect(Date.now() - start).toBeLessThan(1000);
  }, 5000);

  // Correctness must be preserved by the rewrite.
  describe('detection still correct after the rewrite', () => {
    test('real Ruby def/end', () => {
      expect(detectLanguageByContent('def hello\n  puts "hi"\nend')).toBe('ruby');
    });
    test('real Ruby class/end', () => {
      expect(detectLanguageByContent('class Foo\n  def bar\n  end\nend')).toBe('ruby');
    });
    test('real Ruby do |x| block', () => {
      expect(detectLanguageByContent('[1, 2].each do |x|\n  puts x\nend')).toBe('ruby');
    });
    test('real Ruby =begin/=end', () => {
      expect(detectLanguageByContent('=begin\ncomment\n=end\nputs 1')).toBe('ruby');
    });
    test('CSS class rule', () => {
      expect(detectLanguageByContent('.foo { color: red; }')).toBe('css');
    });
    test('CSS id rule', () => {
      expect(detectLanguageByContent('#id { margin: 0; }')).toBe('css');
    });
    test('CSS element rule', () => {
      expect(detectLanguageByContent('div { display: flex; }')).toBe('css');
    });
    test('symbol soup is not CSS', () => {
      expect(detectLanguageByContent('!@#$%^&*()_+-=[]{}|;:,.<>?/~`')).toBeUndefined();
    });
  });
});
