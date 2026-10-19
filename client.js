window.__ModuleLoader__.load({
  id: '@local/dsh-git-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState } = React;

    const NS = 'gitPanel';
    const GIT_ID = '@local/dsh-git-panel';
    const CHANNEL = '/git-panel';
    const STORAGE_PREFIX = 'dsh.git-panel.v1.';
    const STYLE_ID = GIT_ID + '/client.css';
    const LANE_COLORS = ['#6ea8fe', '#f0a35e', '#7ccf9b', '#c58af9', '#e58c8c', '#68c6cf', '#d7b56d', '#9aa7bd'];

    const EN = {
      'type.label': 'Git',
      'guide.title': 'Git',
      'guide.description': 'Review changes and history across your repositories.',
      'overview.repositories': 'repositories',
      'overview.refresh': '10s refresh',
      'overview.choose': 'Choose folder',
      'overview.noRepos': 'No repositories here',
      'overview.noReposHint': 'Choose a folder that contains repositories, or a folder inside one.',
      'overview.useSession': 'Use session folder',
      'overview.truncated': 'Showing the first 100 repositories.',
      'overview.reading': 'Reading repositories…',
      'action.refresh': 'Refresh',
      'action.retry': 'Retry',
      'action.back': 'Back to repositories',
      'action.choose': 'Choose folder',
      'action.viewAll': 'View all changes',
      'action.fullHistory': 'Full history',
      'detail.all': 'All',
      'detail.changes': 'Changes',
      'detail.history': 'History',
      'detail.detached': 'detached',
      'detail.unknown': 'no branch',
      'detail.ahead': 'ahead',
      'detail.behind': 'behind',
      'detail.changedFiles': 'changed files',
      'detail.repoMenu': 'Switch repository',
      'changes.conflicts': 'Conflicts',
      'changes.staged': 'Staged',
      'changes.unstaged': 'Unstaged',
      'changes.untracked': 'Untracked',
      'changes.clean': 'Working tree clean',
      'changes.truncated': 'Showing the first 1000 changes.',
      'changes.binary': 'binary',
      'history.empty': 'No commits yet',
      'history.noFiles': 'No file changes',
      'history.vsFirstParent': 'vs first parent',
      'history.showing': 'Showing the latest 150 commits.',
      'history.noSubject': '(no subject)',
      'time.now': 'now',
      'error.noRepo': 'That folder is not inside a git repository.',
      'error.gitMissing': 'Git is not installed or is not on PATH.',
      'error.unsafeRepo': 'Git refused this repository (ownership check).',
      'error.timeout': 'Git took too long to respond.',
      'error.tooLarge': 'This repository produced too much output.',
      'error.unauthorized': 'This session is no longer authorized. Reload the page.',
      'error.connection': 'Lost the connection to the host.',
      'error.aborted': 'Request cancelled.',
      'error.generic': 'Something went wrong while reading git.',
      'error.noCall': 'The git reader is unavailable in this session.',
      'empty.title': 'Git',
      'empty.chooseTitle': 'Choose a folder',
      'empty.chooseText': 'Pick a folder to see its repositories, changes, and history.',
      'empty.noSession': 'This session has no workspace folder. Choose one to begin.',
      'loading': 'Loading…',
      'commit.loading': 'Loading files…',
      'commit.error': 'Could not load this commit.',
      'repo.failed': 'Could not read this repository',
      'repo.clean': 'clean',
    };

    const CSS = `
.dgp-root{container-type:inline-size;height:100%;min-height:0;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.5}
.dgp-header{flex:none;box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l3);padding:8px 6px 6px 12px;display:flex;flex-direction:column;gap:4px;background:inherit}
.dgp-row{display:flex;align-items:center;gap:6px;min-width:0}
.dgp-grow{flex:1;min-width:0}
.dgp-title-block{display:flex;flex-direction:column;min-width:0;gap:1px}
.dgp-repo-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dgp-path{color:var(--dsw-alias-label-tertiary);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dgp-actions{display:flex;align-items:center;gap:2px;flex:none}
.dgp-icon{display:block;flex:none}
.dgp-icon-btn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--dsw-radius-sm,4px);background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dgp-icon-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dgp-icon-btn:disabled{opacity:.45;cursor:default}
.dgp-btn{height:26px;padding:0 9px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,4px);background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;display:inline-flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap}
.dgp-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dgp-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}
.dgp-btn-primary:hover{filter:brightness(1.05)}
.dgp-tabs{flex:none;display:flex;gap:2px;padding:0 8px;border-bottom:.5px solid var(--dsw-alias-border-l3)}
.dgp-tab{appearance:none;background:0 0;border:0;border-bottom:2px solid transparent;padding:6px 8px 5px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.dgp-tab:hover{color:var(--dsw-alias-label-primary)}
.dgp-tab.dgp-active{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary)}
.dgp-tab-count{font-size:10.5px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border-radius:999px;padding:0 5px;min-width:14px;text-align:center}
.dgp-body{flex:1;min-height:0;overflow:auto;padding:6px 0 14px;scrollbar-gutter:stable}
.dgp-overview-head{padding:8px 12px 4px;display:flex;flex-direction:column;gap:4px}
.dgp-overview-sub{color:var(--dsw-alias-label-tertiary);font-size:11.5px}
.dgp-repo-row{width:100%;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:6px 12px;border:0;border-radius:var(--dsw-radius-md,6px);background:0 0;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dgp-repo-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dgp-repo-main{display:flex;flex-direction:column;min-width:0;flex:1;gap:1px}
.dgp-repo-line{display:flex;align-items:center;gap:6px;min-width:0}
.dgp-repo-name-text{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dgp-repo-meta{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);font-size:11px;min-width:0}
.dgp-repo-error{color:var(--dsw-alias-state-error-primary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dgp-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none}
.dgp-branch{display:inline-flex;align-items:center;gap:3px;max-width:140px;min-width:0;color:var(--dsw-alias-label-secondary);font-size:11.5px;white-space:nowrap;overflow:hidden}
.dgp-branch-name{overflow:hidden;text-overflow:ellipsis}
.dgp-ahead{color:var(--dsw-alias-label-tertiary);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
.dgp-count{color:var(--dsw-alias-label-secondary);font-size:11.5px;white-space:nowrap;flex:none}
.dgp-summary{border-bottom:.5px solid var(--dsw-alias-border-l3);padding:8px 12px 9px;display:flex;flex-direction:column;gap:5px}
.dgp-summary-row{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:wrap}
.dgp-summary-meta{color:var(--dsw-alias-label-tertiary);font-size:11.5px;display:flex;align-items:center;gap:6px;min-width:0}
.dgp-counts{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11.5px;flex-wrap:wrap}
.dgp-count-item{display:inline-flex;align-items:center;gap:3px}
.dgp-clean{color:var(--dsw-alias-state-success-primary);font-size:11.5px}
.dgp-section{border-bottom:.5px solid var(--dsw-alias-border-l3);padding-bottom:4px}
.dgp-section:last-child{border-bottom:0}
.dgp-section-head{display:flex;align-items:center;gap:6px;padding:7px 12px 3px;min-height:22px}
.dgp-section-title{padding:7px 0 3px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);flex:none}
.dgp-section-action{margin-left:auto;border:0;background:0 0;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11.5px;cursor:pointer;padding:2px 0}
.dgp-section-action:hover{text-decoration:underline}
.dgp-group-head{width:100%;display:flex;align-items:center;gap:5px;padding:5px 12px 2px;border:0;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;text-align:left;cursor:pointer}
.dgp-group-head:hover{color:var(--dsw-alias-label-primary)}
.dgp-group-title{font-weight:600;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dgp-group-count{color:var(--dsw-alias-label-tertiary);font-size:11px}
.dgp-change{display:flex;align-items:center;gap:6px;padding:2px 12px;min-height:26px;min-width:0}
.dgp-change:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dgp-status{width:14px;flex:none;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:600;line-height:1}
.dgp-st-m{color:var(--dsw-alias-state-warn-primary)}
.dgp-st-a{color:var(--dsw-alias-state-success-primary)}
.dgp-st-d{color:var(--dsw-alias-state-error-primary)}
.dgp-st-r{color:var(--dsw-alias-brand-primary)}
.dgp-st-u{color:var(--dsw-alias-state-error-primary)}
.dgp-st-t{color:var(--dsw-alias-state-warn-primary)}
.dgp-path-wrap{display:flex;align-items:baseline;min-width:0;flex:1;gap:0;overflow:hidden}
.dgp-dir{color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl;text-align:left;flex:0 1 auto;min-width:0}
.dgp-name{color:var(--dsw-alias-label-primary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0}
.dgp-old{color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dgp-arrow{color:var(--dsw-alias-label-tertiary);font-size:11px;flex:none}
.dgp-stats{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;white-space:nowrap;flex:none;display:flex;gap:4px}
.dgp-add{color:var(--dsw-alias-state-success-primary)}
.dgp-del{color:var(--dsw-alias-state-error-primary)}
.dgp-binary{color:var(--dsw-alias-label-tertiary);font-size:10.5px;flex:none}
.dgp-history{display:flex;flex-direction:column}
.dgp-commit{padding:0 8px 0 12px}
.dgp-commit-row{width:100%;display:flex;align-items:flex-start;gap:4px;padding:4px 0;border:0;background:0 0;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:var(--dsw-radius-sm,4px)}
.dgp-commit-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dgp-graph{flex:none;display:block;overflow:visible}
.dgp-commit-content{flex:1;min-width:0;padding:1px 2px 0 2px;display:flex;flex-direction:column;gap:1px}
.dgp-subject{font-size:12.5px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dgp-refs{display:flex;align-items:center;gap:3px;flex-wrap:wrap;min-width:0}
.dgp-ref{font-size:10px;line-height:1.5;padding:0 4px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none}
.dgp-ref-head{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dgp-ref-remote{color:var(--dsw-alias-label-tertiary)}
.dgp-ref-tag{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.dgp-meta{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);font-size:10.5px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dgp-meta-author{overflow:hidden;text-overflow:ellipsis;min-width:0}
.dgp-chevron{margin-left:auto;color:var(--dsw-alias-label-tertiary);flex:none;padding-top:2px}
.dgp-files{padding:1px 0 7px 30px;display:flex;flex-direction:column;gap:1px}
.dgp-file{display:flex;align-items:center;gap:6px;min-height:22px;min-width:0;font-size:11.5px}
.dgp-file-status{width:14px;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;color:var(--dsw-alias-label-secondary);flex:none}
.dgp-note{padding:7px 12px;color:var(--dsw-alias-label-tertiary);font-size:11.5px}
.dgp-empty{padding:28px 18px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary)}
.dgp-empty-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dgp-empty-text{font-size:12px;color:var(--dsw-alias-label-tertiary);max-width:280px;line-height:1.5}
.dgp-empty-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:2px}
.dgp-error{padding:22px 16px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.dgp-error-icon{color:var(--dsw-alias-state-error-primary)}
.dgp-error-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dgp-error-text{font-size:12px;color:var(--dsw-alias-label-secondary);max-width:300px;line-height:1.5;overflow-wrap:anywhere}
.dgp-stale{display:flex;align-items:center;gap:6px;margin:6px 12px 0;padding:5px 8px;border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-warn-primary);font-size:11.5px}
.dgp-spinner{display:inline-block;width:12px;height:12px;border:1.5px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-label-secondary);border-radius:50%;animation:dgp-spin .8s linear infinite;flex:none}
.dgp-skeleton{display:flex;flex-direction:column;gap:6px;padding:14px 12px}
.dgp-skeleton-row{height:22px;border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-bg-layer-2);opacity:.7}
.dgp-skeleton-row:nth-child(2){width:82%}
.dgp-skeleton-row:nth-child(3){width:64%}
.dgp-skeleton-row:nth-child(4){width:73%}
.dgp-switcher{position:relative;flex:none}
.dgp-menu{position:absolute;top:calc(100% + 4px);right:0;min-width:190px;max-width:280px;max-height:280px;overflow:auto;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md,6px);background:var(--dsw-alias-bg-overlay);box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:40;padding:4px}
.dgp-menu-item{width:100%;display:flex;align-items:center;gap:6px;padding:5px 7px;border:0;border-radius:var(--dsw-radius-sm,4px);background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer;min-width:0}
.dgp-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dgp-menu-item.dgp-current{background:var(--dsw-alias-bg-layer-2)}
.dgp-menu-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dgp-menu-path{color:var(--dsw-alias-label-tertiary);font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dgp-visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.dgp-title{display:inline-flex;align-items:center;gap:6px;min-width:0}
.dgp-title-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
@keyframes dgp-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.dgp-spinner{animation:none}}
@container (max-width: 340px){
  .dgp-meta-author{display:none}
  .dgp-ahead{display:none}
  .dgp-branch{max-width:96px}
  .dgp-repo-meta{flex-wrap:wrap}
}
`;

    /* ------------------------------------------------------------------ */
    /* helpers                                                             */
    /* ------------------------------------------------------------------ */

    function formatError(error, t) {
      const code = error && typeof error.code === 'string' ? error.code : '';
      const message = error && error.message ? String(error.message) : '';
      if (code === 'git-missing') return t('error.gitMissing');
      if (code === 'not-a-repo' || code === 'not-found' || code === 'not-a-directory') return t('error.noRepo');
      if (code === 'unsafe-repo') return t('error.unsafeRepo');
      if (code === 'git-timeout') return t('error.timeout');
      if (code === 'too-large') return t('error.tooLarge');
      if (code === 'aborted') return t('error.aborted');
      if (/HTTP 401|unauthorized/i.test(message)) return t('error.unauthorized');
      if (/transport failure|connection (lost|closed)|network/i.test(message)) return t('error.connection');
      return message || t('error.generic');
    }

    async function callRpc(call, method, params, signal) {
      const result = await call(method, params, signal);
      if (!result || result.ok !== true) {
        const error = new Error((result && result.error && result.error.message) || 'Request failed.');
        error.code = (result && result.error && result.error.code) || 'internal';
        error.details = (result && result.error && result.error.details) || {};
        throw error;
      }
      return result.value;
    }

    function relativeTime(seconds, t) {
      if (!seconds) return '';
      const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
      if (diff < 60) return t('time.now');
      if (diff < 3600) return Math.floor(diff / 60) + 'm';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h';
      if (diff < 86400 * 30) return Math.floor(diff / 86400) + 'd';
      return new Date(seconds * 1000).toLocaleDateString();
    }

    function shortSha(sha) {
      return typeof sha === 'string' ? sha.slice(0, 7) : '';
    }

    function splitPath(value) {
      const normalized = String(value || '').replace(/\\/g, '/');
      const slash = normalized.lastIndexOf('/');
      if (slash < 0 || slash === normalized.length - 1) return { dir: '', name: normalized };
      return { dir: normalized.slice(0, slash + 1), name: normalized.slice(slash + 1) };
    }

    function statusClass(status) {
      switch (status) {
        case 'A':
        case '?':
          return 'dgp-st-a';
        case 'D':
          return 'dgp-st-d';
        case 'R':
        case 'C':
          return 'dgp-st-r';
        case 'U':
          return 'dgp-st-u';
        case 'T':
          return 'dgp-st-t';
        default:
          return 'dgp-st-m';
      }
    }

    const GROUP_ORDER = [
      { key: 'conflict', label: 'changes.conflicts' },
      { key: 'staged', label: 'changes.staged' },
      { key: 'unstaged', label: 'changes.unstaged' },
      { key: 'untracked', label: 'changes.untracked' },
    ];

    function groupedChanges(changes) {
      const buckets = { conflict: [], staged: [], unstaged: [], untracked: [] };
      for (const change of changes || []) {
        if (buckets[change.group]) buckets[change.group].push(change);
      }
      for (const bucket of Object.values(buckets)) {
        bucket.sort((left, right) => left.path.localeCompare(right.path));
      }
      return GROUP_ORDER.map((group) => ({ ...group, items: buckets[group.key] })).filter(
        (group) => group.items.length > 0,
      );
    }

    function countText(value, truncated) {
      return truncated ? String(value) + '+' : String(value);
    }

    function layoutGraph(commits) {
      const lanes = [];
      const rows = [];

      for (const commit of commits || []) {
        let lane = lanes.indexOf(commit.sha);
        if (lane < 0) {
          lane = lanes.indexOf(null);
          if (lane < 0) {
            lane = lanes.length;
            lanes.push(null);
          }
        }

        const before = lanes.slice();
        lanes[lane] = null;
        const parents = [];

        for (let index = 0; index < commit.parents.length; index += 1) {
          const parent = commit.parents[index];
          const existing = lanes.indexOf(parent);
          if (existing >= 0) {
            parents.push({ sha: parent, lane: existing });
            continue;
          }
          if (index === 0) {
            lanes[lane] = parent;
            parents.push({ sha: parent, lane });
          } else {
            let free = lanes.indexOf(null);
            if (free < 0) {
              free = lanes.length;
              lanes.push(null);
            }
            lanes[free] = parent;
            parents.push({ sha: parent, lane: free });
          }
        }

        // Keep the commit's display fields on the row; `parents` is replaced by
        // the lane-aware parent list the SVG needs.
        rows.push({ ...commit, lane, before, after: lanes.slice(), parents });
      }

      let maxLanes = 0;
      for (const row of rows) maxLanes = Math.max(maxLanes, row.before.length, row.after.length);
      return { rows, maxLanes };
    }

    function useDocumentHidden() {
      const [hidden, setHidden] = useState(
        () => typeof document !== 'undefined' && document.hidden === true,
      );
      useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const update = () => setHidden(document.hidden === true);
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
      }, []);
      return hidden;
    }

    function useNoSessions() {
      return undefined;
    }

    function readStored(sessionId) {
      if (!sessionId || typeof localStorage === 'undefined') return {};
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + sessionId);
        if (!raw) return {};
        const value = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
        const view = value.view === 'changes' || value.view === 'history' ? value.view : 'all';
        return {
          root: typeof value.root === 'string' && value.root ? value.root : null,
          selectedRepo: typeof value.selectedRepo === 'string' && value.selectedRepo ? value.selectedRepo : null,
          view,
        };
      } catch {
        return {};
      }
    }

    async function mapLimit(items, limit, worker) {
      let next = 0;
      const count = Math.min(limit, items.length);
      const runners = [];
      for (let index = 0; index < count; index += 1) {
        runners.push(
          (async () => {
            while (true) {
              const current = next;
              next += 1;
              if (current >= items.length) return;
              await worker(items[current]);
            }
          })(),
        );
      }
      await Promise.all(runners);
    }

    /* ------------------------------------------------------------------ */
    /* icons                                                               */
    /* ------------------------------------------------------------------ */

    function IconBranch({ size = 16 }) {
      return h(
        'svg',
        {
          className: 'dgp-icon',
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': true,
        },
        [
          h('path', {
            key: 'trunk',
            d: 'M7 4v16',
            stroke: 'currentColor',
            strokeWidth: 1.7,
            strokeLinecap: 'round',
          }),
          h('path', {
            key: 'branch',
            d: 'M7 12c0-4 10-4 10-8',
            stroke: 'currentColor',
            strokeWidth: 1.7,
            strokeLinecap: 'round',
          }),
          h('circle', { key: 'a', cx: 7, cy: 4, r: 2.4, fill: 'currentColor' }),
          h('circle', { key: 'b', cx: 7, cy: 20, r: 2.4, fill: 'currentColor' }),
          h('circle', { key: 'c', cx: 17, cy: 4, r: 2.4, fill: 'currentColor' }),
        ],
      );
    }

    function IconFolder({ size = 15 }) {
      return h(
        'svg',
        {
          className: 'dgp-icon',
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': true,
        },
        h('path', {
          d: 'M3.5 7.5h6l1.8 2h9.2v8.8a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7V7.5Z',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinejoin: 'round',
        }),
      );
    }

    function IconRefresh({ size = 15 }) {
      return h(
        'svg',
        {
          className: 'dgp-icon',
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': true,
        },
        [
          h('path', {
            key: 'arc',
            d: 'M19 8.5A8 8 0 1 0 20 14',
            stroke: 'currentColor',
            strokeWidth: 1.7,
            strokeLinecap: 'round',
          }),
          h('path', {
            key: 'tip',
            d: 'M19 4v5h-5',
            stroke: 'currentColor',
            strokeWidth: 1.7,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }),
        ],
      );
    }

    function IconChevron({ size = 12, open = false }) {
      return h(
        'svg',
        {
          className: 'dgp-icon',
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': true,
          style: { transform: open ? 'rotate(180deg)' : 'none' },
        },
        h('path', {
          d: 'm6 9 6 6 6-6',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    function IconBack({ size = 15 }) {
      return h(
        'svg',
        {
          className: 'dgp-icon',
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': true,
        },
        h('path', {
          d: 'M19 12H5m6-6-6 6 6 6',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    function IconAlert({ size = 22 }) {
      return h(
        'svg',
        {
          className: 'dgp-error-icon dgp-icon',
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          'aria-hidden': true,
        },
        [
          h('circle', { key: 'c', cx: 12, cy: 12, r: 9, stroke: 'currentColor', strokeWidth: 1.6 }),
          h('path', {
            key: 'l',
            d: 'M12 7.5v5',
            stroke: 'currentColor',
            strokeWidth: 1.7,
            strokeLinecap: 'round',
          }),
          h('circle', { key: 'd', cx: 12, cy: 16.2, r: 1, fill: 'currentColor' }),
        ],
      );
    }

    function GuideArtwork() {
      return h(
        'svg',
        {
          viewBox: '0 0 32 32',
          width: 28,
          height: 28,
          'aria-hidden': true,
          className: 'dgp-icon',
        },
        [
          h('rect', { key: 'bg', x: 1, y: 1, width: 30, height: 30, rx: 8, fill: '#2f5d62' }),
          h('path', {
            key: 'trunk',
            d: 'M11 8v16',
            stroke: '#f4faf8',
            strokeWidth: 2.2,
            strokeLinecap: 'round',
          }),
          h('path', {
            key: 'branch',
            d: 'M11 16c0-4 10-4 10-8',
            stroke: '#f4faf8',
            strokeWidth: 2.2,
            strokeLinecap: 'round',
          }),
          h('circle', { key: 'a', cx: 11, cy: 8, r: 2.4, fill: '#f4faf8' }),
          h('circle', { key: 'b', cx: 11, cy: 24, r: 2.4, fill: '#f4faf8' }),
          h('circle', { key: 'c', cx: 21, cy: 8, r: 2.4, fill: '#f4faf8' }),
        ],
      );
    }

    /* ------------------------------------------------------------------ */
    /* small components                                                    */
    /* ------------------------------------------------------------------ */

    function IconButton({ label, onClick, disabled, children }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dgp-icon-btn',
          'aria-label': label,
          title: label,
          onClick,
          disabled,
        },
        children,
      );
    }

    function Spinner() {
      return h('span', { className: 'dgp-spinner', 'aria-hidden': true });
    }

    function BranchChip({ branch, detached, oid, t }) {
      const label = detached
        ? t('detail.detached') + (oid ? ' @ ' + shortSha(oid) : '')
        : branch || t('detail.unknown');
      return h(
        'span',
        { className: 'dgp-branch', title: label },
        h(IconBranch, { size: 12 }),
        h('span', { className: 'dgp-branch-name' }, label),
      );
    }

    function AheadBehind({ ahead, behind, t }) {
      if (!ahead && !behind) return null;
      const parts = [];
      if (ahead) {
        parts.push(
          h(
            'span',
            { key: 'ahead', className: 'dgp-ahead', title: String(ahead) + ' ' + t('detail.ahead') },
            '\u2191' + ahead,
          ),
        );
      }
      if (behind) {
        parts.push(
          h(
            'span',
            { key: 'behind', className: 'dgp-ahead', title: String(behind) + ' ' + t('detail.behind') },
            '\u2193' + behind,
          ),
        );
      }
      return h('span', { className: 'dgp-row', style: { gap: 4 } }, parts);
    }

    function Dirty({ count, t }) {
      if (!count) return null;
      return h(
        'span',
        { className: 'dgp-count', title: String(count) + ' ' + t('detail.changedFiles') },
        h('span', { className: 'dgp-dot' }),
        String(count),
      );
    }

    function RefChip({ item }) {
      return h(
        'span',
        { className: 'dgp-ref dgp-ref-' + item.kind, title: item.name },
        item.name,
      );
    }

    function PathLabel({ value }) {
      const parts = splitPath(value);
      return h(
        'span',
        { className: 'dgp-path-wrap', title: value },
        parts.dir ? h('span', { className: 'dgp-dir' }, parts.dir) : null,
        h('span', { className: 'dgp-name' }, parts.name),
      );
    }

    function ChangeRow({ change, t }) {
      const isRename = (change.status === 'R' || change.status === 'C') && change.oldPath;
      const stats = [];
      if (change.binary) {
        stats.push(h('span', { key: 'bin', className: 'dgp-binary' }, t('changes.binary')));
      } else if (change.additions !== undefined || change.deletions !== undefined) {
        if (change.additions || change.deletions) {
          stats.push(
            h('span', { key: 'add', className: 'dgp-add' }, '+' + (change.additions || 0)),
            h('span', { key: 'del', className: 'dgp-del' }, '\u2212' + (change.deletions || 0)),
          );
        }
      }

      let pathNode;
      if (isRename) {
        pathNode = h(
          'span',
          { className: 'dgp-path-wrap', title: change.oldPath + ' \u2192 ' + change.path },
          h('span', { className: 'dgp-old' }, change.oldPath),
          h('span', { className: 'dgp-arrow' }, '\u2192'),
          h('span', { className: 'dgp-name' }, splitPath(change.path).name),
        );
      } else {
        pathNode = h(PathLabel, { value: change.path });
      }

      return h(
        'div',
        { className: 'dgp-change' },
        h(
          'span',
          { className: 'dgp-status ' + statusClass(change.status), title: change.status },
          change.status,
        ),
        pathNode,
        stats.length ? h('span', { className: 'dgp-stats' }, stats) : null,
      );
    }

    function ChangesList({ changes, t, truncated }) {
      const [collapsed, setCollapsed] = useState({});
      const groups = useMemo(() => groupedChanges(changes), [changes]);

      if (!changes || changes.length === 0) {
        return h('div', { className: 'dgp-note' }, t('changes.clean'));
      }

      return h(
        'div',
        null,
        groups.map((group) =>
          h(
            'div',
            { key: group.key, className: 'dgp-change-group' },
            h(
              'button',
              {
                type: 'button',
                className: 'dgp-group-head',
                'aria-expanded': !collapsed[group.key],
                onClick: () =>
                  setCollapsed((current) => ({ ...current, [group.key]: !current[group.key] })),
              },
              h(IconChevron, { size: 10, open: !collapsed[group.key] }),
              h('span', { className: 'dgp-group-title' }, t(group.label)),
              h('span', { className: 'dgp-group-count' }, String(group.items.length)),
            ),
            collapsed[group.key]
              ? null
              : group.items.map((change, index) =>
                  h(ChangeRow, {
                    key: group.key + ':' + change.path + ':' + (change.oldPath || '') + ':' + index,
                    change,
                    t,
                  }),
                ),
          ),
        ),
        truncated ? h('div', { className: 'dgp-note' }, t('changes.truncated')) : null,
      );
    }

    function GraphRow({ row, maxLanes, headSha }) {
      const width = maxLanes * 14 + 10;
      const height = 24;
      const x = (lane) => lane * 14 + 7;
      const children = [];

      for (let lane = 0; lane < maxLanes; lane += 1) {
        const before = row.before[lane];
        const after = row.after[lane];
        if (lane === row.lane) {
          if (before) {
            children.push(
              h('line', {
                key: 't' + lane,
                x1: x(lane),
                y1: 0,
                x2: x(lane),
                y2: 12,
                stroke: LANE_COLORS[lane % LANE_COLORS.length],
                strokeWidth: 1.5,
                opacity: 0.8,
              }),
            );
          }
          if (after) {
            children.push(
              h('line', {
                key: 'b' + lane,
                x1: x(lane),
                y1: 12,
                x2: x(lane),
                y2: height,
                stroke: LANE_COLORS[lane % LANE_COLORS.length],
                strokeWidth: 1.5,
                opacity: 0.8,
              }),
            );
          }
        } else if (before || after) {
          children.push(
            h('line', {
              key: 'l' + lane,
              x1: x(lane),
              y1: 0,
              x2: x(lane),
              y2: height,
              stroke: LANE_COLORS[lane % LANE_COLORS.length],
              strokeWidth: 1.5,
              opacity: 0.65,
            }),
          );
        }
      }

      for (const parent of row.parents) {
        if (parent.lane === row.lane && row.after[row.lane] === parent.sha) continue;
        children.push(
          h('path', {
            key: 'p' + parent.lane + ':' + parent.sha,
            d:
              'M ' +
              x(row.lane) +
              ' 12 C ' +
              x(row.lane) +
              ' 18, ' +
              x(parent.lane) +
              ' 18, ' +
              x(parent.lane) +
              ' ' +
              height,
            fill: 'none',
            stroke: LANE_COLORS[parent.lane % LANE_COLORS.length],
            strokeWidth: 1.5,
            opacity: 0.8,
          }),
        );
      }

      children.push(
        h('circle', {
          key: 'node',
          cx: x(row.lane),
          cy: 12,
          r: 3.6,
          fill: LANE_COLORS[row.lane % LANE_COLORS.length],
        }),
      );
      if (headSha === row.sha) {
        children.push(
          h('circle', {
            key: 'head',
            cx: x(row.lane),
            cy: 12,
            r: 6,
            fill: 'none',
            stroke: 'var(--dsw-alias-label-primary)',
            strokeWidth: 1.2,
            opacity: 0.7,
          }),
        );
      }

      return h(
        'svg',
        {
          className: 'dgp-graph',
          width,
          height,
          viewBox: '0 0 ' + width + ' ' + height,
          'aria-hidden': true,
        },
        children,
      );
    }

    function CommitFiles({ repo, sha, state, isMerge, t }) {
      if (!state || state.loading) {
        return h('div', { className: 'dgp-note' }, h(Spinner), ' ', t('commit.loading'));
      }
      if (state.error) {
        return h('div', { className: 'dgp-note' }, t('commit.error') + ' ' + state.error);
      }
      const files = state.files || [];
      if (files.length === 0) {
        return h('div', { className: 'dgp-note' }, t('history.noFiles'));
      }
      return h(
        'div',
        { className: 'dgp-files' },
        isMerge ? h('div', { className: 'dgp-note' }, t('history.vsFirstParent')) : null,
        files.map((file) =>
          h(
            'div',
            { key: repo + ':' + sha + ':' + file.path, className: 'dgp-file' },
            h(
              'span',
              { className: 'dgp-file-status ' + statusClass(file.status) },
              file.status,
            ),
            h(
              'span',
              { className: 'dgp-path-wrap', title: file.oldPath ? file.oldPath + ' \u2192 ' + file.path : file.path },
              file.oldPath
                ? h(
                    React.Fragment,
                    null,
                    h('span', { className: 'dgp-old' }, file.oldPath),
                    h('span', { className: 'dgp-arrow' }, '\u2192'),
                    h('span', { className: 'dgp-name' }, splitPath(file.path).name),
                  )
                : h(PathLabel, { value: file.path }),
            ),
            file.binary
              ? h('span', { className: 'dgp-binary' }, t('changes.binary'))
              : h(
                  'span',
                  { className: 'dgp-stats' },
                  h('span', { className: 'dgp-add' }, '+' + (file.additions || 0)),
                  h('span', { className: 'dgp-del' }, '\u2212' + (file.deletions || 0)),
                ),
          ),
        ),
      );
    }

    function CommitRow({ repo, row, maxLanes, headSha, t, expanded, cache, onToggle }) {
      const key = repo + ':' + row.sha;
      const open = expanded[key] === true;
      const state = cache[key];

      return h(
        'div',
        { className: 'dgp-commit' },
        h(
          'button',
          {
            type: 'button',
            className: 'dgp-commit-row',
            'aria-expanded': open,
            onClick: () => onToggle(row.sha),
          },
          h(GraphRow, { row, maxLanes, headSha }),
          h(
            'span',
            { className: 'dgp-commit-content' },
            (row.refs || []).length
              ? h(
                  'span',
                  { className: 'dgp-refs' },
                  row.refs.map((ref) => h(RefChip, { key: ref.kind + ':' + ref.name, item: ref })),
                )
              : null,
            h(
              'span',
              { className: 'dgp-subject', title: row.subject },
              row.subject || t('history.noSubject'),
            ),
            h(
              'span',
              { className: 'dgp-meta' },
              h('span', { className: 'dgp-meta-author' }, row.author || ''),
              h('span', { className: 'dgp-meta-time' }, relativeTime(row.authorTime, t)),
            ),
          ),
          h('span', { className: 'dgp-chevron' }, h(IconChevron, { size: 11, open })),
        ),
        open
          ? h(CommitFiles, {
              repo,
              sha: row.sha,
              state,
              isMerge: row.parents.length > 1,
              t,
            })
          : null,
      );
    }

    function HistoryList({ repo, commits, headSha, t, expanded, cache, onToggle, limit, truncated }) {
      const layout = useMemo(() => layoutGraph(commits || []), [commits]);
      if (!commits || commits.length === 0) {
        return h('div', { className: 'dgp-note' }, t('history.empty'));
      }
      const visible = limit ? layout.rows.slice(0, limit) : layout.rows;
      return h(
        'div',
        { className: 'dgp-history' },
        visible.map((row, index) =>
          h(CommitRow, {
            key: row.sha,
            repo,
            row,
            maxLanes: layout.maxLanes,
            headSha,
            t,
            expanded,
            cache,
            onToggle: (sha) => onToggle(row.sha),
          }),
        ),
        truncated ? h('div', { className: 'dgp-note' }, t('history.showing')) : null,
      );
    }

    function SummaryCard({ value, t }) {
      const summary = value.summary;
      const counts = summary.counts;
      const total = counts.staged + counts.unstaged + counts.untracked + counts.conflicts;
      return h(
        'div',
        { className: 'dgp-summary' },
        h(
          'div',
          { className: 'dgp-summary-row' },
          h(BranchChip, {
            branch: summary.branch,
            detached: summary.detached,
            oid: summary.oid,
            t,
          }),
          h(AheadBehind, { ahead: summary.ahead, behind: summary.behind, t }),
          summary.upstream
            ? h('span', { className: 'dgp-summary-meta', title: summary.upstream }, summary.upstream)
            : null,
          total
            ? h(Dirty, { count: summary.changedFiles, t })
            : h('span', { className: 'dgp-clean' }, t('repo.clean')),
        ),
        total
          ? h(
              'div',
              { className: 'dgp-counts' },
              counts.staged
                ? h(
                    'span',
                    { className: 'dgp-count-item' },
                    t('changes.staged'),
                    h('span', { className: 'dgp-group-count' }, String(counts.staged)),
                  )
                : null,
              counts.unstaged
                ? h(
                    'span',
                    { className: 'dgp-count-item' },
                    t('changes.unstaged'),
                    h('span', { className: 'dgp-group-count' }, String(counts.unstaged)),
                  )
                : null,
              counts.untracked
                ? h(
                    'span',
                    { className: 'dgp-count-item' },
                    t('changes.untracked'),
                    h('span', { className: 'dgp-group-count' }, String(counts.untracked)),
                  )
                : null,
              counts.conflicts
                ? h(
                    'span',
                    { className: 'dgp-count-item' },
                    t('changes.conflicts'),
                    h('span', { className: 'dgp-group-count' }, String(counts.conflicts)),
                  )
                : null,
            )
          : null,
        value.headCommit
          ? h(
              'div',
              { className: 'dgp-summary-meta' },
              h(
                'span',
                { title: value.headCommit.subject },
                shortSha(value.headCommit.sha) + ' ' + value.headCommit.subject,
              ),
              h('span', null, relativeTime(value.headCommit.authorTime, t)),
            )
          : null,
      );
    }

    function RepoSwitcher({ repos, current, onSelect, t }) {
      const [open, setOpen] = useState(false);
      const rootRef = useRef(null);

      useEffect(() => {
        if (!open) return undefined;
        const onPointer = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
        };
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
          document.removeEventListener('mousedown', onPointer);
          document.removeEventListener('keydown', onKey);
        };
      }, [open]);

      if (!repos || repos.length <= 1) return null;

      return h(
        'span',
        { className: 'dgp-switcher', ref: rootRef },
        h(
          IconButton,
          {
            label: t('detail.repoMenu'),
            onClick: () => setOpen((value) => !value),
          },
          h(IconChevron, { size: 13, open }),
        ),
        open
          ? h(
              'div',
              { className: 'dgp-menu', role: 'menu' },
              repos.map((repo) =>
                h(
                  'button',
                  {
                    key: repo.path,
                    type: 'button',
                    role: 'menuitem',
                    className:
                      'dgp-menu-item' + (repo.path === current ? ' dgp-current' : ''),
                    onClick: () => {
                      setOpen(false);
                      onSelect(repo.path);
                    },
                  },
                  h(IconBranch, { size: 12 }),
                  h('span', { className: 'dgp-menu-name' }, repo.name),
                ),
              ),
            )
          : null,
      );
    }

    /* ------------------------------------------------------------------ */
    /* overview and detail                                                 */
    /* ------------------------------------------------------------------ */

    function Overview({
      root,
      repos,
      summaries,
      truncated,
      t,
      discovered,
      discoverError,
      loading,
      onSelect,
      onChoose,
      onRefresh,
      onUseSession,
      canUseSession,
    }) {
      const refreshing = loading || Object.values(summaries).some((entry) => entry && entry.loading);
      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'dgp-header' },
          h(
            'div',
            { className: 'dgp-row' },
            h('span', { className: 'dgp-grow dgp-path', title: root }, root),
            h(
              'span',
              { className: 'dgp-actions' },
              h(
                IconButton,
                { label: t('overview.choose'), onClick: onChoose },
                h(IconFolder),
              ),
              h(
                IconButton,
                { label: t('action.refresh'), onClick: onRefresh },
                refreshing ? h(Spinner) : h(IconRefresh),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dgp-overview-sub' },
            discovered
              ? String(repos.length) + ' ' + t('overview.repositories') + ' \u00b7 ' + t('overview.refresh')
              : t('overview.reading'),
            truncated ? ' \u00b7 ' + t('overview.truncated') : '',
          ),
        ),
        h(
          'div',
          { className: 'dgp-body' },
          !discovered && !discoverError
            ? h('div', { className: 'dgp-skeleton' }, [
                h('div', { key: 1, className: 'dgp-skeleton-row' }),
                h('div', { key: 2, className: 'dgp-skeleton-row' }),
                h('div', { key: 3, className: 'dgp-skeleton-row' }),
                h('div', { key: 4, className: 'dgp-skeleton-row' }),
              ])
            : discoverError && repos.length === 0
              ? h(ErrorState, {
                  message: discoverError,
                  t,
                  onRetry: onRefresh,
                  onChoose,
                  onUseSession: canUseSession ? onUseSession : undefined,
                })
              : repos.length === 0
                ? h(EmptyState, {
                    t,
                    title: t('overview.noRepos'),
                    text: t('overview.noReposHint'),
                    onChoose,
                    onUseSession: canUseSession ? onUseSession : undefined,
                  })
                : h(
                    'div',
                    null,
                    discoverError
                      ? h('div', { className: 'dgp-stale' }, discoverError)
                      : null,
                    repos.map((repo) => {
                      const summary = summaries[repo.path];
                      const value = summary && summary.value;
                      const error = summary && summary.error;
                      return h(
                        'button',
                        {
                          key: repo.path,
                          type: 'button',
                          className: 'dgp-repo-row',
                          onClick: () => onSelect(repo.path),
                        },
                        value && value.changedFiles
                          ? h('span', { className: 'dgp-dot' })
                          : h('span', { style: { width: 6, flex: 'none' } }),
                        h(
                          'span',
                          { className: 'dgp-repo-main' },
                          h(
                            'span',
                            { className: 'dgp-repo-line' },
                            h('span', { className: 'dgp-repo-name-text' }, repo.name),
                            value
                              ? h(BranchChip, {
                                  branch: value.branch,
                                  detached: value.detached,
                                  oid: value.oid,
                                  t,
                                })
                              : null,
                          ),
                          error
                            ? h('span', { className: 'dgp-repo-error' }, error)
                            : value
                              ? h(
                                  'span',
                                  { className: 'dgp-repo-meta' },
                                  h(AheadBehind, {
                                    ahead: value.ahead,
                                    behind: value.behind,
                                    t,
                                  }),
                                  value.changedFiles
                                    ? h(
                                        'span',
                                        { className: 'dgp-count' },
                                        String(value.changedFiles) + ' ' + t('detail.changedFiles'),
                                      )
                                    : h('span', { className: 'dgp-clean' }, t('repo.clean')),
                                )
                              : h(
                                  'span',
                                  { className: 'dgp-repo-meta' },
                                  summary && summary.loading
                                    ? h(Spinner)
                                    : t('loading'),
                                ),
                        ),
                      );
                    }),
                  ),
        ),
      );
    }

    function RepoDetail({
      repo,
      data,
      t,
      view,
      onView,
      onBack,
      canBack,
      repos,
      onSwitch,
      onChoose,
      onRefresh,
      expanded,
      cache,
      onToggleCommit,
    }) {
      const value = data && data.value;
      const error = data && data.error;
      const summary = value && value.summary;
      const name = summary ? splitPath(summary.repo).name : splitPath(repo).name;
      const pathValue = summary ? summary.repo : repo;
      const changes = (value && value.changes) || [];
      const commits = (value && value.commits) || [];
      const changedCount = summary ? summary.changedFiles : changes.length;
      const historyCount = commits.length + (value && value.commitsTruncated ? 1 : 0);

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'dgp-header' },
          h(
            'div',
            { className: 'dgp-row' },
            canBack
              ? h(
                  IconButton,
                  { label: t('action.back'), onClick: onBack },
                  h(IconBack),
                )
              : null,
            h('span', { className: 'dgp-repo-name dgp-grow', title: name }, name),
            summary
              ? h(BranchChip, {
                  branch: summary.branch,
                  detached: summary.detached,
                  oid: summary.oid,
                  t,
                })
              : null,
            summary ? h(AheadBehind, { ahead: summary.ahead, behind: summary.behind, t }) : null,
            summary ? h(Dirty, { count: summary.changedFiles, t }) : null,
            h(
              'span',
              { className: 'dgp-actions' },
              h(
                IconButton,
                { label: t('action.refresh'), onClick: onRefresh },
                data && data.loading ? h(Spinner) : h(IconRefresh),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dgp-row' },
            h('span', { className: 'dgp-path dgp-grow', title: pathValue }, pathValue),
            h(
              'span',
              { className: 'dgp-actions' },
              h(RepoSwitcher, { repos, current: repo, onSelect: onSwitch, t }),
              h(
                IconButton,
                { label: t('overview.choose'), onClick: onChoose },
                h(IconFolder),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dgp-tabs', role: 'tablist' },
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                'aria-selected': view === 'all',
                className: 'dgp-tab' + (view === 'all' ? ' dgp-active' : ''),
                onClick: () => onView('all'),
              },
              t('detail.all'),
            ),
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                'aria-selected': view === 'changes',
                className: 'dgp-tab' + (view === 'changes' ? ' dgp-active' : ''),
                onClick: () => onView('changes'),
              },
              t('detail.changes'),
              h('span', { className: 'dgp-tab-count' }, countText(changedCount, summary && summary.truncated)),
            ),
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                'aria-selected': view === 'history',
                className: 'dgp-tab' + (view === 'history' ? ' dgp-active' : ''),
                onClick: () => onView('history'),
              },
              t('detail.history'),
              h('span', { className: 'dgp-tab-count' }, countText(historyCount, value && value.commitsTruncated)),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dgp-body' },
          !value && !error
            ? h('div', { className: 'dgp-skeleton' }, [
                h('div', { key: 1, className: 'dgp-skeleton-row' }),
                h('div', { key: 2, className: 'dgp-skeleton-row' }),
                h('div', { key: 3, className: 'dgp-skeleton-row' }),
                h('div', { key: 4, className: 'dgp-skeleton-row' }),
              ])
            : !value && error
              ? h(ErrorState, {
                  message: error,
                  t,
                  onRetry: onRefresh,
                  onBack: canBack ? onBack : undefined,
                  onChoose,
                })
              : h(
                  React.Fragment,
                  null,
                  error ? h('div', { className: 'dgp-stale' }, error) : null,
                  view === 'all'
                    ? h(
                        React.Fragment,
                        null,
                        h(SummaryCard, { value, t }),
                        h(
                          'div',
                          { className: 'dgp-section' },
                          h(
                            'div',
                            { className: 'dgp-section-head' },
                            h('span', { className: 'dgp-section-title' }, t('detail.changes')),
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'dgp-section-action',
                                onClick: () => onView('changes'),
                              },
                              t('action.viewAll'),
                            ),
                          ),
                          changes.length
                            ? h(ChangesList, {
                                changes: changes.slice(0, 5),
                                t,
                                truncated: false,
                              })
                            : h('div', { className: 'dgp-note' }, t('changes.clean')),
                        ),
                        h(
                          'div',
                          { className: 'dgp-section' },
                          h(
                            'div',
                            { className: 'dgp-section-head' },
                            h('span', { className: 'dgp-section-title' }, t('detail.history')),
                            h(
                              'button',
                              {
                                type: 'button',
                                className: 'dgp-section-action',
                                onClick: () => onView('history'),
                              },
                              t('action.fullHistory'),
                            ),
                          ),
                          h(HistoryList, {
                            repo,
                            commits,
                            headSha: value.headCommit && value.headCommit.sha,
                            t,
                            expanded,
                            cache,
                            onToggle: onToggleCommit,
                            limit: 8,
                            truncated: value.commitsTruncated,
                          }),
                        ),
                      )
                    : view === 'changes'
                      ? h(ChangesList, {
                          changes,
                          t,
                          truncated: summary && summary.truncated,
                        })
                      : h(HistoryList, {
                          repo,
                          commits,
                          headSha: value.headCommit && value.headCommit.sha,
                          t,
                          expanded,
                          cache,
                          onToggle: onToggleCommit,
                          truncated: value.commitsTruncated,
                        }),
                ),
        ),
      );
    }

    function EmptyState({ t, title, text, onChoose, onUseSession }) {
      return h(
        'div',
        { className: 'dgp-empty' },
        h(IconBranch, { size: 28 }),
        h('div', { className: 'dgp-empty-title' }, title),
        h('div', { className: 'dgp-empty-text' }, text),
        h(
          'div',
          { className: 'dgp-empty-actions' },
          onChoose
            ? h(
                'button',
                { type: 'button', className: 'dgp-btn dgp-btn-primary', onClick: onChoose },
                t('action.choose'),
              )
            : null,
          onUseSession
            ? h(
                'button',
                { type: 'button', className: 'dgp-btn', onClick: onUseSession },
                t('overview.useSession'),
              )
            : null,
        ),
      );
    }

    function ErrorState({ message, t, onRetry, onChoose, onBack, onUseSession }) {
      return h(
        'div',
        { className: 'dgp-error' },
        h(IconAlert),
        h('div', { className: 'dgp-error-title' }, t('repo.failed')),
        h('div', { className: 'dgp-error-text' }, message),
        h(
          'div',
          { className: 'dgp-empty-actions' },
          onRetry
            ? h(
                'button',
                { type: 'button', className: 'dgp-btn dgp-btn-primary', onClick: onRetry },
                t('action.retry'),
              )
            : null,
          onBack
            ? h(
                'button',
                { type: 'button', className: 'dgp-btn', onClick: onBack },
                t('action.back'),
              )
            : null,
          onChoose
            ? h(
                'button',
                { type: 'button', className: 'dgp-btn', onClick: onChoose },
                t('overview.choose'),
              )
            : null,
          onUseSession
            ? h(
                'button',
                { type: 'button', className: 'dgp-btn', onClick: onUseSession },
                t('overview.useSession'),
              )
            : null,
        ),
      );
    }

    /* ------------------------------------------------------------------ */
    /* body                                                                */
    /* ------------------------------------------------------------------ */

    function GitBody(props) {
      const {
        useTabInfo,
        sessionId,
        useSessions,
        t: tProp,
        call,
        subscribeConnection,
        connectionState,
        pickDirectory,
      } = props;
      const t = typeof tProp === 'function' ? tProp : (key) => EN[key] || key;
      const tab = useTabInfo().tab;
      const sessionsHook = typeof useSessions === 'function' ? useSessions : useNoSessions;
      const cwd = sessionsHook((store) => (store && store.byId ? store.byId[sessionId]?.cwd : undefined));
      const hidden = useDocumentHidden();
      const visible = tab.visible !== false;

      const stored = useMemo(() => readStored(sessionId), [sessionId]);
      const [root, setRoot] = useState(() => stored.root || null);
      const [selectedRepo, setSelectedRepo] = useState(() => stored.selectedRepo || null);
      const [view, setView] = useState(() => stored.view || 'all');
      const [repos, setRepos] = useState([]);
      const [reposTruncated, setReposTruncated] = useState(false);
      const [summaries, setSummaries] = useState({});
      const [repoData, setRepoData] = useState({});
      const [expanded, setExpanded] = useState({});
      const [commitCache, setCommitCache] = useState({});
      const [discoverError, setDiscoverError] = useState(null);
      const [discovered, setDiscovered] = useState(false);
      const [discoverLoading, setDiscoverLoading] = useState(false);
      const [refresh, setRefresh] = useState({ n: 0, fresh: false });
      const alive = useRef(true);

      useEffect(() => {
        alive.current = true;
        return () => {
          alive.current = false;
        };
      }, []);

      useEffect(() => {
        if (!sessionId || typeof localStorage === 'undefined') return;
        try {
          localStorage.setItem(
            STORAGE_PREFIX + sessionId,
            JSON.stringify({ root, selectedRepo, view }),
          );
        } catch {
          // Storage is best-effort.
        }
      }, [sessionId, root, selectedRepo, view]);

      useEffect(() => {
        if (root === null && cwd) setRoot(cwd);
      }, [root, cwd]);

      useEffect(() => {
        if (typeof subscribeConnection !== 'function') return undefined;
        return subscribeConnection(() => {
          if (typeof connectionState === 'function' && connectionState() === 'connected') {
            setRefresh((current) => ({ n: current.n + 1, fresh: true }));
          }
        });
      }, [subscribeConnection, connectionState]);

      useEffect(() => {
        if (!root || hidden || !visible) return undefined;
        let cancelled = false;
        let timer = null;
        let first = true;
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        if (tab.signal) tab.signal.addEventListener('abort', onAbort);

        const tick = async () => {
          if (cancelled) return;
          const fresh = first && refresh.fresh;
          first = false;
          setDiscoverLoading(true);
          try {
            const value = await callRpc(call, 'discover', { dir: root, fresh }, controller.signal);
            if (cancelled || !alive.current) return;
            setRepos(value.repos);
            setReposTruncated(value.truncated === true);
            setDiscoverError(null);
            setDiscovered(true);
            setSelectedRepo((current) => {
              if (current && value.repos.some((repo) => repo.path === current)) return current;
              return value.repos.length === 1 ? value.repos[0].path : null;
            });
          } catch (error) {
            if (cancelled || error?.code === 'aborted' || !alive.current) return;
            setDiscoverError(formatError(error, t));
            setDiscovered(true);
          } finally {
            if (!cancelled && alive.current) {
              setDiscoverLoading(false);
              timer = setTimeout(tick, 60_000);
            }
          }
        };

        tick();
        return () => {
          cancelled = true;
          clearTimeout(timer);
          if (tab.signal) tab.signal.removeEventListener('abort', onAbort);
          controller.abort();
        };
      }, [root, refresh.n, hidden, visible, call, tab.signal]);

      useEffect(() => {
        if (!root || !repos.length || selectedRepo || hidden || !visible) return undefined;
        let cancelled = false;
        let timer = null;
        let first = true;
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        if (tab.signal) tab.signal.addEventListener('abort', onAbort);

        const tick = async () => {
          if (cancelled) return;
          const fresh = first && refresh.fresh;
          first = false;
          await mapLimit(repos, 4, async (repo) => {
            if (cancelled || !alive.current) return;
            setSummaries((current) => ({
              ...current,
              [repo.path]: { ...(current[repo.path] || {}), loading: true },
            }));
            try {
              const value = await callRpc(
                call,
                'summary',
                { repo: repo.path, fresh },
                controller.signal,
              );
              if (cancelled || !alive.current) return;
              setSummaries((current) => ({
                ...current,
                [repo.path]: { value, loading: false },
              }));
            } catch (error) {
              if (cancelled || error?.code === 'aborted' || !alive.current) return;
              setSummaries((current) => ({
                ...current,
                [repo.path]: {
                  ...(current[repo.path] || {}),
                  loading: false,
                  error: formatError(error, t),
                },
              }));
            }
          });
          if (!cancelled && alive.current) timer = setTimeout(tick, 10_000);
        };

        tick();
        return () => {
          cancelled = true;
          clearTimeout(timer);
          if (tab.signal) tab.signal.removeEventListener('abort', onAbort);
          controller.abort();
        };
      }, [root, repos, selectedRepo, refresh.n, hidden, visible, call, tab.signal]);

      useEffect(() => {
        if (!selectedRepo || hidden || !visible) return undefined;
        let cancelled = false;
        let timer = null;
        let first = true;
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        if (tab.signal) tab.signal.addEventListener('abort', onAbort);

        const tick = async () => {
          if (cancelled) return;
          const fresh = first && refresh.fresh;
          first = false;
          setRepoData((current) => {
            if (current[selectedRepo]?.value) return current;
            return { ...current, [selectedRepo]: { ...(current[selectedRepo] || {}), loading: true } };
          });
          try {
            const value = await callRpc(
              call,
              'repo',
              { repo: selectedRepo, fresh },
              controller.signal,
            );
            if (cancelled || !alive.current) return;
            setRepoData((current) => ({
              ...current,
              [selectedRepo]: { value, loading: false, error: null },
            }));
          } catch (error) {
            if (cancelled || error?.code === 'aborted' || !alive.current) return;
            setRepoData((current) => ({
              ...current,
              [selectedRepo]: {
                ...(current[selectedRepo] || {}),
                loading: false,
                error: formatError(error, t),
              },
            }));
          } finally {
            if (!cancelled && alive.current) timer = setTimeout(tick, 3_000);
          }
        };

        tick();
        return () => {
          cancelled = true;
          clearTimeout(timer);
          if (tab.signal) tab.signal.removeEventListener('abort', onAbort);
          controller.abort();
        };
      }, [selectedRepo, refresh.n, hidden, visible, call, tab.signal]);

      const refreshNow = () => setRefresh((current) => ({ n: current.n + 1, fresh: true }));

      const chooseFolder = async () => {
        if (typeof pickDirectory !== 'function') return;
        try {
          const picked = await pickDirectory();
          if (!picked || !alive.current) return;
          setRoot(picked);
          setSelectedRepo(null);
          setRepos([]);
          setSummaries({});
          setRepoData({});
          setDiscoverError(null);
          setDiscovered(false);
        } catch (error) {
          if (alive.current) setDiscoverError(formatError(error, t));
        }
      };

      const useSessionFolder = () => {
        if (!cwd) return;
        setRoot(cwd);
        setSelectedRepo(null);
        setRepos([]);
        setSummaries({});
        setRepoData({});
        setDiscoverError(null);
        setDiscovered(false);
      };

      const selectRepo = (path) => {
        setSelectedRepo(path);
        setExpanded({});
      };

      const goBack = () => {
        setSelectedRepo(null);
        setExpanded({});
      };

      const toggleCommit = async (sha) => {
        if (!selectedRepo) return;
        const key = selectedRepo + ':' + sha;
        setExpanded((current) => ({ ...current, [key]: !current[key] }));
        if (expanded[key]) return;
        if (commitCache[key] && (commitCache[key].files || commitCache[key].error || commitCache[key].loading)) {
          return;
        }
        setCommitCache((current) => ({ ...current, [key]: { loading: true } }));
        try {
          const value = await callRpc(
            call,
            'commit',
            { repo: selectedRepo, sha },
            tab.signal,
          );
          if (!alive.current) return;
          setCommitCache((current) => ({ ...current, [key]: { files: value.files } }));
        } catch (error) {
          if (!alive.current || error?.code === 'aborted') return;
          setCommitCache((current) => ({
            ...current,
            [key]: { error: formatError(error, t) },
          }));
        }
      };

      if (typeof call !== 'function') {
        return h('div', { className: 'dgp-root' }, h(ErrorState, { message: t('error.noCall'), t }));
      }

      if (!root) {
        return h(
          'div',
          { className: 'dgp-root' },
          h(EmptyState, {
            t,
            title: t('empty.chooseTitle'),
            text: cwd ? t('empty.chooseText') : t('empty.noSession'),
            onChoose: chooseFolder,
            onUseSession: cwd ? useSessionFolder : undefined,
          }),
        );
      }

      if (selectedRepo) {
        return h(
          'div',
          { className: 'dgp-root' },
          h(RepoDetail, {
            repo: selectedRepo,
            data: repoData[selectedRepo],
            t,
            view,
            onView: setView,
            onBack: goBack,
            canBack: repos.length > 1,
            repos,
            onSwitch: selectRepo,
            onChoose: chooseFolder,
            onRefresh: refreshNow,
            expanded,
            cache: commitCache,
            onToggleCommit: toggleCommit,
          }),
        );
      }

      return h(
        'div',
        { className: 'dgp-root' },
        h(Overview, {
          root,
          repos,
          summaries,
          truncated: reposTruncated,
          t,
          discovered,
          discoverError,
          loading: discoverLoading,
          onSelect: selectRepo,
          onChoose: chooseFolder,
          onRefresh: refreshNow,
          onUseSession: useSessionFolder,
          canUseSession: Boolean(cwd),
        }),
      );
    }

    class GitBodyBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }

      static getDerivedStateFromError(error) {
        return { error };
      }

      componentDidCatch(error, info) {
        console.error('[git-panel] body failed to render', error, info);
      }

      render() {
        if (this.state.error) {
          const message =
            (this.state.error && (this.state.error.stack || this.state.error.message)) ||
            String(this.state.error);
          return h(
            'div',
            { className: 'dgp-root' },
            h(
              'div',
              { className: 'dgp-error' },
              h('div', { className: 'dgp-error-title' }, 'Git panel failed to render'),
              h(
                'pre',
                {
                  className: 'dgp-error-text',
                  style: {
                    whiteSpace: 'pre-wrap',
                    textAlign: 'left',
                    maxHeight: 320,
                    overflow: 'auto',
                    width: '100%',
                  },
                },
                message,
              ),
            ),
          );
        }
        return this.props.children;
      }
    }

    function GitBodySafe(props) {
      return h(GitBodyBoundary, null, h(GitBody, props));
    }

    function GitTitle({ useTabInfo }) {
      const tab = useTabInfo().tab;
      return h(
        'span',
        { className: 'dgp-title' },
        h(IconBranch, { size: 15 }),
        h('span', { className: 'dgp-title-text' }, tab.title || EN['type.label']),
      );
    }

    /* ------------------------------------------------------------------ */
    /* client plugin                                                       */
    /* ------------------------------------------------------------------ */

    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'git-panel: locale');
      ctx.effect(() => {
        if (typeof document === 'undefined') return undefined;
        const selector = 'style[data-plugin-css="' + STYLE_ID + '"]';
        if (document.querySelector(selector) !== null) return undefined;
        const tag = document.createElement('style');
        tag.dataset.plugin = GIT_ID;
        tag.dataset.pluginCss = STYLE_ID;
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => tag.remove();
      }, 'git-panel: styles');

      const definition = {
        id: GIT_ID,
        kind: 'git',
        title: () => t('type.label'),
        guide: [
          {
            id: 'git',
            order: 40,
            title: () => t('guide.title'),
            description: () => t('guide.description'),
            icon: GuideArtwork,
          },
        ],
      };
      ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'git-panel: tab type');

      const face = {
        call: (method, params, signal) => ctx.connection.rpc.call(CHANNEL, method, params, signal),
        subscribeConnection: (listener) => ctx.connection.state.subscribe(listener),
        connectionState: () => ctx.connection.state.getSnapshot(),
        pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
      };

      const GitBodyBridge = (props) => h(GitBodySafe, { ...props, ...face });

      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register(
              {
                name: 'sidebar.right.pane.tab',
                key: GIT_ID,
                locale: NS,
              },
              GitBodyBridge,
            ),
          ),
        'git-panel: tab body',
      );

      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab.title', () =>
            ctx.slots.register(
              {
                name: 'sidebar.right.pane.tab.title',
                key: GIT_ID,
              },
              GitTitle,
            ),
          ),
        'git-panel: tab title',
      );
    }

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'connection', 'uiWorkspace'],
      apply,
      __test: { layoutGraph },
    };
  },
});
