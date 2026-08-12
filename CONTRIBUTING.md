# Contributing to LeftOff

Thank you for your interest in contributing to LeftOff! We welcome all forms of contributions.

## Code of Conduct

Please be respectful and follow our [Code of Conduct](CODE_OF_CONDUCT.md) (standard Contributor Covenant).

## How Can You Contribute?

### Reporting Bugs

- Use the [issue tracker](https://github.com/AnandShah10/leftoff/issues)
- Include:
  - VS Code version
  - LeftOff version
  - Steps to reproduce
  - Expected vs actual behavior
  - Relevant logs from the "LeftOff" output channel

### Suggesting Features

- Open an issue with the **Feature Request** template
- Describe the use case and why it would be valuable
- Bonus points for mockups or examples

### Submitting Code Changes

1. Fork the repository
2. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make your changes following the project's style
4. Add or update tests where applicable
5. Update documentation (README.md, DEVELOPMENT.md, CHANGELOG.md)
6. Ensure the project builds cleanly (`npm run compile`)
7. Commit with a clear message
8. Push and open a Pull Request against the `main` branch

### Documentation Improvements

Improvements to documentation, especially user-facing README content, screenshots, or examples are highly valued.

## Development Setup

Please refer to the detailed [DEVELOPMENT.md](DEVELOPMENT.md) for:
- Project structure
- Local development workflow
- Packaging and publishing instructions
- Architecture overview

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include a clear description of what was changed and why
- Reference any related issues
- Ensure all existing functionality continues to work
- Update the CHANGELOG.md under the `[Unreleased]` section

## Release Process

Releases are managed by the maintainer:
- Version bumps follow semantic versioning
- CHANGELOG.md is the source of truth
- Marketplace publishing is done via `vsce publish`

## Questions?

Feel free to open a [Discussion](https://github.com/AnandShah10/leftoff/discussions) or reach out via issues.

---

**Thank you for helping make LeftOff better for the developer community!** 🚀
