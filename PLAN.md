# Hive — Implementation Plan (v1)

This plan sequences work from `SPEC.md` into phases that each produce a
demoable increment. Phases are ordered so every later phase builds on a
working, testable foundation rather than integrating everything at once.
Roughly: data layer → board UI → git plumbing → review UI → agent → the
exception states that depend on the agent existing → settings/polish →
packaging.

## Phase 0 — Project scaffolding

- Electron + TypeScript project (`electron-vite` + React for the renderer).
- ESLint/Prettier, `vitest` for unit tests, `playwright` wired for E2E later.
- Main/renderer/preload process split with a typed IPC bridge (renderer
  never touches the filesystem or spawns processes directly).
- Empty window that opens and can pick a folder (a git repo) from disk.

**Demo:** app launches, lets you pick a repo folder, shows its path.

## Phase 1 — Data layer (`.hive/`)

- TypeScript types for `Ticket`, `Comment`, `HistoryEntry`, `Run`, `Config`
  matching `SPEC.md` §4.
- Parser/serializer for YAML-front-matter Markdown tickets, and JSONL
  readers/writers for `comments.jsonl` / `history.jsonl` / `review/*.jsonl`.
- `HiveRepo` module: detect/init `.hive/` at a repo's top level, CRUD for
  tickets, append-only writers for comments/history.
- No UI beyond a debug view — this phase is unit-tested directly.

**Demo:** create/edit/list tickets via a test script against a real repo's
`.hive/` folder; files are readable/diffable by hand.

## Phase 2 — Board UI (no git/agent yet)

- Board view: fixed columns from the state machine, cards from `HiveRepo`.
- Ticket detail view: edit title/description/acceptance criteria/labels.
- Manual transitions that don't need git yet: `conception →
  ready-for-implementation`. Every transition writes a `history.jsonl` entry.
- General (non-inline) comments on a ticket.

**Demo:** create a ticket end-to-end through the UI, see it move columns,
see the audit history, all persisted to `.hive/` and visible in `git diff`.

## Phase 3 — Git integration (worktrees, branches, merge)

- `WorktreeManager`: create/list/remove a git worktree + branch per ticket
  (`hive/<ticket-id>-<slug>`, off the configured base branch).
- Wire `ready-for-implementation → implementation` to create the
  branch/worktree (still no agent — this proves the git plumbing in
  isolation; make some manual edit in the worktree via an external editor to
  validate it).
- `resolved`: merge action (merge commit / squash / rebase per config),
  worktree teardown.
- Base-branch-drift detection (base moved since branch creation) surfaced as
  a warning, with a manual rebase/update action.

**Demo:** move a ticket to `implementation`, see a real branch + worktree
appear on disk, hand-edit a file in it, move to `resolved`, see it merged
into the base branch and the worktree cleaned up.

## Phase 4 — Local PR / diff review UI

- Diff engine: compute ticket-branch-vs-base-branch diff (via git plumbing).
- File tree + diff viewer (syntax highlighted, unified view to start).
- Inline comments anchored to `(file, line, commit-sha)`, stored in
  `review/<run-id>.jsonl`; mark comments "outdated" when their anchor line
  changes in a later commit.
- Thread resolve/unresolve.
- `code-review` actions: **Approve** → `ready-for-test`; **Request changes**
  → `implementation` (comments recorded, no agent to consume them yet).
- `ready-for-test` actions: **Testing passes** → `resolved`; **Testing
  fails** → `implementation`.
- Informational-ticket variant: a simple "review the written result" screen
  instead of a diff.

**Demo:** manually edit a worktree, review the resulting diff in-app, leave
inline comments, request changes, see the ticket bounce back with comments
attached — the whole non-agent human loop works.

## Phase 5 — Agent execution (Claude Code provider)

- `AgentProvider` interface: input = ticket spec + acceptance criteria +
  compiled feedback (§6.3) + worktree path; output = a stream of events
  (log lines, tool calls, file diffs, `success` / `failed` /
  `needs_clarification`).
- `ClaudeCodeProvider`: implemented against the TypeScript Claude Agent SDK,
  running in-process against the ticket's worktree, with the permission
  mode from §6.2 (auto-approve edits/tests within the worktree, gate
  anything else).
- Prompt construction from ticket data; §6.3 compiler for review feedback
  (used for the request-changes loop from Phase 4).
- Persist every run to `runs/<run-id>/` (`meta.yaml`, `prompt.md`,
  `transcript.log`); stream the same events to a live run view in the UI.
- Cost/token telemetry per run, rolled up per ticket/board.
- Cancel a running agent; manually retry a run.

**Demo:** move a ticket to `implementation`, the agent actually runs against
the worktree, produces commits, and the ticket auto-advances to
`code-review` with a real transcript attached — the "request changes" loop
from Phase 4 now actually re-invokes the agent with the review compiled in.

## Phase 6 — Clarification & failure states

*(Deferred until Phase 5 exists — both are things the agent triggers, not
independently buildable.)*

- `clarification`: surface the agent's question(s) + partial work, human
  answer box, resume wired through the §6.3 compiler back into
  `implementation` in the same branch/worktree.
- `failed`: surface error/log clearly, manual retry action — never leave a
  ticket silently stuck.

**Demo:** force an agent run to ask a question and separately force one to
error, and confirm both recover correctly back into `implementation`.

## Phase 7 — Settings & secrets

- Settings screen: base branch, merge strategy, permission mode, worktree
  location.
- Credential storage via Electron `safeStorage` (OS keychain), with an
  encrypted-local-file fallback where no keyring is available.
- First-run flow: pick/init a repo, enter agent credentials.

**Demo:** fresh install → point at a repo → enter an API key → it's usable
without ever touching `.hive/` or a plaintext file with the key in it.

## Phase 8 — v1 polish

- Automated pre-review checks (configurable build/lint/test commands run on
  entering `code-review`), shown alongside the diff.
- Desktop notifications (run finished / failed / needs approval).
- Ticket templates, labels/priority, board search/filter.
- Manual override: open a ticket's worktree in the user's editor directly.

## Phase 9 — Packaging

- `electron-builder` targets for macOS/Windows/Linux.
- Manual smoke test of a packaged build against a real repo before calling
  v1 done.

## Testing strategy throughout

- Unit tests (`vitest`) for the data layer, state machine transitions, and
  the §6.3 feedback compiler — these are pure logic and should be the
  best-covered part of the codebase.
- Integration tests for `WorktreeManager` and the diff engine against real
  throwaway git repos (fixtures created/destroyed per test).
- E2E (`playwright`, already available in this environment) for the board →
  implementation → review → merge happy path, added once Phase 4 lands.
- Agent-provider tests are the hardest to automate meaningfully (real model
  calls are slow/costly); cover them with a fake/replay transport that
  replays recorded SDK event streams, exercised manually against the real
  provider before each release rather than in CI.

## Sequencing notes

- Phases 0–4 deliberately contain **zero agent code** — the entire human
  workflow (tickets, git, review, merge) should work by hand-editing
  worktrees before any agent is wired in. This isolates the hardest/newest
  part of the system (Phase 5) from the git/data plumbing.
- Phase 6 depends on Phase 5 existing; don't build clarification/failure
  handling against a mock agent — it won't exercise the real event shapes.
- Settings/secrets (Phase 7) can technically move earlier if credential
  entry blocks testing Phase 5 in practice — build a minimal
  env-var-based credential path first if needed, and swap to `safeStorage`
  when Phase 7 arrives properly.
