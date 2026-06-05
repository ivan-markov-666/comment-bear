import { removeComments } from '../src/index';
import { removeBySpec } from '../src/removers/_shared';

/**
 * Regression tests for the batch of correctness fixes to the spec-driven
 * removers and the generic engine:
 *
 *   - shell `#` only starts a comment at the start of a word
 *     (`requireWhitespaceBefore`): protects `$#`, `${#arr}`, `$((2#101))`,
 *     mid-word `a#b`.
 *   - char-literal prefixes (`charLiteralPrefixes`): Elixir `?#`, Erlang `$%`,
 *     Lisp `\;`.
 *   - PowerShell here-string protection (`@"..."@` / `@'...'@`).
 *   - escaped comment char (`ignoreIfEscaped`): Makefile / `.properties` `\#`.
 *   - OCaml / SML string inside a block comment (`skipStringsInside`):
 *     `(* "*)" *)` is a single comment.
 *
 * Each block asserts both the bug-fix output AND that ordinary comments are
 * still removed (must-not-regress).
 */

describe('Shell: # only starts a comment at a word boundary', () => {
  test('$# parameter is not treated as a comment, trailing # comment removed', () => {
    const out = removeComments('if [ $# -eq 0 ]; then echo hi; fi # c', {
      language: 'shell',
    });
    expect(out.code).toBe('if [ $# -eq 0 ]; then echo hi; fi');
  });

  test('${#arr} length expansion is preserved', () => {
    const out = removeComments('n=${#arr}', { language: 'shell' });
    expect(out.code).toBe('n=${#arr}');
  });

  test('$((2#101)) base-2 literal is preserved', () => {
    const out = removeComments('v=$((2#101))', { language: 'shell' });
    expect(out.code).toBe('v=$((2#101))');
  });

  test('mid-word a#b is preserved', () => {
    const out = removeComments('foo=a#b', { language: 'shell' });
    expect(out.code).toBe('foo=a#b');
  });

  test('# inside a double-quoted string is preserved', () => {
    const out = removeComments('echo "$#"', { language: 'shell' });
    expect(out.code).toBe('echo "$#"');
  });

  test('whitespace-preceded inline comment is still removed', () => {
    const out = removeComments('x=1 # c', { language: 'shell' });
    expect(out.code).toBe('x=1');
  });

  test('tab-preceded inline comment is still removed', () => {
    const out = removeComments('x=1\t# c', { language: 'shell' });
    expect(out.code).toBe('x=1');
  });

  test('full-line comment is still removed', () => {
    const out = removeComments('# full\nx=1', { language: 'shell' });
    expect(out.code).toBe('x=1');
  });

  test('a # immediately after ; (no space) is NOT a comment', () => {
    // In shell `;#` is one word; `#` is a comment only at the start of a word.
    const out = removeComments('echo hi;# x', { language: 'shell' });
    expect(out.code).toBe('echo hi;# x');
  });
});

describe('Elixir: ?# char literal is protected', () => {
  test('?# is the char # and is not a comment', () => {
    const out = removeComments('x = ?#\ny = 2', { language: 'elixir' });
    expect(out.code).toBe('x = ?#\ny = 2');
  });

  test('?\\n escaped char literal is preserved', () => {
    const out = removeComments('c = ?\\n\nx = 1 # c', { language: 'elixir' });
    expect(out.code).toBe('c = ?\\n\nx = 1');
  });

  test('ordinary trailing # comment is still removed', () => {
    const out = removeComments('c = ?a # comment', { language: 'elixir' });
    expect(out.code).toBe('c = ?a');
  });

  test('full-line # comment is still removed', () => {
    const out = removeComments('# c\nx = 1', { language: 'elixir' });
    expect(out.code).toBe('x = 1');
  });
});

describe('Erlang: $X char literal is protected', () => {
  test('$% is the char % and is not a comment', () => {
    const out = removeComments('X = $%, Y = 2.', { language: 'erlang' });
    expect(out.code).toBe('X = $%, Y = 2.');
  });

  test('$\\n escaped char literal is preserved', () => {
    const out = removeComments('C = $\\n, X = 1.', { language: 'erlang' });
    expect(out.code).toBe('C = $\\n, X = 1.');
  });

  test('ordinary trailing % comment is still removed', () => {
    const out = removeComments('foo() -> ok. % trailing', { language: 'erlang' });
    expect(out.code).toBe('foo() -> ok.');
  });

  test('full-line % comment is still removed', () => {
    const out = removeComments('% c\nfoo() -> ok.', { language: 'erlang' });
    expect(out.code).toBe('foo() -> ok.');
  });
});

describe('Lisp: \\; char literal is protected', () => {
  test('Clojure \\; is the semicolon char, not a comment', () => {
    const out = removeComments('(def c \\;)', { language: 'clojure' });
    expect(out.code).toBe('(def c \\;)');
  });

  test('Scheme #\\; is the semicolon char, not a comment', () => {
    const out = removeComments('(define c \\;)', { language: 'scheme' });
    expect(out.code).toBe('(define c \\;)');
  });

  test('Common Lisp #\\; is the semicolon char, not a comment', () => {
    const out = removeComments('(setq c \\;)', { language: 'commonlisp' });
    expect(out.code).toBe('(setq c \\;)');
  });

  test('Clojure named char \\newline is preserved', () => {
    const out = removeComments('(def nl \\newline)', { language: 'clojure' });
    expect(out.code).toBe('(def nl \\newline)');
  });

  test('ordinary ; comments are still removed (all three dialects)', () => {
    expect(removeComments('(foo) ; trailing', { language: 'clojure' }).code).toBe('(foo)');
    expect(removeComments('(foo) ; trailing', { language: 'scheme' }).code).toBe('(foo)');
    expect(removeComments('(foo) ; trailing', { language: 'commonlisp' }).code).toBe('(foo)');
  });
});

describe('PowerShell: here-strings are protected', () => {
  test('# inside a @"..."@ here-string is not stripped, real comment removed', () => {
    const out = removeComments('$x = @"\nline # not a comment\n"@\n$y = 2 # real', {
      language: 'powershell',
    });
    expect(out.code).toBe('$x = @"\nline # not a comment\n"@\n$y = 2');
  });

  test('# inside a @\'...\'@ literal here-string is not stripped', () => {
    const out = removeComments("$h = @'\nliteral # text\n'@\n# real comment", {
      language: 'powershell',
    });
    expect(out.code).toBe("$h = @'\nliteral # text\n'@");
  });

  test('ordinary # comment is still removed', () => {
    const out = removeComments('$x = 1 # comment\n$y = 2', { language: 'powershell' });
    expect(out.code).toBe('$x = 1\n$y = 2');
  });

  test('<# #> block comment is still removed', () => {
    const out = removeComments('$x = 1\n<#\nblock\n#>\n$y = 2', { language: 'powershell' });
    expect(out.code).not.toContain('block');
    expect(out.code).toContain('$x = 1');
    expect(out.code).toContain('$y = 2');
  });
});

describe('Makefile / properties: escaped \\# is a literal hash', () => {
  test('Makefile X = a\\#b keeps the escaped hash', () => {
    const out = removeComments('X = a\\#b', { language: 'makefile' });
    expect(out.code).toBe('X = a\\#b');
  });

  test('Makefile ordinary # comment is still removed', () => {
    const out = removeComments('all:\n\techo hi\n# comment', { language: 'makefile' });
    expect(out.code).toBe('all:\n\techo hi');
  });

  test('properties X = a\\#b keeps the escaped hash', () => {
    const out = removeComments('X = a\\#b', { language: 'properties' });
    expect(out.code).toBe('X = a\\#b');
  });

  test('properties ordinary # and ! line comments are still removed', () => {
    const out = removeComments('a=1\n# comment\n! another\nb=2', { language: 'properties' });
    expect(out.code).toBe('a=1\nb=2');
  });
});

describe('OCaml / SML: string inside a block comment', () => {
  test('OCaml (* "*)" *) is one comment (the inner *) is inside a string)', () => {
    const out = removeComments('let s = (* "*)" *) 1', { language: 'ocaml' });
    expect(out.code).toBe('let s = 1');
  });

  test('OCaml ordinary nested comment is still removed', () => {
    const out = removeComments('let s = (* a (* nested *) b *) 1', { language: 'ocaml' });
    expect(out.code).toBe('let s = 1');
  });

  test('OCaml real string containing *) is preserved', () => {
    const out = removeComments('let s = "*)"', { language: 'ocaml' });
    expect(out.code).toBe('let s = "*)"');
  });

  test('SML (* "*)" *) is one comment', () => {
    const out = removeComments('val s = (* "*)" *) 1', { language: 'sml' });
    expect(out.code).toBe('val s = 1');
  });
});

describe('Engine: charLiteralPrefixes is opt-in and additive', () => {
  test('a spec without charLiteralPrefixes is unaffected by ? before a token', () => {
    // No prefixes set: `?#` is read normally, so the `#` line comment fires.
    const out = removeBySpec('x = ?# c', { line: [{ token: '#' }] });
    expect(out).toBe('x = ?');
  });

  test('with charLiteralPrefixes the prefix+char is emitted verbatim', () => {
    const out = removeBySpec('x = ?# c', {
      line: [{ token: '#' }],
      charLiteralPrefixes: ['?'],
    });
    expect(out).toBe('x = ?# c');
  });

  test('a bare prefix before whitespace is not treated as a char literal', () => {
    // `? ` (prefix then space) stays code; the following `#` comment is removed.
    const out = removeBySpec('x = ? # c', {
      line: [{ token: '#' }],
      charLiteralPrefixes: ['?'],
    });
    expect(out).toBe('x = ?');
  });
});

describe('Engine: ignoreIfEscaped is opt-in and additive', () => {
  test('without ignoreIfEscaped a \\# still starts a comment', () => {
    const out = removeBySpec('X = a\\#b', { line: [{ token: '#' }] });
    expect(out).toBe('X = a\\');
  });

  test('with ignoreIfEscaped a \\# is a literal, not a comment', () => {
    const out = removeBySpec('X = a\\#b', {
      line: [{ token: '#', ignoreIfEscaped: true }],
    });
    expect(out).toBe('X = a\\#b');
  });
});
