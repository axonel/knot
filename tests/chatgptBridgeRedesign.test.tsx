import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from '../src/renderer/App.js';
import { BridgeManager } from '../src/renderer/components/Bridge/BridgeManager.js';
import { Sidebar } from '../src/renderer/components/Sidebar.js';
import { BridgeStatusInfo, Message } from '../src/shared/types.js';

function createFullMockKnotApi() {
  const mockStatus: BridgeStatusInfo = {
    workspaceInitialized: true,
    bridgeRoot: '/home/user/.local/share/knot/bridge',
    exists: true,
    readable: true,
    writable: true,
    watcherActive: true,
    watchedSessionsCount: 2,
    watchedSessionIds: ['sess-1', 'sess-2'],
    desktopCommanderRunning: true,
    mcpPermissionConfigured: true,
    handshakeState: 'verified',
    activeProjectId: 'proj-1',
    activeSessionId: 'sess-1',
    lastInboundMessage: {
      id: 'msg-1',
      timestamp: new Date().toISOString(),
      sender: 'chatgpt',
    },
    lastOutboundMessage: {
      id: 'msg-2',
      timestamp: new Date().toISOString(),
      sender: 'knot',
    },
    latestDispatchedTask: {
      taskId: 'task-101',
      title: 'Analyze database schema and generate migration plan',
      timestamp: new Date().toISOString(),
    },
    antigravityRunning: false,
    unreadResultsCount: 1,
    lastVerifiedAt: new Date().toISOString(),
    activeChallenge: null,
    sessionPaths: {
      projectDir: '/home/user/.local/share/knot/bridge/projects/proj-1',
      sessionDir: '/home/user/.local/share/knot/bridge/sessions/sess-1',
      inboxDir: '/home/user/.local/share/knot/bridge/sessions/sess-1/inbox',
      processedDir: '/home/user/.local/share/knot/bridge/sessions/sess-1/processed',
      rejectedDir: '/home/user/.local/share/knot/bridge/sessions/sess-1/rejected',
      outboxDir: '/home/user/.local/share/knot/bridge/sessions/sess-1/outbox',
      conversationFile: '/home/user/.local/share/knot/bridge/sessions/sess-1/conversation.md',
    },
  };

  const mockMessages: Message[] = [
    {
      id: 'msg-1',
      sessionId: 'sess-1',
      sender: 'chatgpt',
      recipient: null,
      messageType: 'handshake',
      contentMarkdown: '{"type":"handshake_response","status":"ok","version":"1.0"}',
      sequence: 1,
      correlationId: null,
      createdAt: new Date(Date.now() - 60000).toISOString(),
    },
    {
      id: 'msg-2',
      sessionId: 'sess-1',
      sender: 'knot',
      recipient: 'chatgpt',
      messageType: 'task_proposal',
      contentMarkdown: 'Task proposal dispatched to ChatGPT planner: Please review PR #42 and evaluate cognitive load heuristics across all modified routes.',
      sequence: 2,
      correlationId: 'corr-xyz-987',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'msg-3',
      sessionId: 'sess-1',
      sender: 'chatgpt',
      recipient: null,
      messageType: 'message',
      contentMarkdown: 'Here is an extended response detailing the architectural evaluation:\n\n1. Component hierarchy is well isolated.\n2. Security guardrails are intact.\n3. The atomic outbox writes satisfy the single-writer invariant.\n4. Additional verification telemetry confirms zero event loop starvation.',
      sequence: 3,
      correlationId: null,
      createdAt: new Date().toISOString(),
    },
  ];

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
        { id: 'proj-1', name: 'Knot Workstation Core', trustPolicy: 'approval_required' },
        { id: 'proj-2', name: 'Threadline Bridge Engine', trustPolicy: 'autonomous' },
      ]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'proj-1' }),
      update: vi.fn().mockResolvedValue({ id: 'proj-1' }),
      updateTrustPolicy: vi.fn().mockResolvedValue({ id: 'proj-1' }),
      archive: vi.fn().mockResolvedValue({ id: 'proj-1' }),
      unarchive: vi.fn().mockResolvedValue({ id: 'proj-1' }),
      selectDirectory: vi.fn().mockResolvedValue('/mock/path'),
    },
    sessions: {
      list: vi.fn().mockResolvedValue([
        { id: 'sess-1', projectId: 'proj-1', title: 'Main Planning Session', status: 'active' },
        { id: 'sess-2', projectId: 'proj-1', title: 'Secondary Session', status: 'completed' },
      ]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'sess-1', status: 'active' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 'sess-1' }),
      updateTitle: vi.fn().mockResolvedValue({ id: 'sess-1' }),
    },
    messages: {
      list: vi.fn().mockResolvedValue(mockMessages),
      append: vi.fn().mockResolvedValue({ id: 'msg-4' }),
    },
    tasks: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 't-1' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 't-1' }),
    },
    events: {
      list: vi.fn().mockResolvedValue([]),
      append: vi.fn().mockResolvedValue({ id: 'e-1' }),
      getTaskTrace: vi.fn().mockResolvedValue(null),
      exportTaskTrace: vi.fn().mockResolvedValue(''),
    },
    bridge: {
      getStatus: vi.fn().mockResolvedValue(mockStatus),
      initSessionBridge: vi.fn().mockResolvedValue(mockStatus.sessionPaths),
      sendMessage: vi.fn().mockImplementation((_projId: string, sessId: string, content: string): Promise<Message> => {
        return Promise.resolve({
          id: 'msg-out-new',
          sessionId: sessId,
          sender: 'user',
          recipient: 'chatgpt',
          messageType: 'message',
          contentMarkdown: content,
          sequence: 4,
          correlationId: null,
          createdAt: new Date().toISOString(),
        });
      }),
      startConnectionTest: vi.fn().mockResolvedValue({
        challengeId: 'chal-999-abc',
        instructions: 'Test handshake prompt for ChatGPT',
        outboxFilePath: '/mock/outbox/handshake_chal.json',
        inboxExpectedFilePath: '/mock/inbox/handshake_resp.json',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      }),
      openDirectory: vi.fn().mockResolvedValue(true),
      getInstructions: vi.fn().mockResolvedValue({
        bridgeRoot: '/home/user/.local/share/knot/bridge',
        sessionDir: '/home/user/.local/share/knot/bridge/sessions/sess-1',
        inboxDir: '/home/user/.local/share/knot/bridge/sessions/sess-1/inbox',
        outboxDir: '/home/user/.local/share/knot/bridge/sessions/sess-1/outbox',
        allowedDirectoriesConfig: '{}',
        chatgptPrompt: 'Prompt',
      }),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    antigravity: {
      startProcess: vi.fn().mockResolvedValue({ success: true }),
      stopProcess: vi.fn().mockResolvedValue({ success: true }),
      getStatus: vi.fn().mockResolvedValue({ isRunning: false }),
      getLogs: vi.fn().mockResolvedValue([]),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    orchestration: {
      approveTask: vi.fn().mockResolvedValue({ success: true }),
      rejectTask: vi.fn().mockResolvedValue({ success: true }),
      cancelTask: vi.fn().mockResolvedValue({ success: true }),
      retryTask: vi.fn().mockResolvedValue({ success: true }),
      listTasks: vi.fn().mockResolvedValue([]),
      listQueued: vi.fn().mockResolvedValue([]),
      getRunningTask: vi.fn().mockResolvedValue(null),
      dispatchNext: vi.fn().mockResolvedValue(null),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    git: {
      inspect: vi.fn().mockResolvedValue({ isGitRepo: true, branch: 'feat/test' }),
      diff: vi.fn().mockResolvedValue(''),
    },
    context: {
      list: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue({ id: 'ctx-1' }),
      delete: vi.fn().mockResolvedValue(true),
      listConflicts: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('ChatGPT Bridge Page Redesign & Expanded Navigation', () => {
  let mockApi: ReturnType<typeof createFullMockKnotApi>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = createFullMockKnotApi();
    (window as unknown as { knotApi: typeof mockApi }).knotApi = mockApi;
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('1. expands the navigation sidebar to approximately 248px without label truncation', async () => {
    const { container } = render(
      <Sidebar
        currentTab="bridge"
        onTabChange={vi.fn()}
        isCollapsed={false}
      />
    );

    const aside = container.querySelector('aside');
    expect(aside).toHaveClass('w-[248px]');

    // Full labels should be present and have whitespace-nowrap
    const commanderSpan = screen.getByText('Desktop Commander');
    expect(commanderSpan).toBeInTheDocument();
    expect(commanderSpan).toHaveClass('whitespace-nowrap');

    const bridgeSpan = screen.getByText('ChatGPT Bridge');
    expect(bridgeSpan).toBeInTheDocument();
    expect(bridgeSpan).toHaveClass('whitespace-nowrap');

    const projectSpan = screen.getByText('Projects & Sessions');
    expect(projectSpan).toBeInTheDocument();
    expect(projectSpan).toHaveClass('whitespace-nowrap');
  });

  it('2. collapses and expands the navigation rail correctly', async () => {
    const onToggle = vi.fn();
    const { rerender, container } = render(
      <Sidebar
        currentTab="bridge"
        onTabChange={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={onToggle}
      />
    );

    expect(container.querySelector('aside')).toHaveClass('w-[248px]');
    const collapseBtn = screen.getByTitle('Collapse Sidebar');
    fireEvent.click(collapseBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    // Rerender collapsed
    rerender(
      <Sidebar
        currentTab="bridge"
        onTabChange={vi.fn()}
        isCollapsed={true}
        onToggleCollapse={onToggle}
      />
    );
    expect(container.querySelector('aside')).toHaveClass('w-14');
  });

  it('3. renders ChatGPT Bridge header, status badge, and context toolbar with project & session selection', async () => {
    render(<BridgeManager />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'ChatGPT Bridge' })).toBeInTheDocument();
      expect(
        screen.getByText('Manage the local filesystem bridge and exchange messages with ChatGPT.')
      ).toBeInTheDocument();
      expect(screen.getByTestId('header-status-badge')).toHaveTextContent('Verified & Active');
      expect(screen.getByTestId('session-selector')).toBeInTheDocument();
    });

    // Check project and session selectors
    const projectSelect = screen.getByTestId('project-selector') as HTMLSelectElement;
    expect(projectSelect.value).toBe('proj-1');

    const sessionSelect = screen.getByTestId('session-selector') as HTMLSelectElement;
    expect(sessionSelect.value).toBe('sess-1');

    // Switch project
    fireEvent.change(projectSelect, { target: { value: 'proj-2' } });
    expect(mockApi.sessions.list).toHaveBeenCalledWith('proj-2');
  });

  it('4. triggers Sync Bridge and refreshes bridge data', async () => {
    render(<BridgeManager />);

    await waitFor(() => {
      expect(screen.getByTestId('sync-bridge-btn')).toBeInTheDocument();
    });

    const syncBtn = screen.getByTestId('sync-bridge-btn');
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(mockApi.bridge.getStatus).toHaveBeenCalled();
      expect(mockApi.messages.list).toHaveBeenCalledWith('sess-1');
    });
  });

  it('5. renders connection overview with Bridge Root, Desktop Commander, MCP Scope, and Watcher status', async () => {
    render(<BridgeManager />);

    await waitFor(() => {
      expect(screen.getByTestId('bridge-root-path')).toHaveTextContent(
        '/home/user/.local/share/knot/bridge'
      );
      expect(screen.getByText('Process Active')).toBeInTheDocument();
      expect(screen.getByText('read / write')).toBeInTheDocument();
      expect(screen.getByText('2 session inbox(es) active')).toBeInTheDocument();
      expect(screen.getByText('1 unread outbox result(s)')).toBeInTheDocument();
    });

    // Copy path test
    const copyPathBtn = screen.getByTestId('copy-bridge-path-btn');
    fireEvent.click(copyPathBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/home/user/.local/share/knot/bridge');

    // Open folder test
    const openFolderBtn = screen.getByTestId('open-bridge-folder-btn');
    fireEvent.click(openFolderBtn);
    expect(mockApi.bridge.openDirectory).toHaveBeenCalledWith('/home/user/.local/share/knot/bridge');
  });

  it('6. opens HandshakeModal when Test Connection is clicked and allows generating challenges', async () => {
    render(<BridgeManager />);

    await waitFor(() => {
      expect(screen.getByTestId('test-connection-btn')).toBeInTheDocument();
    });

    const testBtn = screen.getByTestId('test-connection-btn');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Verify ChatGPT Bridge Connection')).toBeInTheDocument();
    });

    const genBtn = screen.getByTestId('generate-challenge-btn');
    fireEvent.click(genBtn);

    await waitFor(() => {
      expect(mockApi.bridge.startConnectionTest).toHaveBeenCalledWith('proj-1', 'sess-1');
    });
  });

  it('7. filters message stream by Inbound, Outbound, All, and Conversation View', async () => {
    render(<BridgeManager />);

    await waitFor(() => {
      expect(screen.getByTestId('filter-all-btn')).toHaveTextContent('All (3)');
      expect(screen.getByTestId('filter-inbound-btn')).toHaveTextContent('Inbound (2)');
      expect(screen.getByTestId('filter-outbound-btn')).toHaveTextContent('Outbound (1)');
    });

    // Inbound filter
    fireEvent.click(screen.getByTestId('filter-inbound-btn'));
    expect(screen.getByTestId('message-item-msg-1')).toBeInTheDocument();
    expect(screen.getByTestId('message-item-msg-3')).toBeInTheDocument();
    expect(screen.queryByTestId('message-item-msg-2')).not.toBeInTheDocument();

    // Outbound filter
    fireEvent.click(screen.getByTestId('filter-outbound-btn'));
    expect(screen.getByTestId('message-item-msg-2')).toBeInTheDocument();
    expect(screen.queryByTestId('message-item-msg-1')).not.toBeInTheDocument();

    // Conversation View (canonical view)
    fireEvent.click(screen.getByTestId('filter-canonical-btn'));
    expect(screen.getByText('conversation.md (Canonical Single-Writer View)')).toBeInTheDocument();
  });

  it('8. expands and collapses long messages and shows technical metadata', async () => {
    render(<BridgeManager />);

    await waitFor(() => {
      expect(screen.getByTestId('message-item-msg-3')).toBeInTheDocument();
    });

    const expandBtn = screen.getByTestId('toggle-expand-msg-3');
    expect(expandBtn).toHaveTextContent('Show More');
    fireEvent.click(expandBtn);
    expect(expandBtn).toHaveTextContent('Show Less');

    // Technical metadata disclosure
    const toggleDetailsBtn = screen.getAllByText('Show Technical Details')[0];
    fireEvent.click(toggleDetailsBtn);
    expect(screen.getByText('Message ID:')).toBeInTheDocument();
  });

  it('9. handles outbound message composition with disabled states, atomic write, and success feedback', async () => {
    render(<BridgeManager />);

    await waitFor(() => {
      expect(screen.getByTestId('outbound-composer-form')).toBeInTheDocument();
    });

    const sendBtn = screen.getByTestId('send-outbox-btn');
    expect(sendBtn).toBeDisabled();

    const textarea = screen.getByTestId('outbound-message-input');
    fireEvent.change(textarea, { target: { value: 'New prompt for ChatGPT to analyze tests' } });
    expect(sendBtn).toBeEnabled();

    // Submit message
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    await waitFor(() => {
      expect(mockApi.bridge.sendMessage).toHaveBeenCalledWith(
        'proj-1',
        'sess-1',
        'New prompt for ChatGPT to analyze tests'
      );
      expect(screen.getByTestId('composer-feedback')).toHaveTextContent(
        'Message written atomically to outbox.'
      );
    });
  });

  it('10. routes to ChatGPT Bridge tab in App shell with correct Header breadcrumb', async () => {
    render(<App />);

    const bridgeNavBtn = screen.getByRole('button', { name: /ChatGPT Bridge/ });
    fireEvent.click(bridgeNavBtn);

    await waitFor(() => {
      // Header breadcrumb and sidebar both show ChatGPT Bridge
      expect(screen.getAllByText('ChatGPT Bridge').length).toBeGreaterThan(1);
      expect(screen.getAllByText('Knot').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByRole('heading', { level: 1, name: 'ChatGPT Bridge' })).toBeInTheDocument();
    });
  });
});
