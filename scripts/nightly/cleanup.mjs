#!/usr/bin/env node
// Section B: detect console.log / debugger / TODO in src/ and remove "safe" ones.
// Safe = standalone console.log line with no side effects other than logging, or a lone `debugger;`.
// TODO lines are reported but never auto-removed.

import { readFileSync, writeFileSync, appendFileSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const SRC_DIR = 'src';
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '.git']);

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(p)));
    } else if (EXTENSIONS.has(p.slice(p.lastIndexOf('.')))) {
      out.push(p);
    }
  }
  return out;
}

function isSafeConsoleLine(line) {
  // Standalone `console.log(...)` or `console.debug(...)` with only string/number/identifier args.
  // Reject anything that could have side effects: function calls, ++/--, assignments, await, etc.
  const trimmed = line.trim();
  const m = /^console\.(log|debug|info)\((.*)\);?\s*$/.exec(trimmed);
  if (!m) return false;
  const args = m[2];
  if (/[=]=?[^=]|\+\+|--|\bawait\b|\bnew\b|=>/.test(args)) return false;
  // Reject function calls inside args (heuristic: identifier followed by '(')
  if (/[A-Za-z_$][\w$]*\s*\(/.test(args)) return false;
  return true;
}

function isSafeDebugger(line) {
  return /^\s*debugger\s*;?\s*$/.test(line);
}

const files = await walk(SRC_DIR);
let removedCount = 0;
let todoCount = 0;
const removedByFile = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const kept = [];
  let changedHere = 0;
  for (const line of lines) {
    if (/\bTODO\b/.test(line)) todoCount++;
    if (isSafeConsoleLine(line) || isSafeDebugger(line)) {
      removedCount++;
      changedHere++;
      continue;
    }
    kept.push(line);
  }
  if (changedHere > 0) {
    writeFileSync(file, kept.join('\n'));
    removedByFile.push(`${file}:${changedHere}`);
  }
}

const summary = `removed=${removedCount} files=${removedByFile.length} todos=${todoCount}`;
console.log(`[cleanup] ${summary}`);
if (removedByFile.length) console.log(removedByFile.join('\n'));

// Emit GH Actions outputs.
const out = process.env.GITHUB_OUTPUT;
if (out) {
  appendFileSync(out, `changed=${removedCount > 0 ? 'true' : 'false'}\n`);
  appendFileSync(out, `summary=${summary}\n`);
  appendFileSync(out, `todos=${todoCount}\n`);
}
