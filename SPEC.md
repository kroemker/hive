# Hive — Feature Spec (v1)

## 1. Overview

Hive is a local desktop app that turns a git repository into a kanban board where
tickets can be handed off to automated coding agents (starting with Claude Code).
An agent works the ticket in an isolated git worktree, produces a local "PR" (a
diff against the base branch) for code tickets, or a written result for
non-code tickets. The human reviews the diff/result in-app — commenting,
requesting changes, approving — much like a GitHub PR review, but entirely
offline. All agent activity is logged and stored in a `.hive/` directory at
the repo root, which is committed to the repo's own git history.

Everything below is v1 scope unless marked **(future)**.

## 2. Core Concepts

- **Ticket** — a unit of work with a title, description/spec, acceptance
  criteria, type (`code` or `informational`), status, and full history.
- **Board** — the fixed set of columns (workflow states) tickets move through.
- **Agent Run** — one invocation of an agent against a ticket. A ticket may
  have many runs (initial attempt, then one per "request changes" cycle).
- **Local PR** — the diff between a ticket's branch and the base branch,
  reviewable inside the app.
- **Worktree** — an isolated git worktree + branch created per ticket so
  multiple agents can work in parallel without clobbering each other.

## 3. Workflow & State Machine

Fixed states (customizable workflows are a **(future)** item):

1. **conception** — ticket is being drafted: title, description, acceptance
   criteria. Not yet actionable. No branch/worktree exists yet.
2. **ready-for-implementation** — human has confirmed the ticket is clear and
   actionable. Queued for an agent to pick up.
3. **implementation** — an agent is assigned. On first entry, Hive creates a
   branch (`hive/<ticket-id>-<slug>`) off the configured base branch and a
   git worktree for it; on re-entry (from a request-changes/failed-test/
   answered-clarification cycle) the existing branch/worktree is reused. The
   agent works, commits, and signals completion. Ticket auto-advances to
   `code-review` when the agent finishes, or branches into one of two
   exception states instead of finishing normally:
   - **clarification** — the agent has a design/requirements question it
     needs a human answer for before it can continue (see below).
   - **failed** — the run errored/crashed (see §8).
4. **clarification** — the agent has paused mid-work pending human input.
   Its question(s) are shown on the ticket alongside whatever it has
   committed so far. The human answers as a comment. On answering, the
   ticket returns to `implementation`: the answer is compiled into the next
   run's prompt the same way review feedback is (see §6.3), and the run
   resumes in the same branch/worktree rather than starting over.
5. **code-review** — for `code` tickets, the human reviews the local PR
   (diff view, inline comments). For `informational` tickets, the human
   reviews the written result attached to the ticket. Two exits:
   - **Request changes** → back to `implementation`. All open review
     comments (inline + general) are compiled automatically into the prompt
     for the next agent run (see §6.3). Run counter increments.
   - **Approve** → `ready-for-test`.
6. **ready-for-test** — code is approved; queued for the human to actually
   run/exercise the change (manual or functional testing outside pure code
   review). Two exits:
   - **Testing fails** → back to `implementation` with a testing-failure
     note added as ticket context, same as a code-review "request changes".
   - **Testing passes** → `resolved`.
7. **resolved** — the ticket branch is merged into the base branch (merge
   strategy configurable: merge commit / squash / rebase), the worktree is
   torn down, and the ticket is archived/closed. Informational tickets
   "resolve" without a merge step — just closed.

`clarification` and `failed` are exception branches off `implementation`
rather than steps in the main linear path — a ticket can bounce in and out
of `implementation` several times before reaching `code-review`.

Every transition is recorded in a per-ticket audit log (who/what triggered
it, timestamp) independent of agent run transcripts.

## 4. Data Model & Storage (`.hive/`)

`.hive/` lives at the repo root and is **committed to the repo's git
history** — it travels with clones and remotes like any other project data.

```
.hive/
  config.yaml                 # base branch, agent defaults, merge strategy, etc.
  tickets/
    <ticket-id>/
      ticket.md                 # YAML front-matter (title, type, status, priority/
                                # labels, branch name, timestamps, run counter) +
                                # Markdown body (description, acceptance criteria)
      comments.jsonl           # general ticket comments (append-only)
      review/
        <run-id>.jsonl         # inline diff comments anchored to file+line+commit
      runs/
        <run-id>/
          meta.yaml            # agent, model, started/ended, tokens, cost,
                                # outcome (success | failed | needs_clarification)
          prompt.md             # exact prompt sent (incl. compiled review feedback)
          transcript.log        # full streamed agent output/log
          diff.patch            # snapshot of the diff at review time (audit trail)
      history.jsonl             # state-transition audit log
```

**Important:** worktrees are *not* stored under `.hive/`. They're actual git
worktrees (working files, build artifacts, etc.) and must never be committed.
They live outside the repo tree, e.g. an app-data directory or
`../.hive-worktrees/<repo-id>/<ticket-id>/`, with git's own worktree metadata
under `.git/worktrees/` as usual. `.hive/` itself stays pure metadata.

Secrets (API keys, tokens) are **never** stored in `.hive/` since it's
committed to git. They're stored in the OS keychain (Electron `safeStorage`,
backed by Keychain / Credential Manager / Secret Service depending on OS),
with an encrypted-local-file fallback for Linux environments without a
keyring daemon.

Tickets use YAML-front-matter Markdown + JSONL rather than a database so the
whole board is diffable and mergeable via normal git, and prose fields
(description, acceptance criteria) read and diff like normal Markdown — this
also means two people syncing `.hive/` through a shared remote get real (if
occasionally conflicting) git merges instead of a binary blob.

## 5. Git Integration

- One branch + worktree per ticket, created on entering `implementation`.
- Base branch is configurable (defaults to `main`/`master`).
- If the base branch has advanced since the ticket branch was created, Hive
  flags this in the review view and offers a rebase/update-branch action
  before merge (agent can be asked to resolve conflicts as a follow-up run).
- Merge strategy is configurable per-repo (merge commit / squash / rebase),
  applied locally on entering `resolved`.
- Stale worktrees (abandoned/failed tickets) are cleaned up via an explicit
  "discard ticket" action, not silently.

## 6. Agent Execution

### 6.1 Agent abstraction
Agents are behind a provider interface (`AgentProvider`) so Claude Code is
the first implementation but others can be added **(future)**. v1 ships only
the Claude Code provider (via the TypeScript Claude Agent SDK, in-process —
no shelling out to a CLI) — the interface is designed generically, but a
second provider isn't stubbed until one actually exists, since a mock
wouldn't exercise real constraints like streaming shape or permission
prompts. A provider receives: ticket spec, acceptance criteria, compiled
review feedback (if any), and the worktree path; it streams events back
(log lines, tool calls, file diffs, completion/failure/clarification-needed)
that Hive persists to `runs/<run-id>/`.

### 6.2 Permissions / sandboxing
Per-project config controls what the agent may do autonomously inside its
worktree (mirrors Claude Code's permission modes) — e.g. auto-approve file
edits and local test/build commands within the worktree, but require
explicit human approval for anything touching the network or outside the
worktree.

### 6.3 Review-feedback / clarification-answer compilation
On re-entering `implementation` — whether from a "request changes", a failed
test, or an answered `clarification` — Hive compiles the relevant context
into a structured section of the next prompt: unresolved inline comments
(file, line, quoted code, comment text), general ticket comments, any
testing-failure note, or the agent's own question(s) plus the human's
answer. This is one mechanism reused for every "hand control back to the
agent with new information" transition.

### 6.4 Cost/telemetry
Each run records token usage and estimated cost; totals roll up per ticket
and per board for visibility.

### 6.5 Control
Human can cancel a running agent, and manually retry/re-run a failed or
unsatisfying attempt without going through a full "request changes" cycle.

## 7. Local PR / Diff Review UI

- File-tree + unified/split diff, syntax highlighted.
- Inline comments anchored to `(file, line, commit-sha)`; comments become
  "outdated" (but stay visible) if the underlying line changes in a later
  commit, matching GitHub's behavior.
- Comment threads can be resolved/unresolved.
- Review actions: **Approve**, **Request changes**, plus general summary
  comments not tied to a specific line.
- For `informational` tickets, this becomes a simpler "review the written
  result" screen instead of a diff.

## 8. Failure Handling

If an agent run errors or crashes mid-way, the ticket does **not** silently
sit in `implementation`. It surfaces as a distinct, clearly-flagged failed
state with the error/log visible, and a manual "retry" action. This is a gap
in the original state list worth calling out explicitly.

## 9. Automated Pre-Review Checks (recommended addition)

Optionally configure build/lint/test commands to run automatically the
moment a ticket enters `code-review`, with pass/fail shown alongside the
diff — so the human reviewer isn't the only gate for basic correctness, and
the agent gets fast automated feedback before a human even looks at it
**(could also run as a pre-check before *leaving* implementation, blocking
entry to code-review on failure — worth deciding during implementation
planning)**.

## 10. Desktop App UI/UX

- **Board view**: columns per state, cards per ticket, action buttons for
  valid transitions (not free drag-drop, since transitions have side effects
  like creating worktrees or merging).
- **Ticket detail view**: spec/description editor, acceptance criteria,
  comments, run history (expandable transcripts), diff/review tab.
- **Live run view**: streaming agent output while a run is in progress.
- **Settings**: base branch, merge strategy, agent provider + credentials,
  permission mode, worktree location.
- **Notifications**: desktop notification when a run finishes, fails, or
  needs approval for a gated action.

## 11. Other Features Worth Including

- Ticket templates (bug / feature / chore) with structured fields.
- Labels, priority, simple search/filter on the board.
- Definition-of-done / acceptance criteria field that seeds both the agent
  prompt and a code-review checklist.
- Manual override: human can always hand-edit code directly in the
  ticket's worktree alongside/instead of the agent.

## 12. Deferred / Future Ideas

- Customizable workflows (custom states/columns).
- Additional agent providers beyond Claude Code.
- Subtask/dependency graphs between tickets (blocked-by).
- Multi-repo boards in one app instance.
- External issue tracker sync (GitHub Issues/Jira import-export).
- Cycle-time / reporting analytics.
- Multi-user concurrent editing of one board (beyond "git merge the metadata").

## 13. Implementation Decisions

- **Tech stack**: Electron + Node/TypeScript. The Claude Agent SDK (TS) runs
  in-process; git operations use a Node git library/CLI wrapper.
- **Ticket file format**: YAML front-matter + Markdown body (`ticket.md` per
  ticket) — structured fields up top, prose (description, acceptance
  criteria) as the Markdown body.
- **Secrets storage**: OS keychain via Electron `safeStorage`, with an
  encrypted-local-file fallback where no OS keyring is available.
- **Provider scope for v1**: Claude Code only. The `AgentProvider` interface
  is designed for multiple providers, but a second one is built only when a
  real candidate exists.

## 14. Open Questions Still Remaining

- Exact `AgentProvider` interface shape (event/message schema) — to be
  drafted alongside the first implementation rather than speculatively.
- Whether pre-review automated checks (§9) gate entry to `code-review` or
  just annotate it.
