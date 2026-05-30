# Changelog

All notable changes to the Comment Bear project will be documented in this file.

## [Unreleased]

### Added
- Shared comment-removal engine (`removeBySpec` in `src/removers/_shared.ts`) that is aware of string/character literals, nested block comments, license/directive preservation and `keepEmptyLines`.
- 22 new languages: Shell/Bash, PowerShell, Perl (incl. POD blocks), R, TOML, Makefile, Dockerfile, INI, GraphQL, Elixir, Crystal, Julia, Nim, CoffeeScript, Tcl, CMake, Java `.properties`, Puppet, HCL/Terraform, SCSS, LESS, Sass.
- Language detection by shebang (`#!/usr/bin/env bash` → shell, etc.) and by special filename (`Makefile`, `Dockerfile`, `CMakeLists.txt`).
- `keepEmptyLines` support for HTML, CSS, XML, SQL and JSON removers.
- `mergeConfig` and `validateConfig` are now re-exported from the package entry point.
- 153 new tests (total 1196+).

### Fixed
- YAML: `#` is now only treated as a comment at line start or after whitespace, so values like `url: http://x#frag` and `color:#fff` are preserved.
- PHP: `#[Attribute]` (PHP 8 attributes) are no longer removed as comments.
- Go: `//go:build`, `//go:embed`, `//go:generate` directives are preserved (in addition to `// +build`).
- CSS: comment-like sequences inside string/`content` values (e.g. `content: "a/*b*/c"`) are no longer corrupted.
- SCSS/LESS/Sass: `//` line comments are now removed (previously left untouched because these mapped to the CSS remover).
- CLI: `--language` now truly forces the language even when the file extension is recognised.
- Inline comment removal no longer leaves trailing whitespace.

## [1.1.0] - 2026-03-16

### Added
- CLI tool (`comment-bear` command) with support for --in-place, --dry-run, --preserve-license, --keep-empty-lines flags
- Language support for Kotlin, Scala, and Haskell
- Additional unit tests (1043+ total)

### Changed
- N/A

### Fixed
- N/A

## [1.0.0] - 2024-10-31

### Changed
- Renamed package from `universal-comment-remover` to `comment-bear`

### Added
- Initial release of Universal Comment Remover
- Support for 18+ programming languages
- Automatic language detection by file extension and content
- Preserve license comments option
- Comprehensive test suite with 788+ tests
- Command Line Interface (CLI) support
- TypeScript type definitions

### Changed
- N/A (Initial release)

### Fixed
- N/A (Initial release)
