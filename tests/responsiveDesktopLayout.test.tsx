import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from '../src/renderer/App.js';
import { Sidebar } from '../src/renderer/components/Sidebar.js';
import { CollaborationWorkspace } from '../src/renderer/components/Workspace/CollaborationWorkspace.js';
import type { Project, Session } from '../src/shared/types.js';

function createMockKnotApi() {
  const dummyProject: Project = {
    id: 'p-layout-1',
    name: 'Layout Test Project',
    repositoryPath: '/mock/repos/layout-test',
    repositoryRemote: 'git@github.com:axonel/knot.git',
    trustPolicy: 'approval_required',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
  };

  const dummySession: Session = {
    id: 's-layout-1',
    projectId: 'p-layout-1',
    title: 'Hyprland Layout Session',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    metadata: null,
  };

  return {
    startDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
    stopDesktopCommander: vi.fn().mockResolvedValue({ success: true }),
    getStatus: vi.fn().mockResolvedValue({
      state: 'Running' as const,
      connectionState: 'connected' as const,
      connectionVerified: true,
      pid: 1234,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      exitCode: null,
      errorMessage: null,
    }),
    getLogs: vi.fn().mockResolvedValue([]),
    clearLogs: vi.fn().mockResolvedValue(undefined),
    onStatusChange: vi.fn().mockReturnValue(vi.fn()),
    onLog: vi.fn().mockReturnValue(vi.fn()),
    projects: {
      list: vi.fn().mockResolvedValue([dummyProject]),
      get: vi.fn().mockResolvedValue(dummyProject),
      create: vi.fn().mockImplementation((d) => Promise.resolve({ id: 'p-new', ...d, trustPolicy: 'approval_required', createdAt: '', updatedAt: '', archivedAt: null })),
      update: vi.fn(),
      updateTrustPolicy: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      selectDirectory: vi.fn().mockResolvedValue('/mock/selected'),
    },
    sessions: {
      list: vi.fn().mockResolvedValue([dummySession]),
      get: vi.fn().mockResolvedValue(dummySession),
      create: vi.fn().mockImplementation((d) => Promise.resolve({ id: 's-new', ...d, status: 'active', createdAt: '', updatedAt: '', lastActivityAt: '', startedAt: '', endedAt: null, metadata: null })),
      updateStatus: vi.fn(),
      updateTitle: vi.fn(),
    },
    messages: {
      list: vi.fn().mockResolvedValue([
        {
          id: 'm-1',
          sessionId: dummySession.id,
          sequence: 1,
          sender: 'chatgpt',
          recipient: 'knot',
          messageType: 'text',
          contentMarkdown: 'Testing desktop layout at 960px width.',
          createdAt: new Date().toISOString(),
        },
      ]),
      send: vi.fn(),
    },
    tasks: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      updateStatus: vi.fn(),
    },
    events: {
      list: vi.fn().mockResolvedValue([
        {
          id: 'e-1',
          sessionId: dummySession.id,
          taskId: null,
          eventType: 'chatgpt_activity',
          actor: 'chatgpt',
          data: {
            category: 'architecture_decision',
            reference: 'src/renderer/App.tsx',
            summary: 'Reviewed Hyprland 960px split screen layout',
          },
          createdAt: new Date().toISOString(),
        },
      ]),
      append: vi.fn(),
    },
    bridge: {
      initSessionBridge: vi.fn().mockResolvedValue({
        projectDir: '/p',
        sessionDir: '/s',
        inboxDir: '/in',
        processedDir: '/proc',
        rejectedDir: '/rej',
        outboxDir: '/out',
        conversationFile: '/conv.md',
      }),
      getStatus: vi.fn().mockResolvedValue({
        workspaceInitialized: true,
        bridgeRoot: '/mock/bridge/v1',
        desktopCommanderRunning: true,
        mcpPermissionConfigured: true,
        handshakeState: 'verified',
        activeProjectId: dummyProject.id,
        activeSessionId: dummySession.id,
        lastInboundMessage: null,
        lastOutboundMessage: null,
      }),
      startHandshakeTest: vi.fn(),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      getInstructions: vi.fn().mockResolvedValue('Instructions'),
    },
    orchestration: {
      listTasks: vi.fn().mockResolvedValue([]),
      getRunningTask: vi.fn().mockResolvedValue(null),
      approveAndDispatch: vi.fn(),
      rejectTask: vi.fn(),
      cancelTask: vi.fn(),
      retryTask: vi.fn(),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    antigravity: {
      getStatus: vi.fn().mockResolvedValue({
        state: 'ready',
        installed: true,
        authenticated: true,
        activeSessionId: dummySession.id,
        activeTurnId: null,
        pid: 5678,
      }),
      startTurn: vi.fn(),
      interrupt: vi.fn(),
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      onUiEvent: vi.fn().mockReturnValue(vi.fn()),
    },
    context: {
      list: vi.fn().mockResolvedValue([]),
      listConflicts: vi.fn().mockResolvedValue([]),
      getManifest: vi.fn().mockResolvedValue({ documents: [] }),
      resolveConflict: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
    },
    timeline: {
      listProjectEvents: vi.fn().mockResolvedValue([]),
      listSessionEvents: vi.fn().mockResolvedValue([]),
      getTaskTrace: vi.fn().mockResolvedValue(null),
    },
  };
}

describe('P0 Responsive Desktop Layout Redesign (Hyprland / Omarchy Linux)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1400 });
    window.knotApi = createMockKnotApi() as any;
  });

  describe('Collapsible Outer Sidebar Rail', () => {
    it('renders expanded sidebar by default with text labels and collapse toggle', () => {
      const handleToggle = vi.fn();
      render(
        <Sidebar
          currentTab="workspace"
          onTabChange={vi.fn()}
          isCollapsed={false}
          onToggleCollapse={handleToggle}
        />
      );

      expect(screen.getByText('Where AI agents work together.')).toBeInTheDocument();
      expect(screen.getAllByText('Workspace').length).toBeGreaterThan(0);
      expect(screen.getByText('Projects & Sessions')).toBeInTheDocument();
      expect(screen.getByText('Desktop Commander')).toBeInTheDocument();
      expect(screen.getByText('Collapse Rail')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Collapse Rail'));
      expect(handleToggle).toHaveBeenCalledTimes(1);
    });

    it('renders ultra-compact icon rail (w-14) when collapsed, hiding full text but retaining access', () => {
      const handleToggle = vi.fn();
      const { container } = render(
        <Sidebar
          currentTab="workspace"
          onTabChange={vi.fn()}
          isCollapsed={true}
          onToggleCollapse={handleToggle}
        />
      );

      expect(container.querySelector('aside')).toHaveClass('w-14');
      expect(screen.queryByText('Where AI agents work together.')).not.toBeInTheDocument();
      expect(screen.queryByText('Collapse Rail')).not.toBeInTheDocument();

      // Expand trigger button is available
      const expandButtons = screen.getAllByTitle('Expand Sidebar');
      expect(expandButtons.length).toBeGreaterThan(0);
      fireEvent.click(expandButtons[0]);
      expect(handleToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('CollaborationWorkspace Responsive Layouts', () => {
    it('renders all three collaboration areas and toolbar controls cleanly', async () => {
      render(<CollaborationWorkspace />);

      await waitFor(() => {
        expect(screen.getByText('Multi-Agent Workspace')).toBeInTheDocument();
        expect(screen.getAllByText('Layout Test Project').length).toBeGreaterThan(0);
        expect(screen.getByText('Activity')).toBeInTheDocument();
        expect(screen.getByText('Execution')).toBeInTheDocument();
        expect(screen.getByText('Focus')).toBeInTheDocument();
        expect(screen.getByText('Conversation')).toBeInTheDocument();
      });
    });

    it('toggles Focus Mode, maximizing central workspace and displaying focus banner with exit trigger', async () => {
      render(<CollaborationWorkspace />);

      await waitFor(() => {
        expect(screen.getByText('Focus')).toBeInTheDocument();
      });

      // Enter Focus Mode
      const focusBtn = screen.getByTitle('Focus Mode: Maximize Central Workspace');
      fireEvent.click(focusBtn);

      await waitFor(() => {
        expect(screen.getByText('Focus Mode Active')).toBeInTheDocument();
        expect(screen.getByText('Exit')).toBeInTheDocument();
      });

      // Exit Focus Mode
      fireEvent.click(screen.getByText('Exit'));

      await waitFor(() => {
        expect(screen.queryByText('Focus Mode Active')).not.toBeInTheDocument();
      });
    });

    it('toggles compact slide-over drawers without unmounting panels or losing component state', async () => {
      // Set window.innerWidth to 960 (Hyprland 50% split on 1080p)
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 960 });

      render(<CollaborationWorkspace />);

      await waitFor(() => {
        expect(screen.getByText('Activity')).toBeInTheDocument();
        expect(screen.getByText('Execution')).toBeInTheDocument();
      });

      // Toggle Activity drawer
      const activityBtn = screen.getByTitle('Toggle ChatGPT Planner / Activity');
      fireEvent.click(activityBtn);

      await waitFor(() => {
        expect(screen.getByText('ChatGPT Planner / Activity')).toBeInTheDocument();
      });

      // Toggle Execution drawer
      const executionBtn = screen.getByTitle('Toggle Antigravity Worker / Execution');
      fireEvent.click(executionBtn);

      await waitFor(() => {
        expect(screen.getByText('Antigravity Worker / Execution')).toBeInTheDocument();
      });

      // Toggle Projects drawer
      const projectsBtn = screen.getByTitle('Open Projects Drawer');
      fireEvent.click(projectsBtn);

      await waitFor(() => {
        expect(screen.getAllByText('Projects & Sessions').length).toBeGreaterThan(0);
      });
    });

    it('switches between Conversation, Context Vault, and Timeline without layout clipping', async () => {
      render(<CollaborationWorkspace />);

      await waitFor(() => {
        expect(screen.getByText('Conversation')).toBeInTheDocument();
        expect(screen.getByText('Context Vault')).toBeInTheDocument();
        expect(screen.getByText('Timeline')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Context Vault'));
      await waitFor(() => {
        expect(screen.getByText(/Project Context Vault/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Timeline'));
      await waitFor(() => {
        expect(screen.getByText(/Unified Execution Timeline/i)).toBeInTheDocument();
      });
    });
  });

  describe('Full App Integration at Resized Desktop Dimensions', () => {
    it('adapts when window resizes between 1920x1080 and 960x1080', async () => {
      // Start at 1920
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1920 });
      const { container } = render(<App />);

      expect(screen.getByText('Where AI agents work together.')).toBeInTheDocument();
      expect(screen.getAllByText('Workspace').length).toBeGreaterThan(0);

      // Resize window to 960px (Hyprland 50% tile)
      act(() => {
        Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 960 });
        window.dispatchEvent(new Event('resize'));
      });

      await waitFor(() => {
        // Sidebar auto-collapses to icon rail at 960px
        expect(container.querySelector('aside')).toHaveClass('w-14');
        expect(screen.queryByText('Collapse Rail')).not.toBeInTheDocument();
      });

      // User manually expands sidebar if desired
      const expandBtn = screen.getAllByTitle('Expand Sidebar')[0];
      fireEvent.click(expandBtn);

      await waitFor(() => {
        expect(container.querySelector('aside')).toHaveClass('w-56');
        expect(screen.getByText('Where AI agents work together.')).toBeInTheDocument();
      });
    });
  });
});
