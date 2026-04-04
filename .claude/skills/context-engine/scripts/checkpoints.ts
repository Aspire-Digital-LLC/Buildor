/**
 * Checkpoint System CLI
 * Manages per-command checkpoint JSON files to avoid merge conflicts.
 *
 * Usage:
 *   npx tsx scripts/checkpoints.ts get-latest <command>
 *   npx tsx scripts/checkpoints.ts write <command> <commit> <type> <notes>
 *   npx tsx scripts/checkpoints.ts list <command> [limit=10]
 *   npx tsx scripts/checkpoints.ts prune <command> [keep=5]
 *
 * Valid commands: knowledge
 */

import * as fs from 'fs';
import * as path from 'path';

const CHECKPOINTS_DIR = path.resolve(process.cwd(), 'claude_knowledge/checkpoints');
const VALID_COMMANDS = ['knowledge'] as const;
type ValidCommand = (typeof VALID_COMMANDS)[number];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.error(`${colors[color]}${message}${colors.reset}`);
}

function validateCommand(cmd: string): ValidCommand {
  if (!VALID_COMMANDS.includes(cmd as ValidCommand)) {
    log(`Error: Invalid command "${cmd}". Valid commands: ${VALID_COMMANDS.join(', ')}`, 'red');
    process.exit(1);
  }
  return cmd as ValidCommand;
}

function getCommandDir(cmd: ValidCommand): string {
  return path.join(CHECKPOINTS_DIR, cmd);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse(); // newest first
}

function readCheckpoint(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// --- Commands ---

function getLatest(cmd: ValidCommand) {
  const dir = getCommandDir(cmd);
  const files = listFiles(dir);
  if (files.length === 0) {
    log(`No checkpoints found for "${cmd}"`, 'yellow');
    process.exit(1);
  }
  const data = readCheckpoint(path.join(dir, files[0]));
  console.log(JSON.stringify(data, null, 2));
}

function writeCheckpoint(cmd: ValidCommand, commit: string, type: string, notes: string) {
  const dir = getCommandDir(cmd);
  ensureDir(dir);

  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    pad(now.getMilliseconds(), 3),
  ].join('');

  const filename = `${timestamp}_${commit}.json`;
  const data = {
    commit,
    date: now.toISOString(),
    command: cmd,
    type,
    notes,
  };

  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2) + '\n');
  log(`Wrote checkpoint: ${filename}`, 'green');
}

function listCheckpoints(cmd: ValidCommand, limit: number) {
  const dir = getCommandDir(cmd);
  const files = listFiles(dir).slice(0, limit);
  const entries = files.map(f => readCheckpoint(path.join(dir, f)));
  console.log(JSON.stringify(entries, null, 2));
}

function pruneCheckpoints(cmd: ValidCommand, keep: number) {
  const dir = getCommandDir(cmd);
  const files = listFiles(dir);
  const toDelete = files.slice(keep);
  if (toDelete.length === 0) {
    log(`Nothing to prune — ${files.length} files, keeping ${keep}`, 'yellow');
    return;
  }
  for (const f of toDelete) {
    fs.unlinkSync(path.join(dir, f));
  }
  log(`Pruned ${toDelete.length} old checkpoints, kept ${keep}`, 'green');
}

// --- Main ---

function printUsage() {
  log('\nCheckpoint System CLI\n', 'cyan');
  log('Usage:', 'blue');
  log('  npx tsx .claude/skills/context-engine/scripts/checkpoints.ts get-latest <command>');
  log('  npx tsx .claude/skills/context-engine/scripts/checkpoints.ts write <command> <commit> <type> <notes>');
  log('  npx tsx .claude/skills/context-engine/scripts/checkpoints.ts list <command> [limit=10]');
  log('  npx tsx .claude/skills/context-engine/scripts/checkpoints.ts prune <command> [keep=5]\n');
  log(`Valid commands: ${VALID_COMMANDS.join(', ')}\n`, 'blue');
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const action = args[0];

  switch (action) {
    case 'get-latest': {
      if (args.length < 2) { log('Error: Missing <command> argument', 'red'); process.exit(1); }
      getLatest(validateCommand(args[1]));
      break;
    }
    case 'write': {
      if (args.length < 5) {
        log('Error: Usage: write <command> <commit> <type> <notes>', 'red');
        process.exit(1);
      }
      writeCheckpoint(validateCommand(args[1]), args[2], args[3], args.slice(4).join(' '));
      break;
    }
    case 'list': {
      if (args.length < 2) { log('Error: Missing <command> argument', 'red'); process.exit(1); }
      const limit = args.length >= 3 ? parseInt(args[2], 10) : 10;
      listCheckpoints(validateCommand(args[1]), limit);
      break;
    }
    case 'prune': {
      if (args.length < 2) { log('Error: Missing <command> argument', 'red'); process.exit(1); }
      const keep = args.length >= 3 ? parseInt(args[2], 10) : 5;
      pruneCheckpoints(validateCommand(args[1]), keep);
      break;
    }
    default: {
      log(`Error: Unknown action "${action}"`, 'red');
      printUsage();
      process.exit(1);
    }
  }
}

main();
