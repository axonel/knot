import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { CollaborationWorkspace } from '../src/renderer/components/Workspace/CollaborationWorkspace.js';
import { ChatGptActivityPanel } from '../src/renderer/components/Workspace/ChatGptActivityPanel.js';
import { SharedConversationPanel } from '../src/renderer/components/Workspace/SharedConversationPanel.js';
import { AntigravityExecutionPanel } from '../src/renderer/components/Workspace/AntigravityExecutionPanel.js';

function createFullMockKnotApi() {
  return {
    startDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
    stopDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
    getStatus: vi.fn().mockResolvedValue({
      state: 'Stopped' as const,
      connectionState: 'disconnected' as const,
      connectionVerified: false,
      pid: null,
      startedAt: null,
      stoppedAt: null,
      exitCode: null,
      errorMessage: null,
    }),
    getLogs: vi.fn().mockResolvedValue([]),
    clearLogs: vi.fn().mockResolvedValue(undefined),
    onStatusChange: vi.fn().mockReturnValue(vi.fn()),
    onLog: vi.fn().mockReturnValue(vi.fn()),
    projects: {
      list: vi.fn().mockResolvedValue([
        {
          id: 'proj-1',
          name: 'Knot Test Project',
          repositoryPath: '/mock/repo',
          trustPolicy: 'approval_required',
          createdAt: '2026-11-20T00:00:00.000Z',
          updatedAt: '2026-11-20T00:00:00.000Z',
          archivedAt: null,
          sessionCount: 1,
        },
      ]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      updateTrustPolicy: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      selectDirectory: vi.fn(),
    },
    sessions: {
      list: vi.fn().mockResolvedValue([
        {
          id: 'sess-1',
          projectId: 'proj-1',
          title: 'Test Session',
          status: 'active',
          createdAt: '2026-11-20T00:00:00.000Z',
          updatedAt: '2026-11-20T00:00:00.000Z',
          lastActivityAt: '2026-11-20T00:00:00.000Z',
          startedAt: '2026-11-20T00:00:00.000Z',
          endedAt: null,
          metadata: null,
        },
      ]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      updateStatus: vi.fn(),
      updateTitle: vi.fn(),
    },
    messages: {
      list: vi.fn().mockResolvedValue([]),
      append: vi.fn(),
    },
    tasks: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      updateStatus: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
    },
    events: {
      list: vi.fn().mockResolvedValue([]),
      append: vi.fn(),
      getTaskTrace: vi.fn().mockResolvedValue(null),
      exportTaskTrace: vi.fn().mockResolvedValue('# Trace'),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    bridge: {
      getStatus: vi.fn().mockResolvedValue({
        workspaceInitialized: true,
        bridgeRoot: '/mock/bridge/v1',
        exists: true,
        readable: true,
        writable: true,
        watcherActive: true,
        watchedSessionsCount: 1,
        watchedSessionIds: ['sess-1'],
        desktopCommanderRunning: true,
        mcpPermissionConfigured: true,
        handshakeState: 'workspace_ready',
        activeProjectId: 'proj-1',
        activeSessionId: 'sess-1',
        lastInboundMessage: null,
        lastOutboundMessage: null,
      }),
      initSessionBridge: vi.fn().mockResolvedValue({
        projectDir: '/mock/bridge/v1/projects/proj-1',
        sessionDir: '/mock/bridge/v1/projects/proj-1/sessions/sess-1',
        inboxDir: '/mock/bridge/v1/projects/proj-1/sessions/sess-1/inbox/chatgpt',
        processedDir: '/mock/bridge/v1/projects/proj-1/sessions/sess-1/processed/chatgpt',
        rejectedDir: '/mock/bridge/v1/projects/proj-1/sessions/sess-1/rejected/chatgpt',
        outboxDir: '/mock/bridge/v1/projects/proj-1/sessions/sess-1/outbox/knot',
        conversationFile: '/mock/bridge/v1/projects/proj-1/sessions/sess-1/conversation.md',
      }),
      sendMessage: vi.fn().mockResolvedValue({}),
      startConnectionTest: vi.fn().mockResolvedValue({}),
      openDirectory: vi.fn().mockResolvedValue(true),
      getInstructions: vi.fn().mockResolvedValue({}),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      getConnectionState: vi.fn().mockResolvedValue({ connected: true }),
    },
    antigravity: {
      detect: vi.fn().mockResolvedValue({
        installed: true,
        executablePath: '/usr/bin/agy',
        version: '1.5.14',
        supportedModes: ['default'],
        supportsStreaming: true,
        supportsResumption: true,
        readiness: 'ready',
      }),
      getStatus: vi.fn().mockResolvedValue({
        sessionId: 'sess-1',
        state: 'ready',
        pid: 12345,
        cliConversationId: 'agy-conv-1',
        workingDirectory: '/mock/repo',
        executionMode: 'default',
        model: null,
        effort: null,
        lastStartedAt: new Date().toISOString(),
        lastExitCode: null,
        capabilities: {
          installed: true,
          executablePath: '/usr/bin/agy',
          version: '1.5.14',
          supportedModes: ['default'],
          supportsStreaming: true,
          supportsResumption: true,
          readiness: 'ready',
        },
        currentTurnPending: false,
        lastResult: null,
      }),
      start: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      interrupt: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      getHistory: vi.fn().mockResolvedValue([]),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      onStatusChange: vi.fn().mockReturnValue(vi.fn()),
      getProcesses: vi.fn().mockResolvedValue([]),
    },
    orchestration: {
      approveTask: vi.fn().mockResolvedValue({ id: 't-1', status: 'queued', approvalStatus: 'approved' }),
      rejectTask: vi.fn().mockResolvedValue({ id: 't-1', status: 'cancelled', approvalStatus: 'rejected' }),
      cancelTask: vi.fn().mockResolvedValue({ id: 't-1', status: 'cancelled' }),
      retryTask: vi.fn().mockResolvedValue({ id: 't-1', status: 'queued', retryCount: 1 }),
      listTasks: vi.fn().mockResolvedValue([]),
      listQueued: vi.fn().mockResolvedValue([]),
      getRunningTask: vi.fn().mockResolvedValue(null),
      dispatchNext: vi.fn().mockResolvedValue(null),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      onTaskStatusChanged: vi.fn().mockReturnValue(vi.fn()),
      getExecutionHistory: vi.fn().mockResolvedValue([]),
    },
    git: {
      getTaskDiff: vi.fn().mockResolvedValue(null),
      getFileDiff: vi.fn().mockResolvedValue(null),
      getRepoStatus: vi.fn().mockResolvedValue(null),
      getStatus: vi.fn().mockResolvedValue({ clean: true, files: [] }),
      getDiff: vi.fn().mockResolvedValue(''),
    },
    context: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      listRevisions: vi.fn().mockResolvedValue([]),
      listConflicts: vi.fn().mockResolvedValue([]),
      resolveConflict: vi.fn().mockResolvedValue({}),
      getHandoff: vi.fn().mockResolvedValue(null),
      getManifest: vi.fn().mockResolvedValue(null),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    reliability: {
      getDiagnostics: vi.fn().mockResolvedValue({}),
      reconcile: vi.fn().mockResolvedValue({}),
    },
    security: {
      getDiagnostics: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('CollaborationWorkspace Freeze & Event Loop Regression Protection', () => {
  let mockKnotApi: any;
  let orchListener: ((event: any) => void) | null = null;
  let bridgeListener: ((event: any) => void) | null = null;

  beforeEach(() => {
    orchListener = null;
    bridgeListener = null;

    mockKnotApi = createFullMockKnotApi();
    mockKnotApi.orchestration.onEvent = vi.fn().mockImplementation((cb) => {
      orchListener = cb;
      return vi.fn();
    });
    mockKnotApi.bridge.onEvent = vi.fn().mockImplementation((cb) => {
      bridgeListener = cb;
      return vi.fn();
    });

    (window as any).knotApi = mockKnotApi;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders CollaborationWorkspace and initializes bridge session exactly once without cyclic loops', async () => {
    const { container } = render(<CollaborationWorkspace />);

    // Wait for initial render and data fetch
    await waitFor(() => {
      expect(mockKnotApi.projects.list).toHaveBeenCalledTimes(1);
    });

    // Verify session auto-selection initialized the bridge exactly once
    await waitFor(() => {
      expect(mockKnotApi.bridge.initSessionBridge).toHaveBeenCalledTimes(1);
      expect(mockKnotApi.bridge.initSessionBridge).toHaveBeenCalledWith('proj-1', 'sess-1');
    });

    // Verify container rendered without error
    expect(container).toBeInTheDocument();
  });

  it('debounces rapid bursts of orchestration events to prevent event loop starvation', async () => {
    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(mockKnotApi.bridge.initSessionBridge).toHaveBeenCalledTimes(1);
    });

    const initialProjectListCalls = mockKnotApi.projects.list.mock.calls.length;

    // Simulate rapid burst of 50 orchestration events within 50ms
    await act(async () => {
      for (let i = 0; i < 50; i++) {
        if (orchListener) {
          orchListener({
            type: 'task_status_changed',
            task: { id: `task-${i}`, status: 'running' },
          });
        }
      }
      // Wait for debounce timer (150ms)
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    // The 50 events should be debounced into at most one or two calls, NOT 50 calls!
    const callsAfterBurst = mockKnotApi.projects.list.mock.calls.length - initialProjectListCalls;
    expect(callsAfterBurst).toBeLessThanOrEqual(2);

    // initSessionBridge should STILL be exactly 1 (no re-initialization of the active session)
    expect(mockKnotApi.bridge.initSessionBridge).toHaveBeenCalledTimes(1);
  });

  it('ignores workspace-ready and workspace-index-updated bridge events in renderer to prevent circular feedback loops', async () => {
    render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(mockKnotApi.bridge.initSessionBridge).toHaveBeenCalledTimes(1);
    });

    const initialInitCalls = mockKnotApi.bridge.initSessionBridge.mock.calls.length;

    // If a bridge listener was registered, dispatching workspace-index-updated should not trigger initSessionBridge
    if (bridgeListener) {
      const listener = bridgeListener;
      await act(async () => {
        listener({ type: 'workspace-index-updated', bridgeRoot: '/mock' });
        listener({ type: 'workspace-ready', bridgeRoot: '/mock' });
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
    }

    expect(mockKnotApi.bridge.initSessionBridge).toHaveBeenCalledTimes(initialInitCalls);
  });

  it('renders CollaborationWorkspace safely with empty projects and sessions without infinite loops or crashes', async () => {
    mockKnotApi.projects.list.mockResolvedValue([]);
    mockKnotApi.sessions.list.mockResolvedValue([]);

    const { container } = render(<CollaborationWorkspace />);

    await waitFor(() => {
      expect(mockKnotApi.projects.list).toHaveBeenCalled();
    });

    // With 0 projects, initSessionBridge must NEVER be called
    expect(mockKnotApi.bridge.initSessionBridge).not.toHaveBeenCalled();
    expect(container).toBeInTheDocument();
  });

  it('cleans up bridge event listeners when ChatGptActivityPanel unmounts', () => {
    const unlistenMock = vi.fn();
    mockKnotApi.bridge.onEvent.mockReturnValue(unlistenMock);

    const session = {
      id: 'sess-1',
      projectId: 'proj-1',
      title: 'Session 1',
      status: 'active' as const,
      createdAt: '',
      updatedAt: '',
      lastActivityAt: '',
      startedAt: '',
      endedAt: null,
      metadata: null,
    };

    const { unmount } = render(<ChatGptActivityPanel session={session} />);
    expect(mockKnotApi.bridge.onEvent).toHaveBeenCalled();

    unmount();
    expect(unlistenMock).toHaveBeenCalledTimes(1);
  });

  it('cleans up bridge and orchestration listeners when SharedConversationPanel unmounts', () => {
    const unlistenBridge = vi.fn();
    const unlistenOrch = vi.fn();
    mockKnotApi.bridge.onEvent.mockReturnValue(unlistenBridge);
    mockKnotApi.orchestration.onEvent.mockReturnValue(unlistenOrch);

    const session = {
      id: 'sess-1',
      projectId: 'proj-1',
      title: 'Session 1',
      status: 'active' as const,
      createdAt: '',
      updatedAt: '',
      lastActivityAt: '',
      startedAt: '',
      endedAt: null,
      metadata: null,
    };

    const { unmount } = render(
      <SharedConversationPanel
        project={null}
        session={session}
        sessionPaths={null}
      />
    );

    expect(mockKnotApi.bridge.onEvent).toHaveBeenCalled();
    expect(mockKnotApi.orchestration.onEvent).toHaveBeenCalled();

    unmount();
    expect(unlistenBridge).toHaveBeenCalledTimes(1);
    expect(unlistenOrch).toHaveBeenCalledTimes(1);
  });

  it('cleans up antigravity and orchestration listeners when AntigravityExecutionPanel unmounts', () => {
    const unlistenAgy = vi.fn();
    const unlistenOrch = vi.fn();
    mockKnotApi.antigravity.onEvent.mockReturnValue(unlistenAgy);
    mockKnotApi.orchestration.onEvent.mockReturnValue(unlistenOrch);

    const session = {
      id: 'sess-1',
      projectId: 'proj-1',
      title: 'Session 1',
      status: 'active' as const,
      createdAt: '',
      updatedAt: '',
      lastActivityAt: '',
      startedAt: '',
      endedAt: null,
      metadata: null,
    };

    const { unmount } = render(<AntigravityExecutionPanel session={session} />);
    expect(mockKnotApi.antigravity.onEvent).toHaveBeenCalled();
    expect(mockKnotApi.orchestration.onEvent).toHaveBeenCalled();

    unmount();
    expect(unlistenAgy).toHaveBeenCalledTimes(1);
    expect(unlistenOrch).toHaveBeenCalledTimes(1);
  });
});
