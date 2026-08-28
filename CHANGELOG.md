# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pending (release-carrier infra)
- Consider adding `@deepseek-ai/dsh-session` to `peerDependencies` before the next release: `src` imports `SessionId` from it, and TS consumers may need the type to resolve.

## [0.1.1] - 2026-08-28

### Fixed
- Add `repository.url` to `package.json` so npm OIDC sigstore provenance verification can pass (E422).
- CI publish is idempotent: it skips the publish step when the version already exists on the registry, so re-tagging a released version does not fail with E403.
- CI installs deps with `--legacy-peer-deps` and runs `npm run typecheck` before publishing.

## [0.1.0] - 2026-08-26

### Added
- Initial release as a `dsh-plugin` community port.
