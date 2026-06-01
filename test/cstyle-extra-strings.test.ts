import { removeComments } from '../src/index';

/**
 * Regression tests for "comment token inside a special string form" bugs in
 * cstyle-extra-remover: the string delimiter was missing from the language
 * spec, so a `//` inside it was stripped as a comment, corrupting the string.
 */
describe('cstyle-extra special string forms preserved', () => {
  const run = (code: string, language: string) => removeComments(code, { language: language as any }).code;

  test('Dart triple-quoted string keeps //', () => {
    const code = "var s = '''\nSELECT * FROM t // not a comment\n''';";
    expect(run(code, 'dart')).toBe(code);
  });

  test('Dart still removes a real // comment', () => {
    expect(run('var x = 1; // c', 'dart').trimEnd()).toBe('var x = 1;');
  });

  test('Groovy dollar-slashy string keeps //', () => {
    const code = 'def r = $/\\d+//\\w+/$\ndef n = 42';
    expect(run(code, 'groovy')).toBe(code);
  });

  test('Groovy still removes a real // comment', () => {
    expect(run('def x = 1 // c', 'groovy').trimEnd()).toBe('def x = 1');
  });

  test('Vala verbatim string keeps //', () => {
    const code = 'string u = """\nhttp://example.com/path\n""";';
    expect(run(code, 'vala')).toBe(code);
  });

  test('Vala still removes a real // comment', () => {
    expect(run('int x = 1; // c', 'vala').trimEnd()).toBe('int x = 1;');
  });

  test('D token string q{...} keeps //', () => {
    const code = 'mixin(q{\n  int x; // inside token string\n});';
    expect(run(code, 'd')).toBe(code);
  });

  test('D still removes a real // comment and nested /+ +/', () => {
    expect(run('int x = 1; // c', 'd').trimEnd()).toBe('int x = 1;');
    expect(run('int x = 1; /+ a /+ b +/ c +/ y', 'd').replace(/\s+/g, ' ').trim())
      .toBe('int x = 1; y');
  });
});
