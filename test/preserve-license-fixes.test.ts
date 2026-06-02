import { removeComments } from '../src/index';

/**
 * Regression tests for preserveLicense / keepEmptyLines correctness bugs found
 * in the second audit pass.
 */
describe('preserveLicense / keepEmptyLines correctness', () => {
  describe('SQL preserveLicense must not delete following code (data loss)', () => {
    const sql = (code: string, preserveLicense = true) =>
      removeComments(code, { language: 'sql', preserveLicense }).code;

    test('code after a kept license block survives', () => {
      const code = '/* Copyright */\nSELECT 1;\nSELECT 2;';
      expect(sql(code)).toBe(code);
    });

    test('license block between statements keeps everything', () => {
      const code = 'SELECT 1;\n/* Copyright */\nSELECT 2;';
      expect(sql(code)).toBe(code);
    });

    test('multi-line license block keeps following code', () => {
      const code = '/* Copyright\n   2020 */\nSELECT 1;';
      expect(sql(code)).toBe(code);
    });

    test('a non-license block is still removed (and code kept)', () => {
      expect(sql('/* just a comment */\nSELECT 1;', false).trim()).toBe('SELECT 1;');
    });
  });

  describe('Rust preserveLicense keeps ordinary // and /* */ license comments', () => {
    const rust = (code: string) =>
      removeComments(code, { language: 'rust', preserveLicense: true }).code;

    test('line license comment kept', () => {
      const code = '// Copyright 2020\nlet x = 1;';
      expect(rust(code)).toBe(code);
    });

    test('block license comment kept', () => {
      const code = '/* Copyright 2020 */\nlet x = 1;';
      expect(rust(code)).toBe(code);
    });

    test('/// doc license comment kept', () => {
      const code = '/// Copyright\nlet x = 1;';
      expect(rust(code)).toBe(code);
    });

    test('a non-license comment is still removed', () => {
      expect(rust('// just a comment\nlet x = 1;').trim()).toBe('let x = 1;');
    });
  });

  describe('PHP honors keepEmptyLines for C-style comments', () => {
    test('a removed // comment leaves a blank line', () => {
      const code = '<?php\n$a = 1;\n// comment\n$b = 2;';
      expect(removeComments(code, { language: 'php', keepEmptyLines: true }).code)
        .toBe('<?php\n$a = 1;\n\n$b = 2;');
    });
  });
});
