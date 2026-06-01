import { removeComments } from '../src/index';

/**
 * Regression tests for the Ruby comment remover (`removeRubyComments` /
 * `findCommentIndex` in `src/removers/other-remover.ts`).
 *
 * These cover constructs that previously corrupted valid Ruby: regex literals,
 * character literals, percent literals with bracket delimiters, and heredocs.
 */
function ruby(code: string): string {
  return removeComments(code, { language: 'ruby' }).code;
}

describe('Ruby edge cases', () => {
  describe('regex literals', () => {
    test('# inside a regex is not a comment', () => {
      expect(ruby('r = /a#b/')).toBe('r = /a#b/');
    });

    test('# inside a regex is preserved while trailing comment is stripped', () => {
      expect(ruby('r = /a#b/ # c')).toBe('r = /a#b/');
    });

    test('regex with a char class containing / and #', () => {
      expect(ruby('r = /[/#]x/ # c')).toBe('r = /[/#]x/');
    });

    test('regex with an escaped slash', () => {
      expect(ruby('r = /a\\/b#c/ # c')).toBe('r = /a\\/b#c/');
    });

    test('regex after a keyword', () => {
      expect(ruby('return /a#b/ # x')).toBe('return /a#b/');
    });
  });

  describe('division is not a regex', () => {
    test('simple division with trailing comment', () => {
      expect(ruby('n / 2 # c')).toBe('n / 2');
    });

    test('division after a closing paren', () => {
      expect(ruby('(a) / 2 # c')).toBe('(a) / 2');
    });

    test('division after an index', () => {
      expect(ruby('arr[0] / 2 # c')).toBe('arr[0] / 2');
    });
  });

  describe('percent literals with # inside', () => {
    test('%q{...} with brace delimiter', () => {
      expect(ruby('s = %q{has # in}')).toBe('s = %q{has # in}');
    });

    test('%w[...] with bracket delimiter', () => {
      expect(ruby('arr = %w[a #b c]')).toBe('arr = %w[a #b c]');
    });

    test('%r{...} with brace delimiter', () => {
      expect(ruby('rx = %r{a#b}')).toBe('rx = %r{a#b}');
    });

    test('%Q<...> with angle delimiter', () => {
      expect(ruby('x = %Q<x # y>')).toBe('x = %Q<x # y>');
    });

    test('%(...) bare paren delimiter', () => {
      expect(ruby('y = %(a#b)')).toBe('y = %(a#b)');
    });

    test('percent literal with nested braces', () => {
      expect(ruby('s = %q{a {b} c # d}')).toBe('s = %q{a {b} c # d}');
    });

    test('trailing comment after a percent literal is still stripped', () => {
      expect(ruby('arr = %w[a b] # words')).toBe('arr = %w[a b]');
    });
  });

  describe('character literals', () => {
    test('?# is the character literal for #', () => {
      expect(ruby('c = ?#')).toBe('c = ?#');
    });

    test('?a is a character literal', () => {
      expect(ruby('c = ?a')).toBe('c = ?a');
    });

    test('?# with a trailing comment', () => {
      expect(ruby('c = ?# # the hash char')).toBe('c = ?#');
    });
  });

  describe('ternary operator still works', () => {
    test('spaced ternary with trailing comment', () => {
      expect(ruby('z = cond ? a : b # c')).toBe('z = cond ? a : b');
    });
  });

  describe('heredocs', () => {
    test('squiggly heredoc body with # is preserved', () => {
      expect(ruby('x = <<~SQL\nSELECT 1 # not comment\nSQL')).toBe(
        'x = <<~SQL\nSELECT 1 # not comment\nSQL'
      );
    });

    test('dash heredoc body with # is preserved', () => {
      expect(ruby('x = <<-SQL\n  SELECT 1 # not comment\n  SQL')).toBe(
        'x = <<-SQL\n  SELECT 1 # not comment\n  SQL'
      );
    });

    test('plain heredoc body with # is preserved', () => {
      expect(ruby('x = <<SQL\nSELECT 1 # not comment\nSQL')).toBe(
        'x = <<SQL\nSELECT 1 # not comment\nSQL'
      );
    });

    test('quoted heredoc tag body is preserved', () => {
      expect(ruby("x = <<'SQL'\nSELECT 1 # not comment\nSQL")).toBe(
        "x = <<'SQL'\nSELECT 1 # not comment\nSQL"
      );
    });

    test('left-shift operator is not a heredoc', () => {
      expect(ruby('arr << item # c')).toBe('arr << item');
    });
  });

  describe('normal comments are still removed', () => {
    test('inline comment', () => {
      expect(ruby('x = 1 # comment')).toBe('x = 1');
    });

    test('full-line comment', () => {
      expect(ruby('# just a comment')).toBe('');
    });

    test('# inside a double-quoted string is kept', () => {
      expect(ruby('x = "a # b"')).toBe('x = "a # b"');
    });

    test('# inside a single-quoted string is kept', () => {
      expect(ruby("x = 'a # b'")).toBe("x = 'a # b'");
    });

    test('comment after a string literal is removed', () => {
      expect(ruby('puts "hello" # hi')).toBe('puts "hello"');
    });

    test('modulo operator is not a percent literal', () => {
      expect(ruby('x = a % b # c')).toBe('x = a % b');
    });
  });
});
