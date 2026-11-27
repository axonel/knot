import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Layers,
  Compass,
  Sparkles,
  ShieldCheck,
  Plus,
  RefreshCw,
  FolderGit2,
  BookOpen,
  Clock,
  Wrench,
  ShieldAlert,
  Maximize2,
  Minimize2,
  X,
  Keyboard,
} from 'lucide-react';
import type {
  Project,
  Session,
  Task,
  BridgeStatusInfo,
  SessionBridgePaths,
} from '../../../shared/types.js';
import { WorkspaceSidebarTree } from './WorkspaceSidebarTree.js';
import { DirectoryAccessDiagnostic } from './DirectoryAccessDiagnostic.js';
import { SharedConversationPanel } from './SharedConversationPanel.js';
import { ChatGptActivityPanel } from './ChatGptActivityPanel.js';
import { AntigravityExecutionPanel } from './AntigravityExecutionPanel.js';
import { ContextVaultPanel } from './ContextVaultPanel.js';
import { UnifiedTimelinePanel } from './UnifiedTimelinePanel.js';
import { ReliabilityModal } from './ReliabilityModal.js';
import { SecurityModal } from './SecurityModal.js';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal.js';
import { useTaskUndoManager } from '../../hooks/useTaskUndoManager.js';
import { UndoNotificationBanner } from '../Safety/UndoNotificationBanner.js';
import { isEditableTarget } from '../../utils/keyboardUtils.js';

interface CollaborationWorkspaceProps {
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  centerView?: 'conversation' | 'context' | 'timeline';
  onCenterViewChange?: (view: 'conversation' | 'context' | 'timeline') => void;
}

export const CollaborationWorkspace: React.FC<CollaborationWorkspaceProps> = ({
  isFocusMode: externalFocusMode,
  onToggleFocusMode: externalToggleFocusMode,
  centerView: externalCenterView,
  onCenterViewChange: externalCenterViewChange,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessionsByProject, setSessionsByProject] = useState<Map<string, Session[]>>(new Map());
  const [tasksBySession, setTasksBySession] = useState<Map<string, Task[]>>(new Map());
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionPaths, setSessionPaths] = useState<SessionBridgePaths | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatusInfo | null>(null);

  // Synchronous refs to prevent stale closure loops across async IPC events
  const selectedProjectRef = useRef<Project | null>(null);
  const selectedSessionRef = useRef<Session | null>(null);
  const hasAutoSelectedRef = useRef<boolean>(false);
  const isFetchingWorkspaceRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Window size tracking for responsive desktop tiling (e.g. ~960px half-screen on 1080p)
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1400));

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isCompact = windowWidth < 1280;

  // Focus mode state
  const [internalFocusMode, setInternalFocusMode] = useState(false);
  const isFocusMode = externalFocusMode !== undefined ? externalFocusMode : internalFocusMode;
  const toggleFocusMode = () => {
    if (externalToggleFocusMode) {
      externalToggleFocusMode();
    } else {
      setInternalFocusMode((prev) => !prev);
    }
  };

  // Panel display toggles
  const [showProjectTree, setShowProjectTree] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth >= 1280 : true;
  });
  const [showLeftActivity, setShowLeftActivity] = useState(true);
  const [showRightExecution, setShowRightExecution] = useState(true);
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  // Compact drawer state ('none' | 'projects' | 'activity' | 'execution')
  const [compactDrawer, setCompactDrawer] = useState<'none' | 'projects' | 'activity' | 'execution'>('none');

  // View state: conversation vs context vault vs unified timeline
  const [internalCenterView, setInternalCenterView] = useState<'conversation' | 'context' | 'timeline'>('conversation');
  const centerView = externalCenterView !== undefined ? externalCenterView : internalCenterView;
  const setCenterView = useCallback((view: 'conversation' | 'context' | 'timeline') => {
    if (externalCenterViewChange) {
      externalCenterViewChange(view);
    } else {
      setInternalCenterView(view);
    }
  }, [externalCenterViewChange]);

  const [selectedTimelineTaskId, setSelectedTimelineTaskId] = useState<string | null>(null);
  const [unresolvedConflictsCount, setUnresolvedConflictsCount] = useState(0);

  // Keyboard Shortcuts modal state
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Task selection & approval refs/state for Ctrl+Enter
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isApprovingTask, setIsApprovingTask] = useState(false);
  const executionApproveHandlerRef = useRef<((taskId: string) => Promise<void>) | null>(null);

  // Focus restoration refs for closing overlays and drawers
  const activityToggleBtnRef = useRef<HTMLButtonElement | null>(null);
  const executionToggleBtnRef = useRef<HTMLButtonElement | null>(null);
  const projectsToggleBtnRef = useRef<HTMLButtonElement | null>(null);
  const shortcutsBtnRef = useRef<HTMLButtonElement | null>(null);
  const reliabilityBtnRef = useRef<HTMLButtonElement | null>(null);
  const securityBtnRef = useRef<HTMLButtonElement | null>(null);

  // Modals
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [showReliabilityModal, setShowReliabilityModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [modalProjectName, setModalProjectName] = useState('');
  const [modalRepoPath, setModalRepoPath] = useState('');
  const [modalSessionTitle, setModalSessionTitle] = useState('');
  const [targetProjectForSession, setTargetProjectForSession] = useState<Project | null>(null);

  const updateSelectedProject = (p: Project | null) => {
    selectedProjectRef.current = p;
    setSelectedProject(p);
  };

  const updateSelectedSession = (s: Session | null) => {
    selectedSessionRef.current = s;
    setSelectedSession(s);
  };

  const selectSession = async (project: Project, session: Session) => {
    if (!window.knotApi) return;

    const isAlreadyActive =
      selectedProjectRef.current?.id === project.id &&
      selectedSessionRef.current?.id === session.id &&
      sessionPaths !== null;

    updateSelectedProject(project);
    updateSelectedSession(session);

    if (isAlreadyActive) {
      return;
    }

    try {
      const paths = await window.knotApi.bridge.initSessionBridge(project.id, session.id);
      setSessionPaths(paths);
      const status = await window.knotApi.bridge.getStatus(session.id);
      setBridgeStatus(status);
    } catch (err) {
      console.error('[CollaborationWorkspace] Error initializing session bridge:', err);
    }
  };

  const handleSelectSession = (project: Project, session: Session) => {
    selectSession(project, session);
    if (isCompact || isFocusMode) {
      setCompactDrawer('none');
    }
  };

  // Load all workspace projects, sessions, tasks, and conflicts
  const loadWorkspaceData = useCallback(async () => {
    if (!window.knotApi || isFetchingWorkspaceRef.current) return;

    isFetchingWorkspaceRef.current = true;
    try {
      const projectList = await window.knotApi.projects.list();
      setProjects(projectList);

      const sessionMap = new Map<string, Session[]>();
      const taskMap = new Map<string, Task[]>();

      for (const p of projectList) {
        const sList = await window.knotApi.sessions.list(p.id);
        sessionMap.set(p.id, sList);

        for (const s of sList) {
          const tList = await window.knotApi.orchestration.listTasks(s.id);
          taskMap.set(s.id, tList);
        }
      }

      setSessionsByProject(sessionMap);
      setTasksBySession(taskMap);

      // Auto-select first active session on boot if none active
      if (!hasAutoSelectedRef.current) {
        let firstS: { p: Project; s: Session } | null = null;
        for (const p of projectList) {
          const sList = sessionMap.get(p.id) || [];
          if (sList.length > 0) {
            firstS = { p, s: sList[0] };
            break;
          }
        }

        if (firstS) {
          hasAutoSelectedRef.current = true;
          selectSession(firstS.p, firstS.s);
        }
      }

      // Check conflicts for active session
      if (selectedSessionRef.current) {
        try {
          const conflicts = await window.knotApi.context.listConflicts(selectedSessionRef.current.id);
          const unresolved = conflicts.filter((c) => !c.resolvedAt);
          setUnresolvedConflictsCount(unresolved.length);
        } catch {
          // Context API optional fallback
        }
      }
    } catch (err) {
      console.error('[CollaborationWorkspace] Failed to load workspace data:', err);
    } finally {
      isFetchingWorkspaceRef.current = false;
    }
  }, []);

  const triggerDebouncedLoad = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      loadWorkspaceData();
    }, 150);
  }, [loadWorkspaceData]);

  useEffect(() => {
    loadWorkspaceData();

    if (!window.knotApi) return;

    // Listen to bridge inbound/outbound events for real-time reactivity
    const unlistenBridge = window.knotApi.bridge.onEvent((evt) => {
      if (
        evt.type === 'message-received' ||
        evt.type === 'message-published' ||
        evt.type === 'message-rejected' ||
        evt.type === 'activity-received' ||
        evt.type === 'task-assignment-received' ||
        evt.type === 'workspace-index-updated' ||
        evt.type === 'context-updated'
      ) {
        triggerDebouncedLoad();
      }
    });

    const unlistenStatus = window.knotApi.onStatusChange((_newStatus) => {
      if (selectedSessionRef.current) {
        window.knotApi!.bridge
          .getStatus(selectedSessionRef.current.id)
          .then((st) => setBridgeStatus(st))
          .catch(() => {});
      }
    });

    return () => {
      unlistenBridge();
      unlistenStatus();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [loadWorkspaceData, triggerDebouncedLoad]);

  // Active session tasks and current effective task selection
  const activeSessionTasks = selectedSession ? tasksBySession.get(selectedSession.id) || [] : [];
  const effectiveSelectedTaskId =
    selectedTaskId && activeSessionTasks.some((t) => t.id === selectedTaskId)
      ? selectedTaskId
      : activeSessionTasks.find((t) => t.status === 'awaiting_approval')?.id ||
        activeSessionTasks[0]?.id ||
        null;

  // 3-second undo manager for task cancellation and rejection
  const {
    pendingActions,
    scheduleAction,
    undoAction,
    isTaskPending,
    getPendingAction,
  } = useTaskUndoManager(async (taskId, actionType) => {
    if (!window.knotApi) return;
    try {
      // Revalidate task status before executing backend action
      const currentTask = activeSessionTasks.find((t) => t.id === taskId);
      if (currentTask && ['succeeded', 'failed', 'cancelled'].includes(currentTask.status)) {
        return; // Already resolved, skip redundant action
      }

      if (actionType === 'cancel') {
        await window.knotApi.orchestration.cancelTask(taskId, 'Cancelled by user');
      } else {
        await window.knotApi.orchestration.rejectTask(taskId, 'Rejected by user');
      }
      await loadWorkspaceData();
    } catch (err) {
      console.error(`[CollaborationWorkspace] Failed executing deferred ${actionType} for ${taskId}:`, err);
    }
  });

  // Task approval handler for Ctrl+Enter
  const handleApproveSelectedTask = useCallback(async () => {
    if (isApprovingTask || !effectiveSelectedTaskId) return;

    // Safety invariant: cannot approve if task is currently undergoing pending rejection
    const pending = getPendingAction(effectiveSelectedTaskId);
    if (pending && pending.actionType === 'reject') {
      return;
    }

    const targetTask = activeSessionTasks.find((t) => t.id === effectiveSelectedTaskId);
    // Strict safety invariant: only approve tasks that are genuinely awaiting approval
    if (!targetTask || targetTask.status !== 'awaiting_approval') {
      return;
    }

    setIsApprovingTask(true);
    try {
      if (executionApproveHandlerRef.current) {
        await executionApproveHandlerRef.current(targetTask.id);
      } else if (window.knotApi) {
        await window.knotApi.orchestration.approveTask(targetTask.id);
        await loadWorkspaceData();
      }
    } catch (err) {
      console.error('[CollaborationWorkspace] Error approving task via keyboard shortcut:', err);
    } finally {
      setIsApprovingTask(false);
    }
  }, [isApprovingTask, effectiveSelectedTaskId, activeSessionTasks, loadWorkspaceData, getPendingAction]);

  // Global Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent key-repeat from triggering duplicate operations
      if (e.repeat) return;

      // Esc closes highest-priority open modal, diff viewer or drawer
      if (e.key === 'Escape') {
        if (showShortcutsModal) {
          e.preventDefault();
          setShowShortcutsModal(false);
          shortcutsBtnRef.current?.focus();
          return;
        }
        if (showNewSessionModal) {
          e.preventDefault();
          setShowNewSessionModal(false);
          return;
        }
        if (showNewProjectModal) {
          e.preventDefault();
          setShowNewProjectModal(false);
          return;
        }
        if (showReliabilityModal) {
          e.preventDefault();
          setShowReliabilityModal(false);
          reliabilityBtnRef.current?.focus();
          return;
        }
        if (showSecurityModal) {
          e.preventDefault();
          setShowSecurityModal(false);
          securityBtnRef.current?.focus();
          return;
        }
        if (compactDrawer !== 'none') {
          e.preventDefault();
          const prevDrawer = compactDrawer;
          setCompactDrawer('none');
          if (prevDrawer === 'projects') projectsToggleBtnRef.current?.focus();
          else if (prevDrawer === 'activity') activityToggleBtnRef.current?.focus();
          else if (prevDrawer === 'execution') executionToggleBtnRef.current?.focus();
          return;
        }
        return;
      }

      // Input guard: Do not trigger shortcuts while typing in inputs, textareas, or editors
      if (isEditableTarget(e.target)) {
        return;
      }

      // Ctrl + Enter: Approve currently selected task if awaiting approval
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleApproveSelectedTask();
        return;
      }

      // Ctrl + B: Toggle ChatGPT Planner / Activity panel or drawer
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        if (isCompact || isFocusMode) {
          setCompactDrawer((prev) => {
            const next = prev === 'activity' ? 'none' : 'activity';
            if (next === 'none') activityToggleBtnRef.current?.focus();
            return next;
          });
        } else {
          setShowLeftActivity((prev) => !prev);
        }
        return;
      }

      // Disallow single-key shortcuts when modifier keys are pressed
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      // Single-key navigation shortcuts
      if (e.key === '1') {
        e.preventDefault();
        setCenterView('conversation');
        return;
      }

      if (e.key === '2') {
        e.preventDefault();
        setCenterView('context');
        return;
      }

      if (e.key === '3') {
        e.preventDefault();
        setCenterView('timeline');
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCompact,
    isFocusMode,
    showShortcutsModal,
    showNewSessionModal,
    showNewProjectModal,
    showReliabilityModal,
    showSecurityModal,
    compactDrawer,
    handleApproveSelectedTask,
    setCenterView,
  ]);

  // Handle Project Creation Modal
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.knotApi || !modalProjectName.trim()) return;

    try {
      const p = await window.knotApi.projects.create({
        name: modalProjectName.trim(),
        repositoryPath: modalRepoPath.trim() || undefined,
      });

      setModalProjectName('');
      setModalRepoPath('');
      setShowNewProjectModal(false);

      // Auto-create default session for new project
      const s = await window.knotApi.sessions.create({
        projectId: p.id,
        title: 'Initial Session',
      });

      await loadWorkspaceData();
      selectSession(p, s);
    } catch (err) {
      console.error('[CollaborationWorkspace] Failed to create project:', err);
    }
  };

  // Handle Session Creation Modal
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.knotApi || !targetProjectForSession || !modalSessionTitle.trim()) return;

    try {
      const s = await window.knotApi.sessions.create({
        projectId: targetProjectForSession.id,
        title: modalSessionTitle.trim(),
      });

      setModalSessionTitle('');
      setTargetProjectForSession(null);
      setShowNewSessionModal(false);

      await loadWorkspaceData();
      selectSession(targetProjectForSession, s);
    } catch (err) {
      console.error('[CollaborationWorkspace] Failed to create session:', err);
    }
  };

  const handleSelectDirectory = async () => {
    if (!window.knotApi) return;
    try {
      const dir = await window.knotApi.projects.selectDirectory();
      if (dir) {
        setModalRepoPath(dir);
      }
    } catch (err) {
      console.error('[CollaborationWorkspace] Failed to select directory:', err);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#111213] relative">
      {/* Workspace Project Tree: Inline in Wide Mode, Slide-Over Drawer in Compact or Focus Mode */}
      <div
        aria-hidden={isCompact || isFocusMode ? compactDrawer !== 'projects' : !showProjectTree}
        inert={(isCompact || isFocusMode ? compactDrawer !== 'projects' : !showProjectTree) ? true : undefined}
        className={
          isCompact || isFocusMode
            ? `absolute inset-y-0 left-0 z-40 w-72 max-w-[85vw] bg-[#1B1D1F] border-r border-[#F0F0ED]/15 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
                compactDrawer === 'projects' ? 'translate-x-0' : '-translate-x-full pointer-events-none'
              }`
            : `shrink-0 h-full transition-all duration-200 overflow-hidden ${
                showProjectTree ? 'w-60 xl:w-64 opacity-100' : 'w-0 opacity-0 pointer-events-none'
              }`
        }
      >
        {(isCompact || isFocusMode) && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#F0F0ED]/10 bg-[#111213]">
            <div className="flex items-center gap-2">
              <FolderGit2 size={14} className="text-[#E05252]" />
              <span className="text-xs font-mono font-bold text-[#F0F0ED]">Projects & Sessions</span>
            </div>
            <button
              onClick={() => setCompactDrawer('none')}
              className="p-1 rounded text-[#F0F0ED]/60 hover:text-[#F0F0ED] hover:bg-[#F0F0ED]/10 text-xs cursor-pointer"
              title="Close Drawer"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden h-full">
          <WorkspaceSidebarTree
            projects={projects}
            sessionsByProject={sessionsByProject}
            tasksBySession={tasksBySession}
            selectedProjectId={selectedProject?.id || null}
            selectedSessionId={selectedSession?.id || null}
            onSelectSession={handleSelectSession}
            onCreateProject={() => setShowNewProjectModal(true)}
            onCreateSession={(p) => {
              setTargetProjectForSession(p);
              setShowNewSessionModal(true);
            }}
            onCollapse={!isCompact && !isFocusMode ? () => setShowProjectTree(false) : undefined}
          />
        </div>
      </div>

      {/* Main Workspace Panels Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        {/* Workspace Toolbar Header */}
        <div className="px-3 py-2 bg-[#1B1D1F] border-b border-[#F0F0ED]/10 flex flex-wrap items-center justify-between gap-2 shrink-0 select-none">
          {/* Left Cluster: Project/Session Context & Tree Toggle */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Title / Identity Badge */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Layers size={15} className="text-[#292C2F]" />
              <span className="text-xs font-bold text-[#F0F0ED] uppercase tracking-wider font-mono hidden sm:inline">
                Multi-Agent Workspace
              </span>
            </div>

            {/* Project Tree Toggle Button */}
            <button
              ref={projectsToggleBtnRef}
              onClick={() => {
                if (isCompact || isFocusMode) {
                  setCompactDrawer((prev) => (prev === 'projects' ? 'none' : 'projects'));
                } else {
                  setShowProjectTree((prev) => !prev);
                }
              }}
              title={
                isCompact || isFocusMode
                  ? 'Open Projects Drawer'
                  : showProjectTree
                  ? 'Collapse Projects Panel'
                  : 'Expand Projects Panel'
              }
              aria-label="Projects and Sessions"
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] ${
                (isCompact || isFocusMode ? compactDrawer === 'projects' : showProjectTree)
                  ? 'bg-[#292C2F] text-[#F0F0ED] border-[#292C2F] font-semibold'
                  : 'bg-[#111213] text-[#F0F0ED]/70 border-[#F0F0ED]/10 hover:text-[#F0F0ED]'
              }`}
            >
              <FolderGit2 size={13} className="text-[#E05252] shrink-0" />
              <span className="truncate max-w-[100px] sm:max-w-[140px]">
                {selectedProject ? selectedProject.name : 'Projects'}
              </span>
              <span className="text-[10px] font-mono px-1 rounded bg-[#111213]/60 text-[#F0F0ED]/60 shrink-0">
                {projects.length}
              </span>
            </button>

            {/* Session Breadcrumb */}
            {selectedSession && (
              <div className="flex items-center gap-1 text-xs text-[#F0F0ED]/60 font-mono truncate min-w-0">
                <span>/</span>
                <span className="text-[#E05252] font-semibold truncate max-w-[100px] sm:max-w-[160px]">
                  {selectedSession.title}
                </span>
              </div>
            )}
          </div>

          {/* Center Cluster: 3-Way Workspace View Switcher */}
          <div className="flex items-center bg-[#111213] p-0.5 rounded-lg border border-[#F0F0ED]/10">
            <button
              onClick={() => setCenterView('conversation')}
              title="Conversation View (Shortcut: 1)"
              aria-label="Conversation View (1)"
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] ${
                centerView === 'conversation'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-bold shadow-xs'
                  : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED]'
              }`}
            >
              <span>Conversation</span>
            </button>
            <button
              onClick={() => setCenterView('context')}
              title="Context Vault (Shortcut: 2)"
              aria-label="Context Vault (2)"
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] ${
                centerView === 'context'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-bold shadow-xs'
                  : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED]'
              }`}
            >
              <BookOpen size={12} />
              <span className="hidden xs:inline">Context Vault</span>
              <span className="xs:hidden">Vault</span>
              {unresolvedConflictsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#E05252] text-[#F0F0ED] font-bold">
                  {unresolvedConflictsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setCenterView('timeline')}
              title="Unified Timeline (Shortcut: 3)"
              aria-label="Unified Timeline (3)"
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] ${
                centerView === 'timeline'
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-bold shadow-xs'
                  : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED]'
              }`}
            >
              <Clock size={12} className={centerView === 'timeline' ? 'text-[#E05252]' : ''} />
              <span>Timeline</span>
            </button>
          </div>

          {/* Right Cluster: Work Area Toggles, Focus Mode & Utilities */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Activity Toggle */}
            <button
              ref={activityToggleBtnRef}
              onClick={() => {
                if (isCompact || isFocusMode) {
                  setCompactDrawer((prev) => (prev === 'activity' ? 'none' : 'activity'));
                } else {
                  setShowLeftActivity((prev) => !prev);
                }
              }}
              title="Toggle ChatGPT Planner / Activity"
              aria-label="Toggle ChatGPT Planner / Activity (Ctrl+B)"
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] ${
                (isCompact || isFocusMode ? compactDrawer === 'activity' : showLeftActivity)
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-bold'
                  : 'bg-[#111213] text-[#F0F0ED]/60 border border-[#F0F0ED]/10 hover:text-[#F0F0ED]'
              }`}
            >
              <Compass size={12} />
              <span className="hidden sm:inline">Activity</span>
            </button>

            {/* Execution Toggle */}
            <button
              ref={executionToggleBtnRef}
              onClick={() => {
                if (isCompact || isFocusMode) {
                  setCompactDrawer((prev) => (prev === 'execution' ? 'none' : 'execution'));
                } else {
                  setShowRightExecution((prev) => !prev);
                }
              }}
              title="Toggle Antigravity Worker / Execution"
              aria-label="Toggle Antigravity Worker / Execution"
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] ${
                (isCompact || isFocusMode ? compactDrawer === 'execution' : showRightExecution)
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-bold'
                  : 'bg-[#111213] text-[#F0F0ED]/60 border border-[#F0F0ED]/10 hover:text-[#F0F0ED]'
              }`}
            >
              <Sparkles size={12} />
              <span className="hidden sm:inline">Execution</span>
            </button>

            {/* Focus Mode Toggle */}
            <button
              onClick={toggleFocusMode}
              title={isFocusMode ? 'Exit Focus Mode' : 'Focus Mode: Maximize Central Workspace'}
              aria-label="Toggle Focus Mode"
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] ${
                isFocusMode
                  ? 'bg-[#E05252] text-[#F0F0ED] font-bold shadow-xs'
                  : 'bg-[#111213] text-[#F0F0ED]/60 border border-[#F0F0ED]/10 hover:text-[#F0F0ED]'
              }`}
            >
              {isFocusMode ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              <span className="hidden md:inline">{isFocusMode ? 'Focus Active' : 'Focus'}</span>
            </button>

            {/* Keyboard Shortcuts Reference Button */}
            <button
              ref={shortcutsBtnRef}
              onClick={() => setShowShortcutsModal(true)}
              title="Keyboard Shortcuts Reference (?)"
              aria-label="Keyboard Shortcuts Reference (?)"
              className="px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all bg-[#111213] text-[#F0F0ED]/80 border border-[#F0F0ED]/10 hover:text-[#F0F0ED] hover:border-[#F0F0ED]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] cursor-pointer font-mono"
            >
              <Keyboard size={13} className="text-[#E05252]" />
              <span className="hidden lg:inline text-[10px] text-[#F0F0ED]/60">?</span>
            </button>

            {/* Diagnostic Button */}
            <button
              onClick={() => setShowDiagnostic((v) => !v)}
              title="Toggle Directory Access Diagnostic"
              aria-label="Toggle Directory Access Diagnostic"
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] ${
                showDiagnostic
                  ? 'bg-[#292C2F] text-[#F0F0ED] font-bold'
                  : 'bg-[#111213] text-[#F0F0ED]/60 border border-[#F0F0ED]/10 hover:text-[#F0F0ED]'
              }`}
            >
              <ShieldCheck size={12} />
              <span className="hidden md:inline">Diagnostic</span>
            </button>

            {/* Reliability Modal Button */}
            <button
              ref={reliabilityBtnRef}
              onClick={() => setShowReliabilityModal(true)}
              title="Runtime Reliability & Recovery Diagnostics"
              aria-label="Runtime Reliability and Recovery Diagnostics"
              className="p-1.5 rounded text-xs font-medium flex items-center transition-all bg-[#111213] text-[#F0F0ED]/80 border border-[#F0F0ED]/10 hover:text-[#F0F0ED] hover:border-[#F0F0ED]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] cursor-pointer"
            >
              <Wrench size={12} className="text-[#E05252]" />
            </button>

            {/* Security Modal Button */}
            <button
              ref={securityBtnRef}
              onClick={() => setShowSecurityModal(true)}
              title="Security Boundaries & Threat Policy"
              aria-label="Security Boundaries and Threat Policy"
              className="p-1.5 rounded text-xs font-medium flex items-center transition-all bg-[#111213] text-[#F0F0ED]/80 border border-[#F0F0ED]/10 hover:text-[#F0F0ED] hover:border-[#F0F0ED]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] cursor-pointer"
            >
              <ShieldAlert size={12} className="text-[#E05252]" />
            </button>

            {/* Refresh Button */}
            <button
              onClick={loadWorkspaceData}
              title="Refresh Workspace Data"
              aria-label="Refresh Workspace Data"
              className="p-1.5 rounded bg-[#111213] border border-[#F0F0ED]/10 text-[#F0F0ED]/70 hover:text-[#F0F0ED] hover:bg-[#292C2F]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] transition-all text-xs cursor-pointer"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {/* Diagnostic Banner if active or warning */}
        {(showDiagnostic || (selectedProject && !selectedProject.repositoryPath)) && (
          <div className="p-3 border-b border-[#F0F0ED]/10 bg-[#111213] shrink-0 overflow-x-auto">
            <DirectoryAccessDiagnostic
              project={selectedProject}
              bridgeStatus={bridgeStatus}
            />
          </div>
        )}

        {/* Focus Mode Banner */}
        {isFocusMode && (
          <div className="px-3 py-1.5 bg-[#292C2F]/30 border-b border-[#292C2F]/40 flex items-center justify-between text-xs text-[#F0F0ED] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#E05252] animate-pulse shrink-0" />
              <span className="font-semibold text-xs text-[#F0F0ED] shrink-0">Focus Mode Active</span>
              <span className="text-[#F0F0ED]/60 truncate hidden sm:inline">
                — 100% workspace prioritized for {centerView === 'conversation' ? 'Conversation' : centerView === 'context' ? 'Context Vault' : 'Timeline'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setCompactDrawer(compactDrawer === 'projects' ? 'none' : 'projects')}
                className="px-2 py-0.5 rounded text-[11px] bg-[#1B1D1F] hover:bg-[#292C2F] text-[#F0F0ED] flex items-center gap-1 cursor-pointer border border-[#F0F0ED]/10"
              >
                <FolderGit2 size={11} className="text-[#E05252]" />
                <span>Projects</span>
              </button>
              <button
                onClick={() => setCompactDrawer(compactDrawer === 'activity' ? 'none' : 'activity')}
                className="px-2 py-0.5 rounded text-[11px] bg-[#1B1D1F] hover:bg-[#292C2F] text-[#F0F0ED] flex items-center gap-1 cursor-pointer border border-[#F0F0ED]/10"
              >
                <Compass size={11} />
                <span>Activity</span>
              </button>
              <button
                onClick={() => setCompactDrawer(compactDrawer === 'execution' ? 'none' : 'execution')}
                className="px-2 py-0.5 rounded text-[11px] bg-[#1B1D1F] hover:bg-[#292C2F] text-[#F0F0ED] flex items-center gap-1 cursor-pointer border border-[#F0F0ED]/10"
              >
                <Sparkles size={11} />
                <span>Execution</span>
              </button>
              <button
                onClick={toggleFocusMode}
                className="px-2.5 py-0.5 rounded text-[11px] bg-[#E05252] text-[#F0F0ED] font-bold hover:bg-[#E05252]/90 flex items-center gap-1 ml-1 cursor-pointer shadow-xs"
              >
                <Minimize2 size={11} />
                <span>Exit</span>
              </button>
            </div>
          </div>
        )}

        {/* 3 Work Areas / Main Collaboration Canvas */}
        <div className="flex-1 flex overflow-hidden p-2 sm:p-3 gap-2 sm:gap-3 relative">
          {/* Backdrop for compact/focus slide-over drawers */}
          {(isCompact || isFocusMode) && compactDrawer !== 'none' && (
            <div
              className="absolute inset-0 z-30 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
              onClick={() => setCompactDrawer('none')}
            />
          )}

          {/* Left Panel: ChatGPT Planner & Activity */}
          <div
            aria-hidden={isCompact || isFocusMode ? compactDrawer !== 'activity' : !showLeftActivity}
            inert={(isCompact || isFocusMode ? compactDrawer !== 'activity' : !showLeftActivity) ? true : undefined}
            className={
              isCompact || isFocusMode
                ? `absolute inset-y-0 left-0 z-40 w-80 max-w-[85vw] bg-[#1B1D1F] border-r border-[#F0F0ED]/15 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
                    compactDrawer === 'activity' ? 'translate-x-0' : '-translate-x-full pointer-events-none'
                  }`
                : `shrink-0 h-full transition-all duration-200 overflow-hidden ${
                    showLeftActivity ? 'w-72 2xl:w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none'
                  }`
            }
          >
            {(isCompact || isFocusMode) && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#F0F0ED]/10 bg-[#111213]">
                <div className="flex items-center gap-2">
                  <Compass size={14} className="text-[#292C2F]" />
                  <span className="text-xs font-mono font-bold text-[#F0F0ED]">ChatGPT Planner / Activity</span>
                </div>
                <button
                  onClick={() => setCompactDrawer('none')}
                  className="p-1 rounded text-[#F0F0ED]/60 hover:text-[#F0F0ED] hover:bg-[#F0F0ED]/10 text-xs cursor-pointer"
                  title="Close Drawer"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-hidden h-full">
              <ChatGptActivityPanel
                session={selectedSession}
                onRefresh={loadWorkspaceData}
              />
            </div>
          </div>

          {/* Center Panel: Canonical Shared Conversation or Context Vault or Unified Timeline */}
          <div className="flex-1 h-full min-w-0 flex flex-col overflow-hidden">
            {centerView === 'conversation' ? (
              <SharedConversationPanel
                project={selectedProject}
                session={selectedSession}
                sessionPaths={sessionPaths}
                onRefresh={loadWorkspaceData}
              />
            ) : centerView === 'context' ? (
              <ContextVaultPanel
                project={selectedProject}
                session={selectedSession}
                onRefresh={loadWorkspaceData}
              />
            ) : (
              <UnifiedTimelinePanel
                project={selectedProject}
                session={selectedSession}
                initialTaskId={selectedTimelineTaskId}
                onRefresh={loadWorkspaceData}
                onNavigateToTask={(taskId) => {
                  setSelectedTimelineTaskId(taskId);
                  setCenterView('timeline');
                }}
                onNavigateToContext={() => setCenterView('context')}
                onNavigateToConversation={() => setCenterView('conversation')}
              />
            )}
          </div>

          {/* Right Panel: Antigravity Execution Worker */}
          <div
            aria-hidden={isCompact || isFocusMode ? compactDrawer !== 'execution' : !showRightExecution}
            inert={(isCompact || isFocusMode ? compactDrawer !== 'execution' : !showRightExecution) ? true : undefined}
            className={
              isCompact || isFocusMode
                ? `absolute inset-y-0 right-0 z-40 w-84 max-w-[90vw] bg-[#1B1D1F] border-l border-[#F0F0ED]/15 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
                    compactDrawer === 'execution' ? 'translate-x-0' : 'translate-x-full pointer-events-none'
                  }`
                : `shrink-0 h-full transition-all duration-200 overflow-hidden ${
                    showRightExecution ? 'w-72 2xl:w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none'
                  }`
            }
          >
            {(isCompact || isFocusMode) && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#F0F0ED]/10 bg-[#111213]">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[#E05252]" />
                  <span className="text-xs font-mono font-bold text-[#F0F0ED]">Antigravity Worker / Execution</span>
                </div>
                <button
                  onClick={() => setCompactDrawer('none')}
                  className="p-1 rounded text-[#F0F0ED]/60 hover:text-[#F0F0ED] hover:bg-[#F0F0ED]/10 text-xs cursor-pointer"
                  title="Close Drawer"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-hidden h-full">
              <AntigravityExecutionPanel
                session={selectedSession}
                onRefresh={loadWorkspaceData}
                selectedTaskId={effectiveSelectedTaskId}
                onSelectTaskId={setSelectedTaskId}
                onRegisterApproveHandler={(handler) => {
                  executionApproveHandlerRef.current = handler;
                }}
                scheduleUndoAction={scheduleAction}
                undoAction={undoAction}
                isTaskPending={isTaskPending}
                getPendingAction={getPendingAction}
              />
            </div>
          </div>
        </div>
      </div>

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleCreateProject}
            className="w-full max-w-md bg-[#1B1D1F] border border-[#F0F0ED]/10 rounded-xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-2">
              <FolderGit2 size={18} className="text-[#E05252]" />
              <h3 className="text-sm font-bold text-[#F0F0ED]">Create New Project</h3>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F0F0ED]/70 uppercase">Project Name</label>
              <input
                type="text"
                required
                value={modalProjectName}
                onChange={(e) => setModalProjectName(e.target.value)}
                placeholder="e.g. My Next.js Web App"
                className="w-full bg-[#111213] border border-[#F0F0ED]/10 rounded-lg px-3 py-2 text-xs text-[#F0F0ED] focus:outline-none focus:border-[#292C2F]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F0F0ED]/70 uppercase">Repository Path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={modalRepoPath}
                  onChange={(e) => setModalRepoPath(e.target.value)}
                  placeholder="/home/user/projects/my-app"
                  className="flex-1 bg-[#111213] border border-[#F0F0ED]/10 rounded-lg px-3 py-2 text-xs text-[#F0F0ED] focus:outline-none focus:border-[#292C2F]"
                />
                <button
                  type="button"
                  onClick={handleSelectDirectory}
                  className="px-3 py-2 bg-[#111213] hover:bg-[#292C2F]/30 text-[#F0F0ED] border border-[#F0F0ED]/10 rounded-lg text-xs cursor-pointer"
                >
                  Browse
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewProjectModal(false)}
                className="px-3 py-1.5 rounded-lg bg-[#111213] text-[#F0F0ED]/70 hover:text-[#F0F0ED] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#292C2F] text-[#F0F0ED] font-bold text-xs cursor-pointer"
              >
                Create Project
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Session Modal */}
      {showNewSessionModal && targetProjectForSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={handleCreateSession}
            className="w-full max-w-md bg-[#1B1D1F] border border-[#F0F0ED]/10 rounded-xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-[#E05252]" />
              <h3 className="text-sm font-bold text-[#F0F0ED]">
                New Session in {targetProjectForSession.name}
              </h3>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F0F0ED]/70 uppercase">Session Title</label>
              <input
                type="text"
                required
                value={modalSessionTitle}
                onChange={(e) => setModalSessionTitle(e.target.value)}
                placeholder="e.g. Implement user auth flow"
                className="w-full bg-[#111213] border border-[#F0F0ED]/10 rounded-lg px-3 py-2 text-xs text-[#F0F0ED] focus:outline-none focus:border-[#292C2F]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewSessionModal(false)}
                className="px-3 py-1.5 rounded-lg bg-[#111213] text-[#F0F0ED]/70 hover:text-[#F0F0ED] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#292C2F] text-[#F0F0ED] font-bold text-xs cursor-pointer"
              >
                Create Session
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reliability Diagnostics Modal */}
      <ReliabilityModal
        isOpen={showReliabilityModal}
        onClose={() => setShowReliabilityModal(false)}
      />

      {/* Security Diagnostics & Trust Policy Modal */}
      <SecurityModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        project={selectedProject}
        onProjectUpdated={(updated) => {
          setSelectedProject(updated);
          setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        }}
      />

      {/* Keyboard Shortcuts Reference Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => {
          setShowShortcutsModal(false);
          shortcutsBtnRef.current?.focus();
        }}
      />

      {/* Persistent Floating Undo Notification Banner */}
      <UndoNotificationBanner
        pendingActions={pendingActions}
        onUndo={undoAction}
      />
    </div>
  );
};
