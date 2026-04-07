/**
 * Permission POC — test how the SDK handles permission responses.
 *
 * Tests:
 * 1. Does canUseTool block tool execution?
 * 2. Does the control_request appear in the message stream?
 * 3. Can we resolve canUseTool after seeing the control_request?
 * 4. What IDs match between canUseTool and control_request?
 */

import { spawn } from 'node:child_process';
import {
  query,
  type CanUseTool,
  type PermissionResult,
  type SpawnOptions,
  type SpawnedProcess,
} from '@anthropic-ai/claude-agent-sdk';

console.log('=== Permission POC ===\n');

// Track what canUseTool receives
const canUseToolCalls: Array<{
  toolName: string;
  toolUseID: string;
  timestamp: number;
  resolved: boolean;
}> = [];

// Track what the message stream shows
const controlRequests: Array<{
  requestId: string;
  toolUseId: string;
  toolName: string;
  timestamp: number;
}> = [];

let resolvePermission: ((result: PermissionResult) => void) | null = null;

const canUseTool: CanUseTool = async (toolName, input, options) => {
  const entry = {
    toolName,
    toolUseID: (options as any).toolUseID || 'unknown',
    timestamp: Date.now(),
    resolved: false,
  };
  canUseToolCalls.push(entry);

  console.log(`[canUseTool] CALLED: tool=${toolName} toolUseID=${entry.toolUseID}`);
  console.log(`[canUseTool] Input:`, JSON.stringify(input).slice(0, 100));

  // Block until we manually resolve
  return new Promise<PermissionResult>((resolve) => {
    resolvePermission = (result) => {
      entry.resolved = true;
      console.log(`[canUseTool] RESOLVED: tool=${toolName} → ${result.behavior}`);
      resolve(result);
      resolvePermission = null;
    };

    // Auto-approve after 5 seconds for testing
    setTimeout(() => {
      if (!entry.resolved) {
        console.log(`[canUseTool] AUTO-APPROVING after 5s: tool=${toolName}`);
        entry.resolved = true;
        resolve({ behavior: 'allow' });
        resolvePermission = null;
      }
    }, 5000);
  });
};

async function run() {
  const q = query({
    prompt: 'Read the file package.json and tell me the version. Use the Read tool.',
    options: {
      cwd: process.cwd(),
      model: 'haiku',
      permissionMode: 'default',
      canUseTool,
      spawnClaudeCodeProcess: (opts: SpawnOptions): SpawnedProcess => {
        const child = spawn(opts.command, opts.args, {
          cwd: opts.cwd,
          env: opts.env as NodeJS.ProcessEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          signal: opts.signal,
        });
        return child as unknown as SpawnedProcess;
      },
    },
  });

  let messageCount = 0;

  for await (const message of q) {
    messageCount++;
    const msg = message as any;

    // Check for control_request in the stream
    if (msg.type === 'control_request') {
      const cr = {
        requestId: msg.request_id || 'none',
        toolUseId: msg.request?.tool_use_id || 'none',
        toolName: msg.request?.tool_name || 'unknown',
        timestamp: Date.now(),
      };
      controlRequests.push(cr);
      console.log(`\n[STREAM] control_request: requestId=${cr.requestId} toolUseId=${cr.toolUseId} tool=${cr.toolName}`);
    } else if (msg.type === 'result') {
      console.log(`\n[STREAM] result: subtype=${msg.subtype}`);
    } else if (msg.type === 'assistant') {
      const textBlocks = msg.message?.content?.filter((b: any) => b.type === 'text') || [];
      const toolBlocks = msg.message?.content?.filter((b: any) => b.type === 'tool_use') || [];
      if (textBlocks.length) {
        console.log(`[STREAM] assistant text: "${textBlocks[0]?.text?.slice(0, 80)}..."`);
      }
      if (toolBlocks.length) {
        console.log(`[STREAM] assistant tool_use: ${toolBlocks.map((b: any) => b.name).join(', ')}`);
      }
    } else {
      console.log(`[STREAM] ${msg.type} (${JSON.stringify(msg).slice(0, 80)})`);
    }
  }

  console.log('\n=== RESULTS ===\n');
  console.log(`Messages received: ${messageCount}`);

  console.log('\ncanUseTool calls:');
  canUseToolCalls.forEach((c, i) => {
    console.log(`  ${i + 1}. tool=${c.toolName} toolUseID=${c.toolUseID} resolved=${c.resolved}`);
  });

  console.log('\ncontrol_request events in stream:');
  controlRequests.forEach((c, i) => {
    console.log(`  ${i + 1}. tool=${c.toolName} requestId=${c.requestId} toolUseId=${c.toolUseId}`);
  });

  console.log('\nID comparison:');
  if (canUseToolCalls.length > 0 && controlRequests.length > 0) {
    const cut = canUseToolCalls[0];
    const cr = controlRequests[0];
    console.log(`  canUseTool.toolUseID: ${cut.toolUseID}`);
    console.log(`  control_request.request_id: ${cr.requestId}`);
    console.log(`  control_request.tool_use_id: ${cr.toolUseId}`);
    console.log(`  Match toolUseID ↔ tool_use_id: ${cut.toolUseID === cr.toolUseId}`);
    console.log(`  Match toolUseID ↔ request_id: ${cut.toolUseID === cr.requestId}`);
  } else if (canUseToolCalls.length === 0) {
    console.log('  canUseTool was NEVER called — permissions handled by built-in system');
  } else if (controlRequests.length === 0) {
    console.log('  No control_request events in stream — SDK intercepted them');
  }

  console.log('\nKey question answers:');
  console.log(`  1. canUseTool called: ${canUseToolCalls.length > 0 ? 'YES' : 'NO'}`);
  console.log(`  2. control_request in stream: ${controlRequests.length > 0 ? 'YES' : 'NO'}`);
  console.log(`  3. Tool blocked until resolve: ${canUseToolCalls.some(c => !c.resolved) ? 'STILL BLOCKED' : 'ALL RESOLVED'}`);
}

run().catch(console.error);
