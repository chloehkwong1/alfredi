---
ticket: worktree-source-selector
title: Worktree Source Selector (Branch/PR/Linear Ticket)
branch: chloe/worktree-source-selector
created: 2026-03-11
---

# Worktree Source Selector - Sectioned Plan

## Requirements

> When creating a new worktree, allow users to select from four sources: **New Branch** (current behavior, default tab), **Existing Branch** (searchable picker), **GitHub PR** (list open PRs, check out their branch), or **Linear Ticket** (search tickets, auto-generate branch name). Modeled after Conductor.build's worktree creation flow.

## Acceptance Criteria

- [ ] Modal has 4 tabs: New Branch | Branch | PR | Ticket
- [ ] New Branch tab preserves current text-input behavior (default tab)
- [ ] Branch tab shows searchable list of local+remote branches, selecting one creates worktree on that branch
- [ ] PR tab shows open GitHub PRs (via `gh pr list`), selecting one creates worktree on the PR's branch
- [ ] Ticket tab shows Linear tickets assigned to the user, selecting one auto-generates a branch name (e.g. `ros-123-ticket-title-slug`)
- [ ] Linear API key configurable in Settings with validation
- [ ] PR and Ticket tabs show appropriate auth/install warnings when gh CLI or Linear API key not configured
- [ ] All tabs support SSH remote execution where applicable
- [ ] Branch name is always editable before confirming creation (auto-filled from selection)

## Decisions

- Linear integration via **direct API key** (personal token stored in settings), not MCP tools
- 4-tab layout: New Branch (default) | Branch | PR | Ticket
- All three source types in initial scope
- `gh pr list --json` for PR listing (established gh CLI pattern)
- Linear REST API v1 (`https://api.linear.app/graphql`) for ticket fetching

---

## Section 1/5: GitHub PR List — IPC Backend

### Context:

- gh CLI integration pattern is established: `git:checkGhCli`, `git:createPR` handlers exist
- Need new `git:listPRs` handler using `gh pr list --json number,title,headRefName,author,state,url,isDraft`
- Follow existing SSH-aware handler pattern

### Files to read:

- `src/main/ipc/handlers/git.ts` — existing `git:createPR` and `git:checkGhCli` handlers for pattern reference
- `src/main/preload/git.ts` — preload API surface for git namespace
- `src/renderer/services/git.ts` — renderer git service wrapper

### Files to modify:

- `src/main/ipc/handlers/git.ts`
- `src/main/preload/git.ts`
- `src/renderer/services/git.ts`
- `src/renderer/types/index.ts` (or wherever `GhCliStatus` is defined — add `GitHubPR` type)

### Changes:

**types (renderer or shared)** — Add PR type:

- Add `GitHubPR` interface: `{ number, title, headRefName, author: { login }, state, url, isDraft }`

**git.ts (main handler)** — Add `git:listPRs` handler:

- Accept `(cwd: string, sshRemoteId?: string, ghPath?: string)` parameters
- Check gh CLI first (reuse existing check logic)
- Run `gh pr list --json number,title,headRefName,author,state,url,isDraft --limit 50` in `cwd`
- Parse JSON output, return `{ success: true, prs: GitHubPR[] }` or `{ success: false, error: string }`
- Support SSH remote: if `sshRemoteId`, execute via SSH wrapper

**preload/git.ts** — Expose new method:

- Add `listPRs: (cwd, sshRemoteId?, ghPath?) => ipcRenderer.invoke('git:listPRs', ...)`

**services/git.ts** — Add renderer wrapper:

- Add `listPRs(cwd, sshRemoteId?)` method returning `Promise<GitHubPR[]>`
- Use `createIpcMethod()` pattern with empty array default

### Verify:

```bash
npm run lint          # type checking passes
npm run test          # no regressions
```

Say **"next section"** when ready.

---

## Section 2/5: Linear API Integration — Settings + IPC Backend

### Context:

- No Linear integration exists in the codebase. Need to add:
  1. Linear API key setting (stored via existing settings infrastructure)
  2. IPC handlers for Linear ticket search/list
- Linear uses GraphQL API at `https://api.linear.app/graphql`
- Need to fetch: issues assigned to the authenticated user, with title, identifier, state, team

### Files to read:

- `src/renderer/hooks/useSettings.ts` — how settings are stored and loaded
- `src/main/index.ts` — where IPC handlers are registered, settings store
- `src/renderer/components/SettingsModal.tsx` — where to add Linear API key field

### Files to modify:

- `src/renderer/hooks/useSettings.ts` — add `linearApiKey` setting
- `src/renderer/components/SettingsModal.tsx` — add Linear API key input field (in integrations/connections section)
- `src/main/ipc/handlers/git.ts` (or new `src/main/ipc/handlers/linear.ts`) — add Linear IPC handlers
- `src/main/preload/git.ts` (or new preload namespace) — expose Linear API
- `src/main/index.ts` — register Linear handlers if separate file
- `src/renderer/types/index.ts` — add `LinearTicket` type

### Changes:

**types** — Add Linear types:

- `LinearTicket`: `{ id, identifier, title, state: { name, color }, team: { key }, url, branchName }`
- Note: Linear's API returns a `branchName` field on issues — use this if available, else generate from identifier + title

**useSettings.ts** — Add setting:

- Add `linearApiKey: string` to settings (default empty string)
- Add getter/setter following existing pattern

**SettingsModal.tsx** — Add UI:

- Add "Linear API Key" field in an appropriate section (Integrations or similar)
- Password-type input with show/hide toggle
- "Test" button that calls `linear:validateKey` to verify the key works
- Link to Linear settings page for generating API keys

**IPC handlers** — Add Linear handlers (prefer new `linear.ts` file if > 2 handlers):

- `linear:validateKey(apiKey)` — POST to Linear GraphQL with `{ query: "{ viewer { id name } }" }`, return `{ valid: true, user: { name } }` or `{ valid: false, error }`
- `linear:listMyIssues(apiKey)` — Fetch issues assigned to viewer, filtered to active states (Triage, In Progress, Todo, Backlog). Query: `viewer { assignedIssues(first: 50, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id identifier title branchName state { name color } team { key } url } } }`
- `linear:searchIssues(apiKey, query)` — Search with `issueSearch(query: $query, first: 20)` for the search-as-you-type feature

**preload** — Expose:

- Add `linear` namespace to preload: `validateKey`, `listMyIssues`, `searchIssues`

### Verify:

```bash
npm run lint          # type checking passes
npm run test          # no regressions
```

Say **"next section"** when ready.

---

## Section 3/5: Refactor CreateWorktreeModal — Tabbed Layout

### Context:

- Current `CreateWorktreeModal.tsx` is a simple single-input modal (~300 lines)
- Need to refactor into a tabbed interface with 4 tabs
- The "New Branch" tab preserves the exact current behavior
- Other tabs will be stubbed in this section, filled in Section 4

### Files to read:

- `src/renderer/components/CreateWorktreeModal.tsx` — current implementation (already read)
- `src/renderer/constants/modalPriorities.ts` — check if priority needs adjustment (modal is now larger)
- Look for existing tab/segmented-control components in the codebase to reuse

### Files to modify:

- `src/renderer/components/CreateWorktreeModal.tsx` — major refactor

### Changes:

**CreateWorktreeModal.tsx** — Refactor to tabbed layout:

- Add tab state: `type WorktreeSourceTab = 'new-branch' | 'branch' | 'pr' | 'ticket'`
- Default tab: `'new-branch'`
- Widen modal from `max-w-md` to `max-w-lg` to accommodate lists
- Add segmented tab bar below header: `New Branch | Branch | PR | Ticket`
  - Each tab has an icon: `GitBranch`, `GitBranch`, `GitPullRequest`, `Ticket` (from lucide-react)
- Tab content area with min-height to prevent layout jumps
- **New Branch tab**: Extract current branch-name input + validation into this tab (preserves exact current behavior)
- **Branch tab**: Stub with "Loading branches..." placeholder
- **PR tab**: Stub with "Loading PRs..." placeholder
- **Ticket tab**: Stub with "Loading tickets..." placeholder
- Shared footer: branch name preview + Create button (same as current)
- Add `selectedBranchName` state that all tabs write to (the branch name that will be created)
- The `onCreateWorktree` callback still receives a branch name string — no interface change needed

**Interaction model**:

- Selecting an item in Branch/PR/Ticket tabs auto-fills `selectedBranchName`
- User can always edit the branch name before creating
- Create button uses `selectedBranchName` regardless of which tab populated it

### Verify:

```bash
npm run lint          # type checking passes
npm run dev           # manually test: modal opens, New Branch tab works identically to before
```

Say **"next section"** when ready.

---

## Section 4/5: Branch, PR, and Ticket Tab Implementations

### Context:

- Section 3 created the tabbed shell with stubs
- Now implement the content for each tab
- All three tabs share a pattern: fetch list → render searchable list → selection sets branch name

### Files to read:

- `src/renderer/components/CreateWorktreeModal.tsx` — the refactored modal from Section 3
- `src/renderer/services/git.ts` — `getBranches()` and `listPRs()` methods
- `src/renderer/hooks/useSettings.ts` — to read `linearApiKey`

### Files to modify:

- `src/renderer/components/CreateWorktreeModal.tsx` — implement tab contents (or extract into sub-components if the file gets too large)

### Changes:

**Branch Tab**:

- On tab activation: call `gitService.getBranches(session.cwd, sshRemoteId)`
- Show searchable list with text filter (simple `input` + filtered array)
- Each item shows branch name, highlight if it matches current filter
- Clicking a branch sets `selectedBranchName` to that branch
- Selected item gets visual highlight (accent border or background)
- Loading state while fetching, error state if fetch fails

**PR Tab**:

- On tab activation: check gh CLI status, then call `gitService.listPRs(session.cwd, sshRemoteId)`
- If gh CLI not installed/authenticated: show warning with install link (reuse existing pattern from the modal)
- Show searchable list: each item shows `#number title` with author and draft badge
- Clicking a PR sets `selectedBranchName` to `pr.headRefName`
- Loading/error states

**Ticket Tab**:

- On tab activation: read `linearApiKey` from settings
- If no API key: show setup prompt with link to Settings
- If API key present: call `window.maestro.linear.listMyIssues(apiKey)` on mount, render list
- Add search input that calls `window.maestro.linear.searchIssues(apiKey, query)` with debounce (300ms)
- Each item shows: `identifier` badge, title, state color dot, team key
- Clicking a ticket sets `selectedBranchName` to `ticket.branchName` (Linear's generated branch name) or fallback to `slugify(ticket.identifier + '-' + ticket.title)`
- Loading/error states

**Shared patterns across tabs**:

- Extract a reusable `SearchableList` component if warranted (search input + scrollable list with selection)
- Max height on list container with `overflow-y: auto` (show ~8 items before scrolling)
- Empty state: "No results" message
- Keyboard: arrow keys to navigate list, Enter to select + create

### Verify:

```bash
npm run lint          # type checking passes
npm run dev           # manually test all 4 tabs:
                      #   - New Branch: text input works as before
                      #   - Branch: loads branches, search works, selection fills branch name
                      #   - PR: loads PRs (or shows gh CLI warning), selection fills branch name
                      #   - Ticket: loads tickets (or shows API key prompt), selection fills branch name
```

Say **"next section"** when ready.

---

## Section 5/5: Final Verification

Re-read **Acceptance Criteria** and **Decisions**, then verify each holds true.

### Acceptance Criteria checklist:

- [ ] Modal has 4 tabs: New Branch | Branch | PR | Ticket — visually inspect modal
- [ ] New Branch tab preserves current text-input behavior — test creating a worktree with typed branch name
- [ ] Branch tab shows searchable branches — test with a repo that has multiple branches
- [ ] PR tab shows open GitHub PRs — test with a repo that has open PRs (requires gh CLI auth)
- [ ] Ticket tab shows Linear tickets — test with a valid Linear API key
- [ ] Linear API key configurable in Settings — open Settings, add/remove key, test validation button
- [ ] Auth warnings shown appropriately — test PR tab without gh CLI, Ticket tab without API key
- [ ] SSH remote support — verify `sshRemoteId` passed through to all git/PR calls
- [ ] Branch name editable before creation — select items in each tab, verify name field is editable

### Run all linting:

```bash
npm run lint          # all type configs pass
npm run lint:eslint   # no ESLint errors
npm run test          # all tests pass
```

If any checkbox fails, fix before marking complete.
