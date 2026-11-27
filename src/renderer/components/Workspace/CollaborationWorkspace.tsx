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

interface CollaborationWorkspaceProps {
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
}

export const CollaborationWorkspace: React.FC<CollaborationWorkspaceProps> = ({
  isFocusMode: externalFocusMode,
  onToggleFocusMode: externalToggleFocusMode,
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
  const [centerView, setCenterView] = useState<'conversation' | 'context' | 'timeline'>('conversation');
  const [selectedTimelineTaskId, setSelectedTimelineTaskId] = useState<string | null>(null);
  const [unresolvedConflictsCount, setUnresolvedConflictsCount] = useState(0);

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
    <div className="flex h-full w-full overflow-hidden bg-[#090B0D] relative">
      {/* Workspace Project Tree: Inline in Wide Mode, Slide-Over Drawer in Compact or Focus Mode */}
      <div
        className={
          isCompact || isFocusMode
            ? `absolute inset-y-0 left-0 z-40 w-72 max-w-[85vw] bg-[#092634] border-r border-[#F9F9F9]/15 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
                compactDrawer === 'projects' ? 'translate-x-0' : '-translate-x-full pointer-events-none'
              }`
            : `shrink-0 h-full transition-all duration-200 overflow-hidden ${
                showProjectTree ? 'w-60 xl:w-64 opacity-100' : 'w-0 opacity-0 pointer-events-none'
              }`
        }
      >
        {(isCompact || isFocusMode) && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#F9F9F9]/10 bg-[#090B0D]">
            <div className="flex items-center gap-2">
              <FolderGit2 size={14} className="text-[#FF6E42]" />
              <span className="text-xs font-mono font-bold text-[#F9F9F9]">Projects & Sessions</span>
            </div>
            <button
              onClick={() => setCompactDrawer('none')}
              className="p-1 rounded text-[#F9F9F9]/60 hover:text-[#F9F9F9] hover:bg-[#F9F9F9]/10 text-xs cursor-pointer"
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
        <div className="px-3 py-2 bg-[#092634] border-b border-[#F9F9F9]/10 flex flex-wrap items-center justify-between gap-2 shrink-0 select-none">
          {/* Left Cluster: Project/Session Context & Tree Toggle */}
          <div className="flex items-center gap-2 min-w-0">
            {/* Title / Identity Badge */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Layers size={15} className="text-[#004E72]" />
              <span className="text-xs font-bold text-[#F9F9F9] uppercase tracking-wider font-mono hidden sm:inline">
                Multi-Agent Workspace
              </span>
            </div>

            {/* Project Tree Toggle Button */}
            <button
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
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border ${
                (isCompact || isFocusMode ? compactDrawer === 'projects' : showProjectTree)
                  ? 'bg-[#004E72] text-[#F9F9F9] border-[#004E72] font-semibold'
                  : 'bg-[#090B0D] text-[#F9F9F9]/70 border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
              }`}
            >
              <FolderGit2 size={13} className="text-[#FF6E42] shrink-0" />
              <span className="truncate max-w-[100px] sm:max-w-[140px]">
                {selectedProject ? selectedProject.name : 'Projects'}
              </span>
              <span className="text-[10px] font-mono px-1 rounded bg-[#090B0D]/60 text-[#F9F9F9]/60 shrink-0">
                {projects.length}
              </span>
            </button>

            {/* Session Breadcrumb */}
            {selectedSession && (
              <div className="flex items-center gap-1 text-xs text-[#F9F9F9]/60 font-mono truncate min-w-0">
                <span>/</span>
                <span className="text-[#FF6E42] font-semibold truncate max-w-[100px] sm:max-w-[160px]">
                  {selectedSession.title}
                </span>
              </div>
            )}
          </div>

          {/* Center Cluster: 3-Way Workspace View Switcher */}
          <div className="flex items-center bg-[#090B0D] p-0.5 rounded-lg border border-[#F9F9F9]/10">
            <button
              onClick={() => setCenterView('conversation')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 cursor-pointer ${
                centerView === 'conversation'
                  ? 'bg-[#004E72] text-[#F9F9F9] font-bold shadow-xs'
                  : 'text-[#F9F9F9]/60 hover:text-[#F9F9F9]'
              }`}
            >
              <span>Conversation</span>
            </button>
            <button
              onClick={() => setCenterView('context')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                centerView === 'context'
                  ? 'bg-[#004E72] text-[#F9F9F9] font-bold shadow-xs'
                  : 'text-[#F9F9F9]/60 hover:text-[#F9F9F9]'
              }`}
            >
              <BookOpen size={12} />
              <span className="hidden xs:inline">Context Vault</span>
              <span className="xs:hidden">Vault</span>
              {unresolvedConflictsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#FF6E42] text-[#090B0D] font-bold">
                  {unresolvedConflictsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setCenterView('timeline')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                centerView === 'timeline'
                  ? 'bg-[#004E72] text-[#F9F9F9] font-bold shadow-xs'
                  : 'text-[#F9F9F9]/60 hover:text-[#F9F9F9]'
              }`}
            >
              <Clock size={12} className={centerView === 'timeline' ? 'text-[#FF6E42]' : ''} />
              <span>Timeline</span>
            </button>
          </div>

          {/* Right Cluster: Work Area Toggles, Focus Mode & Utilities */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Activity Toggle */}
            <button
              onClick={() => {
                if (isCompact || isFocusMode) {
                  setCompactDrawer((prev) => (prev === 'activity' ? 'none' : 'activity'));
                } else {
                  setShowLeftActivity((prev) => !prev);
                }
              }}
              title="Toggle ChatGPT Planner / Activity"
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                (isCompact || isFocusMode ? compactDrawer === 'activity' : showLeftActivity)
                  ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                  : 'bg-[#090B0D] text-[#F9F9F9]/60 border border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
              }`}
            >
              <Compass size={12} />
              <span className="hidden sm:inline">Activity</span>
            </button>

            {/* Execution Toggle */}
            <button
              onClick={() => {
                if (isCompact || isFocusMode) {
                  setCompactDrawer((prev) => (prev === 'execution' ? 'none' : 'execution'));
                } else {
                  setShowRightExecution((prev) => !prev);
                }
              }}
              title="Toggle Antigravity Worker / Execution"
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                (isCompact || isFocusMode ? compactDrawer === 'execution' : showRightExecution)
                  ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                  : 'bg-[#090B0D] text-[#F9F9F9]/60 border border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
              }`}
            >
              <Sparkles size={12} />
              <span className="hidden sm:inline">Execution</span>
            </button>

            {/* Focus Mode Toggle */}
            <button
              onClick={toggleFocusMode}
              title={isFocusMode ? 'Exit Focus Mode' : 'Focus Mode: Maximize Central Workspace'}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                isFocusMode
                  ? 'bg-[#FF6E42] text-[#090B0D] font-bold shadow-xs'
                  : 'bg-[#090B0D] text-[#F9F9F9]/60 border border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
              }`}
            >
              {isFocusMode ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              <span className="hidden md:inline">{isFocusMode ? 'Focus Active' : 'Focus'}</span>
            </button>

            {/* Diagnostic Button */}
            <button
              onClick={() => setShowDiagnostic((v) => !v)}
              title="Toggle Directory Access Diagnostic"
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                showDiagnostic
                  ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                  : 'bg-[#090B0D] text-[#F9F9F9]/60 border border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
              }`}
            >
              <ShieldCheck size={12} />
              <span className="hidden md:inline">Diagnostic</span>
            </button>

            {/* Reliability Modal Button */}
            <button
              onClick={() => setShowReliabilityModal(true)}
              title="Runtime Reliability & Recovery Diagnostics"
              className="p-1.5 rounded text-xs font-medium flex items-center transition-all bg-[#090B0D] text-[#F9F9F9]/80 border border-[#F9F9F9]/10 hover:text-[#F9F9F9] hover:border-[#F9F9F9]/30 cursor-pointer"
            >
              <Wrench size={12} className="text-[#FF6E42]" />
            </button>

            {/* Security Modal Button */}
            <button
              onClick={() => setShowSecurityModal(true)}
              title="Security Boundaries & Threat Policy"
              className="p-1.5 rounded text-xs font-medium flex items-center transition-all bg-[#090B0D] text-[#F9F9F9]/80 border border-[#F9F9F9]/10 hover:text-[#F9F9F9] hover:border-[#F9F9F9]/30 cursor-pointer"
            >
              <ShieldAlert size={12} className="text-[#FF6E42]" />
            </button>

            {/* Refresh Button */}
            <button
              onClick={loadWorkspaceData}
              title="Refresh Workspace Data"
              className="p-1.5 rounded bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9]/70 hover:text-[#F9F9F9] hover:bg-[#004E72]/20 transition-all text-xs cursor-pointer"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {/* Diagnostic Banner if active or warning */}
        {(showDiagnostic || (selectedProject && !selectedProject.repositoryPath)) && (
          <div className="p-3 border-b border-[#F9F9F9]/10 bg-[#090B0D] shrink-0 overflow-x-auto">
            <DirectoryAccessDiagnostic
              project={selectedProject}
              bridgeStatus={bridgeStatus}
            />
          </div>
        )}

        {/* Focus Mode Banner */}
        {isFocusMode && (
          <div className="px-3 py-1.5 bg-[#004E72]/30 border-b border-[#004E72]/40 flex items-center justify-between text-xs text-[#F9F9F9] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#FF6E42] animate-pulse shrink-0" />
              <span className="font-semibold text-xs text-[#F9F9F9] shrink-0">Focus Mode Active</span>
              <span className="text-[#F9F9F9]/60 truncate hidden sm:inline">
                — 100% workspace prioritized for {centerView === 'conversation' ? 'Conversation' : centerView === 'context' ? 'Context Vault' : 'Timeline'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setCompactDrawer(compactDrawer === 'projects' ? 'none' : 'projects')}
                className="px-2 py-0.5 rounded text-[11px] bg-[#092634] hover:bg-[#004E72] text-[#F9F9F9] flex items-center gap-1 cursor-pointer border border-[#F9F9F9]/10"
              >
                <FolderGit2 size={11} className="text-[#FF6E42]" />
                <span>Projects</span>
              </button>
              <button
                onClick={() => setCompactDrawer(compactDrawer === 'activity' ? 'none' : 'activity')}
                className="px-2 py-0.5 rounded text-[11px] bg-[#092634] hover:bg-[#004E72] text-[#F9F9F9] flex items-center gap-1 cursor-pointer border border-[#F9F9F9]/10"
              >
                <Compass size={11} />
                <span>Activity</span>
              </button>
              <button
                onClick={() => setCompactDrawer(compactDrawer === 'execution' ? 'none' : 'execution')}
                className="px-2 py-0.5 rounded text-[11px] bg-[#092634] hover:bg-[#004E72] text-[#F9F9F9] flex items-center gap-1 cursor-pointer border border-[#F9F9F9]/10"
              >
                <Sparkles size={11} />
                <span>Execution</span>
              </button>
              <button
                onClick={toggleFocusMode}
                className="px-2.5 py-0.5 rounded text-[11px] bg-[#FF6E42] text-[#090B0D] font-bold hover:bg-[#FF6E42]/90 flex items-center gap-1 ml-1 cursor-pointer shadow-xs"
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
            className={
              isCompact || isFocusMode
                ? `absolute inset-y-0 left-0 z-40 w-80 max-w-[85vw] bg-[#092634] border-r border-[#F9F9F9]/15 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
                    compactDrawer === 'activity' ? 'translate-x-0' : '-translate-x-full pointer-events-none'
                  }`
                : `shrink-0 h-full transition-all duration-200 overflow-hidden ${
                    showLeftActivity ? 'w-72 2xl:w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none'
                  }`
            }
          >
            {(isCompact || isFocusMode) && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#F9F9F9]/10 bg-[#090B0D]">
                <div className="flex items-center gap-2">
                  <Compass size={14} className="text-[#004E72]" />
                  <span className="text-xs font-mono font-bold text-[#F9F9F9]">ChatGPT Planner / Activity</span>
                </div>
                <button
                  onClick={() => setCompactDrawer('none')}
                  className="p-1 rounded text-[#F9F9F9]/60 hover:text-[#F9F9F9] hover:bg-[#F9F9F9]/10 text-xs cursor-pointer"
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
            className={
              isCompact || isFocusMode
                ? `absolute inset-y-0 right-0 z-40 w-84 max-w-[90vw] bg-[#092634] border-l border-[#F9F9F9]/15 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
                    compactDrawer === 'execution' ? 'translate-x-0' : 'translate-x-full pointer-events-none'
                  }`
                : `shrink-0 h-full transition-all duration-200 overflow-hidden ${
                    showRightExecution ? 'w-72 2xl:w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none'
                  }`
            }
          >
            {(isCompact || isFocusMode) && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#F9F9F9]/10 bg-[#090B0D]">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[#FF6E42]" />
                  <span className="text-xs font-mono font-bold text-[#F9F9F9]">Antigravity Worker / Execution</span>
                </div>
                <button
                  onClick={() => setCompactDrawer('none')}
                  className="p-1 rounded text-[#F9F9F9]/60 hover:text-[#F9F9F9] hover:bg-[#F9F9F9]/10 text-xs cursor-pointer"
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
            className="w-full max-w-md bg-[#092634] border border-[#F9F9F9]/10 rounded-xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-2">
              <FolderGit2 size={18} className="text-[#FF6E42]" />
              <h3 className="text-sm font-bold text-[#F9F9F9]">Create New Project</h3>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Project Name</label>
              <input
                type="text"
                required
                value={modalProjectName}
                onChange={(e) => setModalProjectName(e.target.value)}
                placeholder="e.g. My Next.js Web App"
                className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg px-3 py-2 text-xs text-[#F9F9F9] focus:outline-none focus:border-[#004E72]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Repository Path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={modalRepoPath}
                  onChange={(e) => setModalRepoPath(e.target.value)}
                  placeholder="/home/user/projects/my-app"
                  className="flex-1 bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg px-3 py-2 text-xs text-[#F9F9F9] focus:outline-none focus:border-[#004E72]"
                />
                <button
                  type="button"
                  onClick={handleSelectDirectory}
                  className="px-3 py-2 bg-[#090B0D] hover:bg-[#004E72]/30 text-[#F9F9F9] border border-[#F9F9F9]/10 rounded-lg text-xs cursor-pointer"
                >
                  Browse
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewProjectModal(false)}
                className="px-3 py-1.5 rounded-lg bg-[#090B0D] text-[#F9F9F9]/70 hover:text-[#F9F9F9] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#004E72] text-[#F9F9F9] font-bold text-xs cursor-pointer"
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
            className="w-full max-w-md bg-[#092634] border border-[#F9F9F9]/10 rounded-xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-[#FF6E42]" />
              <h3 className="text-sm font-bold text-[#F9F9F9]">
                New Session in {targetProjectForSession.name}
              </h3>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-mono text-[#F9F9F9]/70 uppercase">Session Title</label>
              <input
                type="text"
                required
                value={modalSessionTitle}
                onChange={(e) => setModalSessionTitle(e.target.value)}
                placeholder="e.g. Implement user auth flow"
                className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-lg px-3 py-2 text-xs text-[#F9F9F9] focus:outline-none focus:border-[#004E72]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewSessionModal(false)}
                className="px-3 py-1.5 rounded-lg bg-[#090B0D] text-[#F9F9F9]/70 hover:text-[#F9F9F9] text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#004E72] text-[#F9F9F9] font-bold text-xs cursor-pointer"
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
    </div>
  );
};
