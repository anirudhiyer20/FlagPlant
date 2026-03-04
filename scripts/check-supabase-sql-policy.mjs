#!/usr/bin/env node

import { execSync } from "node:child_process";

const mode = process.argv.includes("--all") ? "all" : "staged";

function run(command) {
  return execSync(command, { encoding: "utf8" }).trim();
}

function getRepoRoot() {
  try {
    return run("git rev-parse --show-toplevel");
  } catch {
    console.error("Not inside a git repository.");
    process.exit(1);
  }
}

const repoRoot = getRepoRoot();
process.chdir(repoRoot);

function listChanges() {
  if (mode === "all") {
    const files = run("git ls-files").split(/\r?\n/).filter(Boolean);
    return files.map((path) => ({ status: "M", path }));
  }

  const raw = run("git diff --cached --name-status --diff-filter=ACMR");
  if (!raw) return [];

  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const status = parts[0]?.charAt(0) ?? "M";
      const path = parts[parts.length - 1] ?? "";
      return { status, path };
    })
    .filter((entry) => entry.path.length > 0);
}

function isSupabaseSql(path) {
  return /^supabase\/.*\.sql$/i.test(path);
}

function isLegacyPatch(path) {
  return /^supabase\/legacy-patches\/patch_.*\.sql$/i.test(path);
}

function isActivePatch(path) {
  return /^supabase\/patch_.*\.sql$/i.test(path);
}

function isAllowedNewSupabaseSql(path) {
  return (
    /^supabase\/migrations\/.+\.sql$/i.test(path) ||
    /^supabase\/smoke_.*\.sql$/i.test(path) ||
    /^supabase\/seed_.*\.sql$/i.test(path) ||
    /^supabase\/dev_seed_.*\.sql$/i.test(path)
  );
}

const changes = listChanges();
const violations = [];

for (const change of changes) {
  const path = change.path;

  if (isActivePatch(path)) {
    violations.push(
      `${path}: active patch files are not allowed. Create a migration in supabase/migrations/.`
    );
    continue;
  }

  if (isLegacyPatch(path) && mode !== "all") {
    violations.push(
      `${path}: legacy patches are archived history and should not be modified.`
    );
    continue;
  }

  if (change.status === "A" && isSupabaseSql(path) && !isAllowedNewSupabaseSql(path)) {
    violations.push(
      `${path}: new SQL under supabase/ must be migrations, smoke tests, or seed files.`
    );
  }
}

if (violations.length > 0) {
  console.error("Supabase SQL policy check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  console.error("");
  console.error("Allowed new DB-change path: supabase/migrations/*.sql");
  console.error("Legacy patch files live in: supabase/legacy-patches/");
  process.exit(1);
}

console.log(`Supabase SQL policy check passed (${mode}).`);
