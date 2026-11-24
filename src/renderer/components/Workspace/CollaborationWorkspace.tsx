import React, { useState, useEffect } from 'react';
import {
  Layers,
  Compass,
  Sparkles,
  ShieldCheck,
  Plus,
  RefreshCw,
  FolderGit2,
  BookOpen,
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

export const CollaborationWorkspace: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessionsByProject, setSessionsByProject] = useState<Map<string, Session[]>>(new Map());
  const [tasksBySession, setTasksBySession] = useState<Map<string, Task[]>>(new Map());
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionPaths, setSessionPaths] = useState<SessionBridgePaths | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatusInfo | null>(null);

  // Panel display toggles
  const [showLeftActivity, setShowLeftActivity] = useState(true);
  const [showRightExecution, setShowRightExecution] = useState(true);
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  // View state: conversation vs context vault
  const [centerView, setCenterView] = useState<'conversation' | 'context'>('conversation');
  const [unresolvedConflictsCount, setUnresolvedConflictsCount] = useState(0);

  // Modals
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [modalProjectName, setModalProjectName] = useState('');
  const [modalRepoPath, setModalRepoPath] = useState('');
  const [modalSessionTitle, setModalSessionTitle] = useState('');
  const [targetProjectForSession, setTargetProjectForSession] = useState<Project | null>(null);

  const loadWorkspace = async () => {
    if (!window.knotApi) return;
    try {
      const projList = await window.knotApi.projects.list();
      setProjects(projList);

      const sMap = new Map<string, Session[]>();
      const tMap = new Map<string, Task[]>();

      for (const p of projList) {
        const sList = await window.knotApi.sessions.list(p.id);
        sMap.set(p.id, sList);

        for (const s of sList) {
          const tList = await window.knotApi.orchestration.listTasks(s.id);
          tMap.set(s.id, tList);
        }
      }

      setSessionsByProject(sMap);
      setTasksBySession(tMap);

      // Check unresolved conflicts for selected project
      const targetP = selectedProject || (projList.length > 0 ? projList[0] : null);
      if (targetP && window.knotApi.context) {
        const conflicts = await window.knotApi.context.listConflicts(targetP.id, true);
        setUnresolvedConflictsCount(conflicts.length);
      }

      // Restore or auto-select active project and session
      if (!selectedProject && projList.length > 0) {
        const firstP = projList[0];
        setSelectedProject(firstP);
        const sessions = sMap.get(firstP.id) || [];
        if (sessions.length > 0) {
          selectSession(firstP, sessions[0]);
        }
      }

      const status = await window.knotApi.bridge.getStatus();
      setBridgeStatus(status);
    } catch (err) {
      console.error('[CollaborationWorkspace] Failed to load workspace:', err);
    }
  };

  const selectSession = async (project: Project, session: Session) => {
    if (!window.knotApi) return;
    setSelectedProject(project);
    setSelectedSession(session);

    try {
      const paths = await window.knotApi.bridge.initSessionBridge(project.id, session.id);
      setSessionPaths(paths);
      const status = await window.knotApi.bridge.getStatus(session.id);
      setBridgeStatus(status);
    } catch (err) {
      console.error('[CollaborationWorkspace] Error initializing session bridge:', err);
    }
  };

  useEffect(() => {
    loadWorkspace();

    if (!window.knotApi) return;

    const unBridge = window.knotApi.bridge.onEvent((evt) => {
      if (evt.type === 'workspace-ready' || evt.type === 'workspace-index-updated') {
        loadWorkspace();
      }
    });

    const unOrch = window.knotApi.orchestration.onEvent(() => {
      loadWorkspace();
    });

    return () => {
      unBridge();
      unOrch();
    };
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalProjectName.trim() || !window.knotApi) return;

    try {
      const created = await window.knotApi.projects.create({
        name: modalProjectName.trim(),
        repositoryPath: modalRepoPath.trim() || undefined,
      });

      // Also create an initial session
      const s = await window.knotApi.sessions.create({
        projectId: created.id,
        title: 'Initial Session',
      });

      setShowNewProjectModal(false);
      setModalProjectName('');
      setModalRepoPath('');
      await loadWorkspace();
      selectSession(created, s);
    } catch (err) {
      console.error('[CollaborationWorkspace] Failed to create project:', err);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProjectForSession || !modalSessionTitle.trim() || !window.knotApi) return;

    try {
      const created = await window.knotApi.sessions.create({
        projectId: targetProjectForSession.id,
        title: modalSessionTitle.trim(),
      });

      setShowNewSessionModal(false);
      setModalSessionTitle('');
      await loadWorkspace();
      selectSession(targetProjectForSession, created);
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
    <div className="flex h-full w-full overflow-hidden bg-[#090B0D]">
      {/* Mini Workspace Tree Sidebar */}
      <div className="w-64 shrink-0 h-full">
        <WorkspaceSidebarTree
          projects={projects}
          sessionsByProject={sessionsByProject}
          tasksBySession={tasksBySession}
          selectedProjectId={selectedProject?.id || null}
          selectedSessionId={selectedSession?.id || null}
          onSelectSession={selectSession}
          onCreateProject={() => setShowNewProjectModal(true)}
          onCreateSession={(p) => {
            setTargetProjectForSession(p);
            setShowNewSessionModal(true);
          }}
        />
      </div>

      {/* Main Workspace Panels Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Workspace Toolbar Header */}
        <div className="px-4 py-2.5 bg-[#092634] border-b border-[#F9F9F9]/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-[#004E72]" />
              <span className="text-xs font-bold text-[#F9F9F9] uppercase tracking-wider font-mono">
                Multi-Agent Workspace
              </span>
            </div>

            {selectedProject && (
              <div className="flex items-center gap-1.5 text-xs text-[#F9F9F9]/60 font-mono truncate">
                <span>/</span>
                <span className="text-[#F9F9F9] font-semibold truncate">{selectedProject.name}</span>
                {selectedSession && (
                  <>
                    <span>/</span>
                    <span className="text-[#FF6E42] font-semibold truncate">{selectedSession.title}</span>
                  </>
                )}
              </div>
            )}

            {/* View Switcher: Conversation vs Context Vault */}
            <div className="flex items-center bg-[#090B0D] p-0.5 rounded-lg border border-[#F9F9F9]/10 ml-2">
              <button
                onClick={() => setCenterView('conversation')}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                  centerView === 'conversation'
                    ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                    : 'text-[#F9F9F9]/60 hover:text-[#F9F9F9]'
                }`}
              >
                Conversation
              </button>
              <button
                onClick={() => setCenterView('context')}
                className={`px-3 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                  centerView === 'context'
                    ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                    : 'text-[#F9F9F9]/60 hover:text-[#F9F9F9]'
                }`}
              >
                <BookOpen size={12} />
                <span>Context Vault</span>
                {unresolvedConflictsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#FF6E42] text-[#090B0D] font-bold">
                    {unresolvedConflictsCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Panel Toggle Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowDiagnostic((v) => !v)}
              title="Toggle Directory Access Diagnostic"
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all ${
                showDiagnostic
                  ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                  : 'bg-[#090B0D] text-[#F9F9F9]/60 border border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
              }`}
            >
              <ShieldCheck size={12} />
              <span className="hidden sm:inline">Diagnostic</span>
            </button>

            <button
              onClick={() => setShowLeftActivity((v) => !v)}
              title="Toggle ChatGPT Activity Panel"
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all ${
                showLeftActivity
                  ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                  : 'bg-[#090B0D] text-[#F9F9F9]/60 border border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
              }`}
            >
              <Compass size={12} />
              <span className="hidden md:inline">Activity</span>
            </button>

            <button
              onClick={() => setShowRightExecution((v) => !v)}
              title="Toggle Antigravity Execution Panel"
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 transition-all ${
                showRightExecution
                  ? 'bg-[#004E72] text-[#F9F9F9] font-bold'
                  : 'bg-[#090B0D] text-[#F9F9F9]/60 border border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
              }`}
            >
              <Sparkles size={12} />
              <span className="hidden md:inline">Execution</span>
            </button>

            <button
              onClick={loadWorkspace}
              title="Refresh Workspace Data"
              className="p-1.5 rounded bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9]/70 hover:text-[#F9F9F9] hover:bg-[#004E72]/20 transition-all text-xs"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {/* Diagnostic Banner if active or warning */}
        {(showDiagnostic || (selectedProject && !selectedProject.repositoryPath)) && (
          <div className="p-3 border-b border-[#F9F9F9]/10 bg-[#090B0D] shrink-0">
            <DirectoryAccessDiagnostic
              project={selectedProject}
              bridgeStatus={bridgeStatus}
            />
          </div>
        )}

        {/* 3 Panels Row */}
        <div className="flex-1 flex overflow-hidden p-3 gap-3">
          {/* Left Panel: ChatGPT Activity */}
          {showLeftActivity && (
            <div className="w-80 shrink-0 h-full">
              <ChatGptActivityPanel
                session={selectedSession}
                onRefresh={loadWorkspace}
              />
            </div>
          )}

          {/* Center Panel: Canonical Shared Conversation or Context Vault */}
          <div className="flex-1 h-full min-w-0">
            {centerView === 'conversation' ? (
              <SharedConversationPanel
                project={selectedProject}
                session={selectedSession}
                sessionPaths={sessionPaths}
                onRefresh={loadWorkspace}
              />
            ) : (
              <ContextVaultPanel
                project={selectedProject}
                session={selectedSession}
                onRefresh={loadWorkspace}
              />
            )}
          </div>

          {/* Right Panel: Antigravity Execution Worker */}
          {showRightExecution && (
            <div className="w-80 shrink-0 h-full">
              <AntigravityExecutionPanel
                session={selectedSession}
                onRefresh={loadWorkspace}
              />
            </div>
          )}
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
                  className="px-3 py-2 bg-[#090B0D] hover:bg-[#004E72]/30 text-[#F9F9F9] border border-[#F9F9F9]/10 rounded-lg text-xs"
                >
                  Browse
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewProjectModal(false)}
                className="px-3 py-1.5 rounded-lg bg-[#090B0D] text-[#F9F9F9]/70 hover:text-[#F9F9F9] text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#004E72] text-[#F9F9F9] font-bold text-xs"
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
                className="px-3 py-1.5 rounded-lg bg-[#090B0D] text-[#F9F9F9]/70 hover:text-[#F9F9F9] text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#004E72] text-[#F9F9F9] font-bold text-xs"
              >
                Create Session
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
