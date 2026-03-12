# Git Cadence Playbook

This is the default workflow for FlagPlant.

## 1) Start a task

From repo root:

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/<short-task-name>
```

Use `fix/<name>` for bug fixes and `chore/<name>` for tooling/docs.

## 2) Work in small commits

Commit logical chunks (every 15-60 minutes or meaningful checkpoint):

```bash
git add -A
git commit -m "<clear message>"
```

Push regularly:

```bash
git push -u origin <branch-name>
```

After first push, use just:

```bash
git push
```

## 3) Open PR and merge safely

1. Open PR to `main`.
2. Confirm required checks:
   - `web-smoke`
   - `sql-policy`
   - `migratability`
3. Enable auto-merge.
4. Merge happens automatically when checks pass.

## 4) End of session checklist

After PR merges:

```bash
git switch main
git pull --ff-only origin main
git branch -d <branch-name>
```

Confirm clean sync:

```bash
git status -sb
git rev-list --left-right --count main...origin/main
```

Expected:

- clean working tree
- `0 0` ahead/behind

## Recovery: accidental commit on main

If you committed on `main` by mistake and push to `main` is blocked:

```bash
git switch -c fix/<recovery-name>
git push -u origin fix/<recovery-name>
```

Then open PR from that branch to `main`.
