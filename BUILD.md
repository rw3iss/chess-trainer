# BUILD.md — monorepo

Monorepo-wide rules. Each app has its own, more detailed rules:
- Web: `apps/web/BUILD.md` + `apps/web/DESIGN.md` + `apps/web/COMPONENT_INDEX.md`
- Server: `apps/server/BUILD.md` + `apps/server/DESIGN.md`

## Rules
- **Shared logic lives in `packages/core`.** If client and server both need it (chess rules, game model, clock, engine UCI parsing, strength mapping, protocol types), it goes in core — never duplicated.
- **Dependency direction:** apps → core. Core depends only on `chessops`.
- **Contracts first:** change `packages/core/src/*/types.ts` + `packages/core/API.md` together.
- **Tests:** vitest in core/tools/web, jest in server. Every core function has unit tests.
- **Indentation:** tabs (width 4); YAML 2 spaces (`.editorconfig`).
- **Docs:** update README / BUILD / DESIGN / API.md in the same change as the behaviour.
- **Licenses:** third-party data/assets keep their license notes next to them (`apps/web/public/pieces/LICENSES.md`, `apps/web/public/data/ATTRIBUTION.md`).
