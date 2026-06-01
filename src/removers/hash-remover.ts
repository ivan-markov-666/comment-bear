/**
 * Removers for hash-comment (`#`) and related "Phase 1" languages.
 *
 * Every function here is a thin wrapper that delegates to the generic
 * `removeBySpec` engine in `_shared.ts` with a language-specific
 * `CommentSpec`. The only exception is Perl, which has an additional
 * POD-block pre-pass before the generic engine runs.
 */

import { removeBySpec, isLicenseComment, CommentSpec } from './_shared';

/**
 * Removes comments from Shell / Bash code.
 *
 * Line comments start with `#`. Double-quoted strings allow `\` escapes and
 * single-quoted strings are literal (no escaping).
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeShellComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    // In shell a `#` only starts a comment at the start of a word, i.e. at the
    // start of a line or immediately after whitespace. This protects `$#`,
    // `${#arr}`, `$((2#101))` and mid-word `a#b`.
    line: [{ token: '#', requireWhitespaceBefore: true }],
    strings: [
      { open: '"', close: '"', escape: '\\' },
      { open: "'", close: "'", escape: null },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from PowerShell code.
 *
 * Line comments start with `#`, block comments are delimited by `<#` and `#>`.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removePowerShellComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  if (!code) return code;

  // Pre-pass: protect here-string regions (`@"..."@` / `@'...'@`). A `#`
  // inside a here-string is literal text, not a comment, but here-strings are
  // multi-line and cannot be expressed as a single-line string delimiter. We
  // replace each here-string region with an opaque placeholder, run the
  // generic engine, then restore the regions verbatim.
  const { masked, regions } = maskPowerShellHereStrings(code);

  const spec: CommentSpec = {
    line: [{ token: '#' }],
    block: [{ open: '<#', close: '#>' }],
    strings: [
      { open: '"', close: '"' },
      { open: "'", close: "'", escape: null },
    ],
  };
  let out = removeBySpec(masked, spec, preserveLicense, keepEmptyLines);

  for (let k = 0; k < regions.length; k++) {
    // Match the core token and absorb the (optional) padding spaces the mask
    // added — the engine may have trimmed a trailing space on the line.
    const re = new RegExp(' ?' + placeholderCore(k) + ' ?');
    out = out.replace(re, () => regions[k]);
  }
  return out;
}

/** The core letters/digits token for the k-th here-string region. */
function placeholderCore(k: number): string {
  return 'CBHERESTRING' + String(k);
}

/** Builds the opaque placeholder token (with padding) for region `k`. */
function herePlaceholder(k: number): string {
  // Surrounded by spaces and built from letters/digits only (no `#`, `"`,
  // `'`, `<`, `>`) so the engine treats it as inert, isolated identifier text.
  return ' ' + placeholderCore(k) + ' ';
}

/**
 * Replaces PowerShell here-string regions with opaque placeholders so the
 * generic comment engine cannot misread a `#` inside one as a comment.
 *
 * A here-string opens with `@"` or `@'` as the last non-whitespace token on a
 * line and closes on a line that begins (column 0) with the matching `"@` or
 * `'@`. The whole region (opener line through closer token) is captured and
 * replaced with {@link herePlaceholder}; the captured text is restored
 * verbatim afterwards.
 */
function maskPowerShellHereStrings(code: string): {
  masked: string;
  regions: string[];
} {
  const regions: string[] = [];
  let masked = '';
  let i = 0;
  const len = code.length;

  while (i < len) {
    // Detect an opener `@"` or `@'` that is the last token on its line.
    if (code[i] === '@' && (code[i + 1] === '"' || code[i + 1] === "'")) {
      const quote = code[i + 1];
      // Everything after the opener up to the newline must be whitespace.
      let k = i + 2;
      while (k < len && code[k] !== '\n' && (code[k] === ' ' || code[k] === '\t' || code[k] === '\r')) {
        k++;
      }
      if (k >= len || code[k] === '\n') {
        // Valid opener. Find the closing line that starts with `"@`/`'@`.
        const closer = quote + '@';
        // Begin scanning after the opener line's newline.
        let lineStart = code.indexOf('\n', i);
        if (lineStart !== -1) {
          lineStart += 1;
          let end = -1;
          let p = lineStart;
          while (p <= len) {
            if (code.startsWith(closer, p)) {
              end = p + closer.length;
              break;
            }
            const nextNl = code.indexOf('\n', p);
            if (nextNl === -1) break;
            p = nextNl + 1;
          }
          if (end !== -1) {
            const region = code.substring(i, end);
            masked += herePlaceholder(regions.length);
            regions.push(region);
            i = end;
            continue;
          }
        }
      }
    }
    masked += code[i];
    i++;
  }

  return { masked, regions };
}

/**
 * Removes comments from Perl code.
 *
 * Performs a POD-block pre-pass (consecutive lines from `=word` through `=cut`)
 * before the generic `#` line-comment removal. POD blocks are dropped unless
 * they are license blocks and `preserveLicense` is set; when `keepEmptyLines`
 * is set, dropped POD lines are replaced with blank lines.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removePerlComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  if (!code) return code;

  const withoutPod = removePodBlocks(code, preserveLicense, keepEmptyLines);

  const spec: CommentSpec = {
    line: [{ token: '#' }],
    strings: [
      { open: '"', close: '"' },
      { open: "'", close: "'", escape: null },
    ],
  };
  return removeBySpec(withoutPod, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes Perl POD documentation blocks.
 *
 * A POD block runs from a line matching `^=[a-zA-Z]\w*` through a line
 * matching `^=cut\b` inclusive. Blocks are removed unless they look like a
 * license comment and `preserveLicense` is set; dropped blocks are replaced
 * with blank lines when `keepEmptyLines` is set.
 *
 * @param code - Input Perl code
 * @param preserveLicense - Whether to keep license POD blocks
 * @param keepEmptyLines - Whether to keep blank lines where POD blocks were
 * @returns Code with POD blocks removed
 */
function removePodBlocks(
  code: string,
  preserveLicense: boolean,
  keepEmptyLines: boolean
): string {
  const lines = code.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (/^=[a-zA-Z]\w*/.test(line)) {
      // Collect the whole POD block up to and including the =cut line.
      const block: string[] = [];
      while (i < lines.length) {
        block.push(lines[i]);
        if (/^=cut\b/.test(lines[i])) {
          i++;
          break;
        }
        i++;
      }

      const blockText = block.join('\n');
      if (preserveLicense && isLicenseComment(blockText)) {
        result.push(...block);
      } else if (keepEmptyLines) {
        for (let k = 0; k < block.length; k++) {
          result.push('');
        }
      }
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

/**
 * Removes comments from R code.
 *
 * Line comments start with `#`.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeRComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    strings: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from TOML code.
 *
 * Line comments start with `#`. Supports multiline `"""` and `'''` strings as
 * well as ordinary single- and double-quoted strings.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeTomlComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    strings: [
      { open: '"""', close: '"""', multiline: true },
      { open: "'''", close: "'''", multiline: true, escape: null },
      { open: '"', close: '"' },
      { open: "'", close: "'", escape: null },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from Makefile code.
 *
 * Line comments start with `#`.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeMakefileComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    // In a Makefile a backslash escapes the `#` to a literal (`a\#b`), so an
    // escaped `#` is not a comment.
    line: [{ token: '#', ignoreIfEscaped: true }],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from Dockerfile code.
 *
 * Line comments start with `#`. Parser directives such as `# syntax=...` and
 * `# escape=...` on the first lines are preserved.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeDockerfileComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    preserve: [/^#\s*(syntax|escape)=/i],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from INI code.
 *
 * Line comments start with `#` or `;`.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeIniComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }, { token: ';' }],
    strings: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from GraphQL code.
 *
 * Line comments start with `#`. Triple-quoted `"""` block strings (descriptions)
 * are copied verbatim, as are ordinary double-quoted strings.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeGraphqlComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    strings: [
      { open: '"""', close: '"""', multiline: true },
      { open: '"', close: '"' },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from Elixir code.
 *
 * Line comments start with `#`. Triple-quoted `"""` heredocs are copied
 * verbatim, as are ordinary double-quoted strings.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeElixirComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    // Elixir char literals are written `?X` (or `?\n`); `?#` is the char `#`,
    // not a comment. Protect the `?` + next-char pair.
    charLiteralPrefixes: ['?'],
    strings: [
      { open: '"""', close: '"""', multiline: true },
      { open: '"', close: '"' },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from Crystal code.
 *
 * Line comments start with `#`.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeCrystalComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    strings: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from Julia code.
 *
 * Line comments start with `#`, block comments are delimited by `#=` and `=#`
 * and may nest. Triple-quoted `"""` strings are copied verbatim.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeJuliaComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    block: [{ open: '#=', close: '=#', nested: true }],
    strings: [
      { open: '"""', close: '"""', multiline: true },
      { open: '"', close: '"' },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from Nim code.
 *
 * Line comments start with `#`, block comments are delimited by `#[` and `]#`
 * and may nest. Triple-quoted `"""` strings are copied verbatim.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeNimComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    block: [{ open: '#[', close: ']#', nested: true }],
    strings: [
      { open: '"""', close: '"""', multiline: true },
      { open: '"', close: '"' },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from CoffeeScript code.
 *
 * Line comments start with `#`, block comments are delimited by `###` ... `###`.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeCoffeeScriptComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    block: [{ open: '###', close: '###' }],
    strings: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from Tcl code.
 *
 * Line comments start with `#`.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeTclComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    strings: [{ open: '"', close: '"' }],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from CMake code.
 *
 * Line comments start with `#`, block comments are delimited by `#[[` ... `]]`.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeCMakeComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    block: [{ open: '#[[', close: ']]' }],
    strings: [{ open: '"', close: '"' }],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from Java/.properties files.
 *
 * Line comments start with `#` or `!`.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removePropertiesComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    // In a `.properties` file a backslash escapes the comment char to a
    // literal (`a\#b`), so an escaped `#`/`!` is not a comment.
    line: [
      { token: '#', ignoreIfEscaped: true },
      { token: '!', ignoreIfEscaped: true },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from Puppet code.
 *
 * Line comments start with `#`, block comments are delimited by `/*` ... `*\/`.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removePuppetComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }],
    block: [{ open: '/*', close: '*/' }],
    strings: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from HCL / Terraform code.
 *
 * Line comments start with `#` or `//`, block comments are delimited by
 * `/*` ... `*\/`.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeHclComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  const spec: CommentSpec = {
    line: [{ token: '#' }, { token: '//' }],
    block: [{ open: '/*', close: '*/' }],
    strings: [{ open: '"', close: '"' }],
  };
  return removeBySpec(code, spec, preserveLicense, keepEmptyLines);
}

/**
 * Shared CSS-preprocessor spec used by SCSS, LESS and Sass.
 *
 * Line comments start with `//`, block comments are delimited by `/*` ... `*\/`.
 */
const CSS_PREPROCESSOR_SPEC: CommentSpec = {
  line: [{ token: '//' }],
  block: [{ open: '/*', close: '*/' }],
  strings: [
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
};

/**
 * Removes comments from SCSS code.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeScssComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  return removeBySpec(code, CSS_PREPROCESSOR_SPEC, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from LESS code.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeLessComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  return removeBySpec(code, CSS_PREPROCESSOR_SPEC, preserveLicense, keepEmptyLines);
}

/**
 * Removes comments from Sass code.
 *
 * @param code - Input code
 * @param preserveLicense - Whether to preserve license comments
 * @param keepEmptyLines - Whether to keep empty lines where comments were
 * @returns Processed code
 */
export function removeSassComments(
  code: string,
  preserveLicense: boolean = false,
  keepEmptyLines: boolean = false
): string {
  return removeBySpec(code, CSS_PREPROCESSOR_SPEC, preserveLicense, keepEmptyLines);
}
