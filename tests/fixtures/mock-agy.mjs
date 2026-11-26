#!/usr/bin/env node
import readline from 'node:readline';

const mode = process.env.MOCK_AGY_MODE || 'success';

if (mode === 'ignore_sigint') {
  process.on('SIGINT', () => {
    // deliberately ignore SIGINT to test SIGTERM/SIGKILL escalation
  });
}

function sendNdjson(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// 1. Initial greeting / init event
sendNdjson({
  event: 'init',
  conversation_id: 'mock-conv-' + mode,
  init: {
    cwd: process.cwd(),
    tools: ['write_to_file', 'run_command', 'view_file'],
    permission_mode: 'ask',
  },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  if (!line.trim()) return;

  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  if (msg.event === 'user') {
    handleUserTurn();
  }
});

function handleUserTurn() {
  switch (mode) {
    case 'success': {
      sendNdjson({
        event: 'step_update',
        step_update: {
          step_index: 0,
          state: 'ACTIVE',
          step_type: 'thought',
          text_delta: 'Analyzing task requirements and files...',
        },
      });

      sendNdjson({
        event: 'step_update',
        step_update: {
          step_index: 1,
          state: 'DONE',
          step_type: 'tool',
          tool_name: 'write_to_file',
          tool_info: {
            parameters: { TargetFile: 'src/mockResult.ts' },
            output: 'Wrote 42 lines to src/mockResult.ts',
          },
        },
      });

      sendNdjson({
        event: 'step_update',
        step_update: {
          step_index: 2,
          state: 'DONE',
          step_type: 'tool',
          tool_name: 'run_command',
          tool_info: {
            parameters: { CommandLine: 'npm test' },
            output: 'Test suites: 1 passed, 1 total\nTests: 5 passed, 5 total',
          },
        },
      });

      sendNdjson({
        event: 'result',
        result: {
          status: 'SUCCESS',
          response: 'Task implemented and verified: written src/mockResult.ts and verified tests pass.',
          duration_seconds: 0.8,
          num_turns: 1,
        },
      });
      break;
    }

    case 'non_zero_exit': {
      sendNdjson({
        event: 'step_update',
        step_update: {
          step_index: 0,
          state: 'ACTIVE',
          text_delta: 'Fatal process error: segmentation fault simulation',
        },
      });
      process.exit(1);
      break;
    }

    case 'exit_no_result': {
      sendNdjson({
        event: 'step_update',
        step_update: {
          step_index: 0,
          state: 'ACTIVE',
          text_delta: 'Exiting unexpectedly with code 0 without result event',
        },
      });
      process.exit(0);
      break;
    }

    case 'error_result': {
      sendNdjson({
        event: 'step_update',
        step_update: {
          step_index: 0,
          state: 'ACTIVE',
          step_type: 'thought',
          text_delta: 'Attempting task execution...',
        },
      });

      sendNdjson({
        event: 'step_update',
        step_update: {
          step_index: 1,
          state: 'DONE',
          step_type: 'tool',
          tool_name: 'run_command',
          tool_info: {
            parameters: { CommandLine: 'npm test' },
            output: 'FAIL tests/app.test.ts\n2 tests failed',
            error: 'Command failed with exit code 1',
          },
        },
      });

      sendNdjson({
        event: 'result',
        result: {
          status: 'ERROR',
          error: 'Verification test suite failed with 2 errors',
          duration_seconds: 0.5,
          num_turns: 1,
        },
      });
      break;
    }

    case 'malformed_ndjson': {
      process.stdout.write('MALFORMED_NON_JSON_LINE_{{{\n');
      sendNdjson({
        event: 'step_update',
        step_update: {
          step_index: 0,
          state: 'ACTIVE',
          step_type: 'thought',
          text_delta: 'Processed line despite malformed stream',
        },
      });
      process.stdout.write('ANOTHER_CORRUPTED_LINE_###\n');
      sendNdjson({
        event: 'result',
        result: {
          status: 'SUCCESS',
          response: 'Recovered cleanly and finished task.',
          duration_seconds: 0.4,
          num_turns: 1,
        },
      });
      break;
    }

    case 'hang':
    case 'ignore_sigint': {
      sendNdjson({
        event: 'step_update',
        step_update: {
          step_index: 0,
          state: 'ACTIVE',
          text_delta: 'Hung process running indefinitely...',
        },
      });
      // Do not exit, keep event loop open
      setInterval(() => {}, 10000);
      break;
    }

    default: {
      sendNdjson({
        event: 'result',
        result: {
          status: 'SUCCESS',
          response: 'Default response',
        },
      });
      break;
    }
  }
}

// Keep process alive listening on stdin
setInterval(() => {}, 60000);
