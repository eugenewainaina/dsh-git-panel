# Git Sidebar Panel — Design Spec

- **Status:** Write core, inspection depth, and sync/branches implemented and live-verified in the Web GUI on 2026-10-20
- **Date:** 2026-10-19
- **Scope:** new persistent Harness plugin (Host + Client halves)
- **Working name:** `@local/dsh-git-panel`

> This document lives at the plugin repository root. Paths written as `dsh-git-panel/…` refer to this repository.

## 1. Problem

The Harness Web UI has no version-control surface. Users cannot see, without leaving the app, which files a session changed, what is staged, which branch is checked out, or what commits exist. The right sidebar already hosts per-session tabs (Files, Document, Terminal, Browser, subagent review) but has no Git tab.

The goal is a guide card named **Git** in the right sidebar's Start page that opens a tab for looking at git status and history for **any folder**, including folders that contain several repositories.

## 2. Non-goals

- No force pushes, merges, rebases, cherry-picks, resets, stashes, or conflict resolution. Local writes and fetch/fast-forward pull/push are implemented.
- Write actions remain out of scope. The read-only unified diff is implemented.
- No opening a changed file or commit file in the editor/preview.
- No recursive repo scan below one level, no multi-repo merged change feed, no remote-branch lanes, no commit pagination.
- No Git panel outside a session (the right sidebar requires one).

## 3. Confirmed decisions

| Decision | Choice |
|---|---|
| Entry point | Fourth guide card in the right sidebar Start page |
| Scope | One folder per tab; folder may contain several repos |
| Aggregate model | Repo overview → drill into one repo; switch repos from the header |
| Detail layout | Sub-tabs **All / Changes / History**, default **All** |
| History | Lane-drawn commit graph, all local branches + tags + HEAD, 150 commits |
| Change depth | Status letters + line counts; commit file lists; unified diff on click |
| Local writes and sync | Stage/unstage, commit/amend/sign-off, discard with confirmation, undo, branch switch/create, fetch, fast-forward pull, push |
| Live updates | Client polling (detail 3s, overview 10s) + host cache |
| Client↔Host | Authenticated `/git-panel` route carrying the Connection RPC envelope; client `ctx.connection.rpc.call` |
| Localization | English UI; all strings through the `gitPanel` locale namespace |

## 4. User experience

### 4.1 Entry point

- `ctx.sidebarRightTabs.register` contributes tab kind `git`, implementation id `@local/dsh-git-panel`, and one guide entry (order 40, after Browser): title **Git**, description "Review changes and history across your repositories," and an `icon` React component (branch glyph). The registry's guide entry field is `icon`, not `glyph`.
- Clicking the guide card opens the type through the guide's own `openTab(entry.kind, { replaceTab: true })` path; no command id or shortcut is required for opening. A `commandId` is added only if the runtime requires one for the card to be actionable.
- The body registers in `sidebar.right.pane.tab` under the same id, with `locale: NS` to receive `t`. It receives the standard `useTabInfo`, `sessionId`, `useSessions`, and `t` props; `tab.signal` aborts when the tab occurrence ends. The title registers in `sidebar.right.pane.tab.title` and draws the glyph plus `tab.title`.
- Tab chip: branch glyph + **Git**. A dynamic chip showing the selected repo name is a bonus only if the title seat can read shared state; the fallback is a static label.

### 4.2 Opening behavior

- Scope root defaults to the session's working directory (`useSessions().byId[sessionId].cwd`, with `sessionId` supplied as a standard slot prop).
- Discovery resolves the root first: if `git rev-parse --show-toplevel` succeeds (the root is a repo or inside one), it returns only that repository and the tab opens its detail directly.
- Otherwise the root is treated as a parent folder, scanned one level deep, and the tab opens the repository overview.
- If no repository is found, show an empty state with **Choose folder**.

### 4.3 Overview (aggregate)

```
┌ Git ────────────────────────────────┐
│ ~/Desktop/Code         [Choose] [↻] │
│ 4 repositories · 10s refresh        │
│                                     │
│ ● animus              main  ↑8  8   │
│ ● exploding-kittens   main      2   │
│ ● hafsa               main      1   │
│ ● pattern generator   main      3   │
└─────────────────────────────────────┘
```

- Rows are sorted case-insensitively by name and never reorder as summaries arrive.
- A row shows dirty dot, name, branch (or short SHA when detached), ahead/behind arrows, and total changed-file count (unique paths across groups; a path changed both staged and unstaged counts once).
- Rows fill progressively as per-repo summaries land. A repo that cannot be read shows an inline error row with a short reason.
- Folder picker uses the client directory picker; on selection the root is replaced and discovery reruns.
- Manual refresh bypasses both the discovery TTL and the per-repo summary TTL (`fresh: true`).
- Header shows the folder path, repo count, refresh interval, and a refresh button.

### 4.4 Repository detail

```
┌ Git ────────────────────────────────┐
│ ← animus              main ↑8  ●8   │
│ ~/Desktop/Code/animus   [⌄] [Choose]│
│ ┌ All ─┬ Changes 8 ┬ History 9 ─┐   │
│                                     │
│  Staged                             │
│   M  src/llm.ts              +12 −4 │
│  Unstaged                           │
│   M  animus-backend/src/llm.ts +2 −0│
│  Untracked                          │
│   ?  notes.md                       │
└─────────────────────────────────────┘
```

Pinned header: back arrow (only when the overview has more than one repo), repo name, branch or detached state, ahead/behind, dirty count, repo switcher (`⌄` lists sibling repos; hidden when the scope holds a single repo), folder picker, refresh.

- **All** — one scroll: summary card (branch, upstream, ahead/behind, counts, last commit) → first 5 change entries → latest 8 commits with graph → "View all changes" / "Full history" links that switch sub-tabs.
- **Changes** — full-height list. Group order: **Conflicts**, **Staged**, **Unstaged**, **Untracked**; empty groups are hidden; headers are collapsible and show counts. Rows carry status letter, dimmed directory + primary filename, `+N −M` when known, rename as `old → new`, and "binary" instead of counts. An untracked directory is one row with a trailing slash. A clean tree shows "Working tree clean." Clicking a row opens its unified diff; an untracked directory row is not clickable.
- **History** — full-height graph. Each row: lane lines and node, subject (truncated), ref chips (HEAD/local/remote/tag), author and relative time. Clicking a row expands its changed-file list, loaded lazily and cached. A merge commit diffs against its first parent, labelled as such. Clicking a changed file in the expanded list opens its unified diff. Cap 150 with a visible "Showing the latest 150 commits" note; the tab badge shows `150+` when truncated. The header branch chip opens a menu to switch or create local branches, create a tag at HEAD, and delete local tags. A sync menu offers fetch, fast-forward pull, and push, with confirmation for pull and push. The diff header opens a line-oriented blame view and a file-history list for the current path; a text field filters changes and commits. The diff can switch between unified and side-by-side layouts, ignore whitespace, and change its context size.

### 4.5 States

- Loading: skeleton rows that keep the header stable.
- Refreshing: previous data stays visible; a small spinner in the header.
- Failure: stale data remains with a "stale" badge and the reason; first-load failures show a full empty state with **Retry**.
- Motion: no lane animation; only subtle fades; respects reduced motion.

## 5. Architecture

One bundle, two halves:

```
dsh-git-panel/
├─ package.json          dsh.bundle.patch + dsh.client
├─ cordis.patch.yml
├─ index.js              host apply: inject connection, register /git-panel handler
├─ host/
│  ├─ rpc.js             validation, dispatch, JSON responses
│  ├─ git.js             execFile runner (timeouts, caps, env)
│  ├─ parse.js           pure parsers
│  ├─ discover.js        depth-1 repository scan
│  └─ cache.js           TTL + in-flight dedupe + concurrency queue
├─ client.js             loader factory: guide, tab type, body, title
├─ locale/en.json
├─ icon.svg
└─ test/
```

### 5.1 Why Connection RPC + polling

The platform's typed RPC (Typert) needs generated artifacts produced by DSH's own build pipeline, which is not exposed for third-party plain-JS bundles. A bare `webServer` route would bypass the browser trust fence, and the generic Connection channel that would avoid that is unavailable here. The bridge therefore pairs a named `webServer` route with Connection's public `requestRejection`, and carries Connection's own RPC envelope so the browser side remains `ctx.connection.rpc.call`.

- Host: `ctx.connection.rpc.handle('/git-panel', handler)` was the planned channel registration. In this composition it fails with `cannot get property "webServer" without inject`: the service registers its channel through the reading context's `webServer`, and that access is not satisfied here. The host instead registers the same prefix route with `ctx.webServer.register` and calls `ctx.connection.requestRejection({ headers })` before reading the body. That public method applies Connection's Host/Origin fence and browser-cookie authentication. The route speaks Connection's RPC envelope (`client-request` → `server-response`) so the client still calls `ctx.connection.rpc.call`; only the server-side bridge is ours.
- Client: `ctx.connection.rpc.call('/git-panel', endpoint, payload, signal)` uses the same transport as every other Remote call, with no CORS or cookie handling in the plugin.
- The handler receives `(endpoint, payload, signal)` from the bridge and returns `{ ok: true, value }` or `{ ok: false, error: { code, message, details } }`.

This keeps the route authenticated and inside the browser trust fence without Typert codegen. The tradeoff is that the bridge is reached over the Web carrier's HTTP route; the Desktop `file://` renderer would need the generic channel or a Remote namespace instead.

The client half stays one file: the module loader's `require` exposes React only, and there is no sibling-module resolution or build step. Pure helpers live at the top of `client.js`; the factory exposes them under `__test` so Node can test the lane algorithm by loading the file with a stubbed `window.__ModuleLoader__`.

The body receives a small face through a wrapper component defined in `apply` — `call(method, params, signal)`, `subscribeConnection(listener)`, `connectionState()`, and `pickDirectory()` — so the component never needs the Cordis context. The face is passed as props from the wrapper rather than through the slot registration's `inject` option: in this runtime that option left the body cell inactive. Selection state is React state plus localStorage; no `client-store` dependency.

## 6. Host RPC contract

- Channel `/git-panel`, endpoints `discover`, `summary`, `repo`, `commit`. The channel matches Connection's `^/[A-Za-z0-9._~-]+$`; each endpoint matches `^[A-Za-z0-9_$.-]+$`.
- Host registration: `ctx.webServer.register({ kind: 'prefix', path: '/git-panel', handler })` inside `ctx.inject(['webServer'], …)`. The handler first calls `ctx.connection.requestRejection({ headers: req.headers })`; 401/403 ends the request. It then reads a JSON `{ type: 'client-request', rpcId, method, payload }` body and answers `{ type: 'server-response', rpcId, result }`. The registration is owned by the plugin effect.
- Client call: `ctx.connection.rpc.call('/git-panel', endpoint, payload, signal)`. It resolves to `{ ok: true, value }` or `{ ok: false, error: { code, message, details } }`; transport failures (auth, disconnect, malformed envelope) reject the promise and are handled separately.
- Business failures are returned, never thrown: a thrown handler becomes a transport 500.
- Payloads:

| Endpoint | Payload | Value |
|---|---|---|
| `discover` | `{ dir: string, fresh?: boolean }` | `DiscoverValue` |
| `summary` | `{ repo: string, fresh?: boolean }` | `SummaryValue` |
| `repo` | `{ repo: string, fresh?: boolean }` | `RepoValue` |
| `commit` | `{ repo: string, sha: string }` | `CommitValue` |
| `diff` | `{ repo: string, path: string, group: 'staged' \| 'unstaged' \| 'untracked' \| 'conflict' \| 'commit', sha?: string, ignoreWhitespace?: boolean, context?: number, fresh?: boolean }` | `DiffValue` |
| `blame` | `{ repo: string, path: string, fresh?: boolean }` | `{ path: string, lines: Array<{ sha, line, author, authorTime, summary, text }>, truncated: boolean }` |
| `fileLog` | `{ repo: string, path: string, fresh?: boolean }` | `{ path: string, commits: CommitEntry[], truncated: boolean }` |
| `branches` | `{ repo: string, fresh?: boolean }` | `{ branches: Array<{ name, current, upstream, sha }>, current }` |
| `switchBranch` | `{ repo: string, name: string, create?: boolean }` | `{ ok: true, branch: string }` |
| `tags` | `{ repo: string, fresh?: boolean }` | `{ tags: Array<{ name, sha }> }` |
| `createTag` | `{ repo: string, name: string }` | `{ ok: true, name: string }` |
| `deleteTag` | `{ repo: string, name: string }` | `{ ok: true, name: string }` |
| `fetch` | `{ repo: string }` | `{ ok: true, action, output }` |
| `pull` | `{ repo: string }` | `{ ok: true, action, output }` |
| `push` | `{ repo: string }` | `{ ok: true, action, output }` |
| `stage` / `unstage` | `{ repo: string, paths?: string[], all?: boolean }` | `{ ok: true }` |
| `discard` | `{ repo: string, paths: string[], group: 'unstaged' \| 'untracked' }` | `{ ok: true }` |
| `commitStaged` | `{ repo: string, message: string, amend?: boolean, signoff?: boolean }` | `{ ok: true, sha: string, output: string }` |
| `undo` | `{ repo: string }` | `{ ok: true }` |

`fresh: true` bypasses the host TTL caches and is sent only by manual refresh. Paths are absolute; `sha` must match `/^[0-9a-f]{4,64}$/i` before it reaches git. The handler validates every payload and returns `bad-request` rather than throwing. `summary`, `repo`, and `commit` resolve the containing repository root with a cached `rev-parse --show-toplevel`, so a subdirectory path works; the value's `repo` is that resolved root.

```ts
interface RepoRef { path: string; name: string }

interface DiscoverValue {
  dir: string;
  repos: RepoRef[];
  truncated: boolean;          // more than 100 repos
}

interface ChangeEntry {
  path: string;
  oldPath?: string;            // rename/copy
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';
  group: 'staged' | 'unstaged' | 'untracked' | 'conflict';
  additions?: number;          // absent for untracked/binary
  deletions?: number;
  binary?: boolean;
}

interface SummaryValue {
  repo: string;
  branch: string | null;       // null when detached
  oid: string | null;          // null on an unborn branch
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  counts: { staged: number; unstaged: number; untracked: number; conflicts: number };
  changedFiles: number;       // unique paths across all groups
  truncated: boolean;          // status entry cap reached
  scannedAt: number;           // epoch ms
}

interface CommitRef { name: string; kind: 'head' | 'local' | 'remote' | 'tag' }

interface CommitEntry {
  sha: string;
  parents: string[];
  author: string;
  authorTime: number;          // epoch seconds
  subject: string;
  refs: CommitRef[];
}

interface HeadCommit {
  sha: string;
  subject: string;
  authorTime: number;          // epoch seconds
}

interface RepoValue {
  summary: SummaryValue;
  headCommit: HeadCommit | null;
  changes: ChangeEntry[];
  commits: CommitEntry[];
  commitsTruncated: boolean;
}

interface CommitFile {
  path: string;
  oldPath?: string;
  status: 'A' | 'C' | 'D' | 'M' | 'R' | 'T' | 'U' | 'X' | 'B';
  additions?: number;
  deletions?: number;
  binary?: boolean;
}

interface CommitValue {
  sha: string;
  files: CommitFile[];
}

interface DiffValue {
  path: string;
  group: 'staged' | 'unstaged' | 'untracked' | 'conflict' | 'commit';
  sha: string | null;
  patch: string;               // unified diff, capped at 200 KB
  binary: boolean;
  truncated: boolean;
}
```

Error codes: `bad-request`, `not-found`, `not-a-directory`, `not-a-repo`, `git-missing`, `git-failed`, `git-timeout`, `unsafe-repo`, `too-large`, `internal`.

## 7. Git execution and parsing

All commands use `execFile` (no shell), fixed argv, `-C <repo>`, `-c core.fsmonitor=false`, and `GIT_OPTIONAL_LOCKS=0` so status never refreshes or writes the index. Missing git is detected once and cached.

| Purpose | Command |
|---|---|
| Repo root | `git rev-parse --show-toplevel` |
| Status | `git status --porcelain=v2 --branch -z --untracked-files=normal` |
| Unstaged line counts | `git diff --numstat -z` |
| Staged line counts | `git diff --cached --numstat -z` |
| History | `git log HEAD --branches --tags -n 151 --topo-order --decorate=full -z --pretty=format:%H%x1f%P%x1f%an%x1f%at%x1f%s%x1f%D` |
| Head commit | `git log -1 --pretty=format:%H%x1f%s%x1f%at HEAD` |
| Commit files | `git diff-tree -r -M --no-commit-id --name-status -z <sha>^1 <sha>` and `git diff-tree -r -M --no-commit-id --numstat -z <sha>^1 <sha>`; root commits use `--root <sha>`; merges compare to the first parent. `-M` is required: without it git reports a rename as delete + add. |
| Worktree diff | `git diff --no-color --no-ext-diff --unified=3 -M -- <path>`; staged adds `--cached`; conflict uses the same worktree form. |
| Commit diff | `git diff --no-color --no-ext-diff --unified=3 -M <sha>^1 <sha> -- <path>`; root commits use `git show --format= … <sha> -- <path>`. |
| Untracked diff | Synthesized in the host from the file bytes as a `new file` patch; binary files return `binary: true`. |
| Blame | `git blame --line-porcelain -- <path>`, parsed into final line, commit, author, and text; capped at 5000 lines. |
| File history | `git log --follow --max-count=100 --decorate=full -z --pretty=… -- <path>`; capped at 100 commits. |
| Branches | `git for-each-ref --format=%(refname:short)%09%(HEAD)%09%(upstream:short)%09%(objectname:short) refs/heads`. |
| Switch/create | `git switch <name>` or `git switch -c <name>`, after `git check-ref-format --branch`; a dirty tree fails without force. |
| Tags | `git tag --list --format=%(refname:short)%09%(objectname:short)`. Create at HEAD with `git tag <name>`, delete with `git tag -d <name>`; both validate `refs/tags/<name>`. |
| Fetch | `git fetch --prune` (60s timeout). |
| Pull | `git pull --ff-only` (60s timeout); local changes or divergence fail instead of creating a merge. |
| Push | `git push` (60s timeout); no force, requires an upstream. |

Every command is `execFile('git', ['-C', repo, '-c', 'core.fsmonitor=false', ...args])` with `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`, and `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_COMMON_DIR` removed from the inherited environment. Timeout 10s, output cap 8 MB, git concurrency 3.

Parsing rules:

- Porcelain v2: `# branch.oid`, `# branch.head`, `# branch.upstream`, `# branch.ab +A -B`; records `1` (ordinary), `2` (rename/copy: the path is followed by the old path as the next NUL item), `u` (unmerged), `?` (untracked), `!` (ignored, dropped). `branch.head` of `(detached)` sets `detached`.
- `--untracked-files=normal` reports an untracked directory as one `dir/` entry instead of every file under it; this bounds output on repos with large untracked trees. The 1000-entry cap still applies and is reported.
- Unborn branch: `# branch.oid (initial)` → `oid: null`, history empty, status still valid.
- Numstat maps path → additions/deletions; `-` means binary. A rename record is `add\tdel\t` followed by a NUL, the old path, a NUL, and the new path; the new path is the key. A file can appear in both staged and unstaged groups with different counts.
- Diff-tree name-status records are `<status>\0<path>\0` or, for renames/copies, `R100\0<old>\0<new>\0`; numstat renames use the empty-path form described above. Combine both by the new path.
- Log records are NUL-terminated (`-z`) and fields are 0x1F-separated, so neither a commit subject nor an author name can collide with the framing. Parents are space-separated. Decorations are comma-separated and use full ref names (`refs/heads/`, `refs/remotes/`, `refs/tags/`, plus `HEAD` and `HEAD -> refs/heads/...`); they are normalized for display by stripping `refs/heads/` and `tag: `, and keeping remotes as `origin/main`. The `commits` array is topo-ordered; the head commit is fetched separately with `git log -1`.
- Caps: 1000 status entries, 150 displayed commits (151 fetched to detect truncation), 100 repositories; truncation is explicit in the payload.
- Non-UTF-8 paths are decoded as UTF-8 and may display imperfectly; recorded as a known limitation.
- `safe.directory` refusal is surfaced as `unsafe-repo` with the repository path, not overridden.
- Measured on 2026-10-19 against `~/Desktop/Code/animus`: status took 36 ms and `.git/index` mtime was unchanged with `GIT_OPTIONAL_LOCKS=0`.

## 8. Live updates

- Detail view polls `repo` every 3s; overview polls `discover` every 60s and each `summary` every 10s.
- Polling uses chained `setTimeout`, never overlapping; requests are aborted on unmount, repo switch, and folder change through the `AbortSignal` passed to `rpc.call`.
- Polling pauses while `document.hidden` or `tab.visible` is false; `visibilitychange`, window `focus`, and the tab becoming visible again trigger an immediate refresh.
- Manual refresh cancels in-flight work, sends `fresh: true`, and restarts the chain.
- When `ctx.connection.state` returns to `connected`, the tab refreshes immediately; RPC transport failures show the connection error instead of a git error.
- Host cache TTLs: `summary`/`repo` 2s, `commit` 60s, `discover` 60s. Identical in-flight requests share one promise. A concurrency queue allows 3 git processes at a time; queued work still respects the 10s budget.
- Previous data is retained during refresh; failures do not blank a populated panel.

## 9. Persistence

Per session in `localStorage` under `dsh.git-panel.v1.<sessionId>`:

```json
{ "root": "/Users/mac/Desktop/Code", "selectedRepo": "/Users/mac/Desktop/Code/animus", "view": "all" }
```

- Root defaults to the session cwd; view defaults to `all`.
- Folder and repo choices are shared by Git tabs in the same session (v1 limitation).
- No repository data is persisted; only the selection.

## 10. Visual system

- Compact rows (28px), 12–13px type; UI font for names, monospace for hashes and status letters.
- Theme tokens (`--dsw-alias-*`) for every surface, text, border, and hover; only the guide icon and graph lane palette are literal colors.
- Status palette: modified amber, added green, deleted red, renamed blue, untracked violet, conflict red with a distinct glyph. Palette checked in light and dark.
- Graph: SVG per row, 10px lane gap, 2px lines, 7px node, HEAD ring; lanes decorative (`aria-hidden`), commit text carries the meaning.
- Layout holds from 360px to 600px; fullscreen reveals more lane width. No horizontal scrolling for rows; paths truncate from the left, filenames win.
- Keyboard: folder picker, refresh, tabs, repo switcher, and commit rows are focusable; commit rows are buttons with `aria-expanded`; focus-visible ring from tokens.

### 10.1 Commit graph layout

Input is the topo-ordered commit list (sha, parents). The layout is one pure function, `layoutGraph(commits)`, exposed through the client factory's `__test` for Node tests:

- Maintain `lanes: Array<string | null>` of the commit hashes each lane expects next.
- A commit claims the lane already holding its sha; otherwise it takes the first free lane or appends one (disconnected roots).
- First parent continues the commit's lane (replace the sha). Each extra parent either joins an existing lane holding that parent or takes a new lane.
- Each row records its lane, the lanes active across the row, and edges: `through` for continuing lanes, `curve` from the node to an extra parent's lane, `end` for a root/no-parent lane.
- Rows render one SVG each, at a fixed width computed from the maximum lane count (`lane * 14 + 10`), so subjects align down the list. Vertical segments run top-to-bottom; extra-parent edges are cubic curves meeting the next row's lane at the row's bottom edge. The node is a 7px circle; the HEAD commit gets a ring.
- Lane colors come from an 8-entry palette indexed by lane; the graph is decorative (`aria-hidden`) and the commit text carries all meaning.
- The graph is laid out once for all loaded commits; All renders its first 8 rows, History renders all rows (150 max), so lanes stay consistent between the two views.

CSS is one stylesheet inserted once in `apply` through a `style[data-plugin-css]` element with cleanup on dispose, matching the shipped bundles; classes use the `dgp-` prefix and only theme tokens for color.

## 11. Error handling matrix

| Situation | Handling |
|---|---|
| Folder missing / not a directory | Empty state, `Choose folder` |
| Folder has no repos | Empty state "No repositories here" |
| Repo root inside a repo | Resolve via `rev-parse --show-toplevel`, show that repo |
| Git not installed | Empty state "Git is not available on this machine" |
| Git timeout | Stale data + retry; first load error state |
| Connection unavailable / unauthorized | Connection error state with retry; the tab keeps its selection |
| `safe.directory` refusal | Error row/state naming the repo |
| Empty repo | Status works; History shows "No commits yet" |
| Detached HEAD | Branch shows `detached @ <short sha>` |
| Huge status | First 1000 entries, truncation note |
| Huge history | Latest 150, truncation note |
| >100 repos | First 100 by name, truncation note |

## 12. Testing

- `parse.test.js`: porcelain-v2 fixtures (ordinary, rename, conflict, untracked, detached, unborn, ahead/behind), numstat (binary, rename), log (nasty subjects, decorations), diff-tree.
- Diff coverage in the fixture suite: unstaged, staged, untracked, binary, commit, and path-traversal rejection; the client parser test tracks add/delete/context line numbers.
- `discover.test.js`: temp dirs with `.git` directory and worktree `.git` file; depth-1 only; hidden and `node_modules` skipped; symlinks skipped; cap.
- `graph.test.js`: lane layout for linear, fork, merge, octopus, detached, and a 150-commit run; stable parent lanes, no collisions.
- `git-fixture.test.js`: creates real temp repos with two branches and a merge, a rename (verified through `-M`), a conflict, an unborn repo, a worktree `.git` file, staged/untracked/binary files; asserts the reader and diff reader end-to-end and that `git status` before/after is identical.
- `write.test.js`: stages, unstages (including an unborn branch), commits, amends, discards an unstaged change, deletes an untracked file, and undoes the first and a later commit.
- Blame, file history, diff options, branches, tags, and sync are covered by the fixture suite: line text/author, history entries, whitespace-only changes, context size, path-traversal rejection, branch create/switch, tag listing, and fetch/pull/push against a local bare remote; side-by-side pairing is covered by the client graph tests.
- `rpc.test.js`: dispatcher validation — unknown endpoint, missing/invalid path, non-hex sha, `fresh` handling, and the business-failure envelope; the handler is called with a fake reader.
- `graph.test.js`: lane layout for linear, fork, merge, octopus, detached, multiple roots, and a 150-commit run; stable parent lanes, no collisions.

All tests run with `node --test test/*.test.js` (24 tests).

## 13. Verification

1. Test suite green.
2. Bundle installs; Plugins row shows title, description, and icon with no display diagnostics.
3. The git reader is exercised by the fixture suite against real repositories; the RPC channel itself is platform-owned, so its envelope is trusted rather than re-tested.
4. Live session: Start guide shows **Git**; overview lists four repos; drill into `animus` (main, ↑8, its eight modified files); Changes groups and History graph render; a commit expands; clicking a changed file or commit file renders a unified diff with line numbers.
5. Live update: edit a file in a watched repo; counts change within ~3s without manual refresh.
6. Reload: folder/repo/view persist.
7. Edge states: empty folder, non-repo, empty repo, detached HEAD, light/dark, 360px.
8. Write core: stage a file, commit it, amend it, discard an unstaged edit after confirming, and undo the last commit; each result is reflected in `git status` and the panel.
9. Inspection: filter the change list and commit graph, toggle unified/side-by-side, whitespace, and context in a diff, open blame, and browse the file's history from the diff header.
10. Branches: switch to a new branch, create one from the header menu, create and delete a tag, and confirm the tags list.
11. Sync: fetch a local remote, fast-forward pull a new commit, and push a local commit; a failed pull/push surfaces in the error banner.

Browser automation is not assumed; steps 4–7 are checked on the user's live page. If a headless browser can load the same URL, it is used for screenshots as well. Any step that cannot be verified is reported rather than claimed.

## 14. Risks

- **Guide entry click**: the shipped Files type includes a `commandId`; the guide's documented fallback opens the entry's kind directly. If the runtime requires a command for the card to act, a small `workspace.git` command is registered; the panel itself does not depend on it.
- **Connection channel registration**: `ctx.connection.rpc.handle` is not usable in this composition (it raises `cannot get property "webServer" without inject`). The bridge uses public `webServer.register` plus `connection.requestRejection` and the documented RPC envelope. If those public pieces change, the fallback is a Typert Remote service; the git reader is independent of the transport.
- **Web-carrier dependency**: the bridge's route is reached over the Web HTTP carrier. The Desktop `file://` renderer would need the generic channel or a Remote namespace; the current target (and verified path) is the Web GUI.
- **Body slot injection**: passing the face through the slot registration's `inject` option left the body cell inactive. The wrapper component passes the face as props instead; keep that shape when changing the registration.
- **Standard props** (`sessionId`, `useSessions`) are confirmed by slot inspection and the shipped Files body but could change across Harness versions; a missing cwd degrades to the folder picker.
- **Polling cost** with many repos; mitigated by caps, cache, concurrency, and a slower overview interval.
- **Dev iteration**: no `dev:web` watcher is running, so client changes need a page reload and host changes may need a host restart.
- **Client file size** grows with UI complexity; pure helpers and section comments keep it reviewable.

## 15. Delivery

- Author the bundle in `dsh-git-panel/` in the session workspace.
- `package.json` declares `dsh.bundle.patch` and `dsh.client` (`platform: web`, `inject: ["@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-client-ui-sidebar-right"]`), and exports `.`, `./client`, `./locale/*.json`, and `./icon`.
- Host `index.js` exports `inject = ['connection']`, injects `webServer` through a child context, and registers the authenticated `/git-panel` bridge; the client factory injects `slots`, `locale`, `sidebarRightTabs`, `connection`, and `uiWorkspace`.
- Install with `plugin_manager install_bundle` targeting the directory; never edit the profile's `package.json` or `cordis.patch.yml` by hand.
- `locale/en.json` carries `meta.title`, `meta.description`, and the `gitPanel` UI strings; `icon.svg` is original branch artwork.
- Verify the Plugins row and icon after install; the client half registers the guide entry, tab body, and title.

## 16. Future work

- File opening in the Document tab where the path is inside the session workspace.
- Push-based streams instead of polling, via a Remote service or SSE.
- Recursive scan, repo pinning, combined multi-repo changes, remote-branch lanes, commit pagination.
