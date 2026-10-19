# dsh-git-panel

A read-only Git panel for the DeepSeek Harness Web UI's right sidebar.

It adds a **Git** card to the sidebar's Start page. The card opens a tab that can
point at any folder, list the repositories inside it, and show each repository's
working tree, branches, and commit graph.

- **Uncommitted** — staged, unstaged, untracked, and conflicted files, with
  status letters and line counts.
- **Committed** — a lane-drawn commit graph across local branches and tags, with
  ref chips and per-commit file lists.
- **Live** — detail polls every 3s, the folder overview every 10s; both pause
  when the tab is hidden.
- **Read-only** — no stage, commit, discard, checkout, fetch, or push, ever.

## Requirements

- DSH **0.2.x**, running the **Web GUI**. The plugin's host bridge uses the Web
  HTTP carrier; the Desktop `file://` renderer is not supported.
- `git` on `PATH`.
- A DSH profile with Plugin Manager available (a Creator-mode session, or the
  Plugins page).

There are no npm dependencies and no build step.

## Install

This is a DSH **plugin bundle**, not an npm library. `npm install` alone does
nothing useful; it must be installed into a DSH profile.

1. Clone this repository.
2. Open a Creator-mode session in the DSH Web GUI.
3. Ask the agent to install the bundle from this directory's absolute path, for
   example:

   > Install the plugin bundle at `/absolute/path/to/dsh-git-panel`.

   The agent runs `plugin_manager install_bundle` with that directory. The
   manager adds a `link:` dependency to the profile; this checkout is what runs.
4. Reload the Web page once.
5. Open the right sidebar, click **+** (or **Start**), and choose **Git**.

To update after editing, reload the page for client changes; host changes may
need the bundle disabled/re-enabled or a host restart, because the package is
linked rather than rebuilt.

## Use

1. Open **Git** from the Start page.
2. The tab starts at the session's working directory. If that folder contains
   repositories, they are listed; pick one to drill in.
3. Use **Choose folder** to point it anywhere, including a parent folder such as
   `~/Desktop/Code`. The choice is remembered per session.
4. **All** shows a summary, recent changes, and recent commits. **Changes** and
   **History** are the full-height views. Click a commit to load its file list.

The repository switcher in the header moves between sibling repositories.

## How it works

```
dsh-git-panel/
├─ index.js              host entry: registers the authenticated route
├─ host/
│  ├─ git.js             read-only git reader, command runner, cache
│  ├─ parse.js           porcelain-v2 / numstat / log / diff-tree parsers
│  ├─ discover.js        depth-1 repository scan
│  ├─ cache.js           TTL cache + git-process limiter
│  ├─ rpc.js             payload validation and dispatch
│  └─ route.js           Connection RPC envelope over an HTTP route
├─ client.js             sidebar card, tab body, graph, polling, styles
├─ locale/en.json        Plugin Manager display metadata
├─ icon.svg              plugin artwork
├─ docs/                 design spec
└─ test/                 node:test suite
```

The host registers a `/git-panel` prefix route and authenticates each request
with `connection.requestRejection` (Host/Origin fence plus the browser cookie).
The browser calls it through `ctx.connection.rpc.call`, so the wire format is
Connection's own `client-request` / `server-response` envelope. The git reader
runs fixed `execFile('git', …)` commands with `GIT_OPTIONAL_LOCKS=0` and
`core.fsmonitor=false`; it never writes to a repository.

## Development

```sh
node --check client.js
node --test test/*.test.js
```

24 tests cover the parsers against synthetic and real temporary repositories
(including merges, renames, conflicts, worktrees, and unborn branches), the
repository scanner, the RPC dispatcher, the HTTP envelope bridge, and the commit
lane layout.

`client.js` is plain JavaScript with no JSX and no bundler step; React is
supplied by the host's module table. Host modules are plain ESM.

## Limitations

- Read-only: no write operations and no diff text. Clicking a commit expands its
  file list; v1 does not render a unified diff.
- Web GUI only: the route bridge is reached over the Web HTTP carrier.
- Repository discovery is one level deep; nested repositories are not scanned.
- History is capped at 150 commits, status at 1000 entries, discovery at 100
  repositories. Truncation is shown in the UI.
- Untracked directories are shown as one entry rather than every file.
- `@local/dsh-git-panel` is a local package name. To publish to npm, rename it
  to a scope you own and update `cordis.patch.yml` to match.

## Design

The design spec is at
[`docs/superpowers/specs/2026-10-19-git-sidebar-panel-design.md`](docs/superpowers/specs/2026-10-19-git-sidebar-panel-design.md).

## License

MIT. See [LICENSE](LICENSE).
