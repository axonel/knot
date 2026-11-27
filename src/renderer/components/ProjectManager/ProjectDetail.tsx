import React, { useState, useEffect, useCallback } from 'react';
import type { Project, Session, SessionStatus } from '../../../shared/types.js';
import { StatusPill } from './StatusPill.js';
import {
  ArrowLeft,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  Archive,
  ArchiveRestore,
  Clock,
  FolderOpen,
  ExternalLink,
  MessageSquare,
  AlertCircle,
  X,
} from 'lucide-react';

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
  onSelectSession: (sessionId: string) => void;
  onProjectUpdated: () => void;
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({
  project,
  onBack,
  onSelectSession,
  onProjectUpdated,
}) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await window.knotApi?.sessions.list(project.id, includeArchived);
      setSessions(list || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load sessions: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [project.id, includeArchived]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const defaultTitle = `Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const titleToUse = sessionTitle.trim() || defaultTitle;

    setIsSubmitting(true);
    setError(null);

    try {
      const created = await window.knotApi?.sessions.create({
        projectId: project.id,
        title: titleToUse,
      });

      setSessionTitle('');
      setIsModalOpen(false);
      fetchSessions();
      onProjectUpdated();
      if (created) {
        onSelectSession(created.id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to create session: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusTransition = async (
    e: React.MouseEvent,
    sessionId: string,
    targetStatus: SessionStatus
  ) => {
    e.stopPropagation();
    try {
      await window.knotApi?.sessions.updateStatus(sessionId, targetStatus);
      fetchSessions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`State transition failed: ${msg}`);
    }
  };

  const handleToggleArchiveProject = async () => {
    try {
      if (project.archivedAt) {
        await window.knotApi?.projects.unarchive(project.id);
      } else {
        await window.knotApi?.projects.archive(project.id);
      }
      onProjectUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to update project: ${msg}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Project Header */}
      <div className="space-y-3 pb-5 border-b border-[#F0F0ED]/10">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F0F0ED]/60 hover:text-[#F0F0ED] transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>All Projects</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-[#F0F0ED]">
                {project.name}
              </h2>
              {project.archivedAt && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E05252]/20 border border-[#E05252] text-[#E05252] uppercase tracking-wider">
                  Archived
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#F0F0ED]/60 font-mono">
              {project.repositoryPath && (
                <span className="flex items-center gap-1">
                  <FolderOpen size={13} className="text-[#292C2F]" />
                  <span>{project.repositoryPath}</span>
                </span>
              )}
              {project.repositoryRemote && (
                <span className="flex items-center gap-1">
                  <ExternalLink size={13} className="text-[#E05252]" />
                  <span>{project.repositoryRemote}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleToggleArchiveProject}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#F0F0ED]/10 hover:border-[#F0F0ED]/30 text-xs text-[#F0F0ED]/70 hover:text-[#F0F0ED] transition-colors cursor-pointer"
            >
              {project.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              <span>{project.archivedAt ? 'Unarchive' : 'Archive'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sessions Section Bar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[#F0F0ED]">Agent Sessions</h3>
          <p className="text-xs text-[#F0F0ED]/60">
            Independent execution threads, agent discussions, and task states.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[#F0F0ED]/70 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-[#F0F0ED]/20 bg-[#000000] text-[#292C2F] focus:ring-0 focus:ring-offset-0"
            />
            <span>Show archived</span>
          </label>

          <button
            onClick={() => {
              setError(null);
              setIsModalOpen(true);
            }}
            data-testid="new-session-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#292C2F] text-[#F0F0ED] hover:bg-[#292C2F]/80 transition-colors shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>New Session</span>
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-[#1B1D1F] border border-[#E05252]/50 text-xs text-[#E05252]">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-[#F0F0ED]/40 hover:text-[#F0F0ED] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Sessions List */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-[#F0F0ED]/40 font-mono">
          Loading sessions...
        </div>
      ) : sessions.length === 0 ? (
        /* Empty State */
        <div className="p-10 text-center rounded-xl border border-dashed border-[#F0F0ED]/10 bg-[#1B1D1F]/30 space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full bg-[#000000] border border-[#F0F0ED]/10 flex items-center justify-center text-[#292C2F]">
            <MessageSquare size={20} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-[#F0F0ED]">No sessions yet</h4>
            <p className="text-xs text-[#F0F0ED]/60 max-w-sm mx-auto">
              Create a new session to record conversations, tasks, and telemetry for this project.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#292C2F] text-[#F0F0ED] hover:bg-[#292C2F]/80 transition-colors"
          >
            <Plus size={14} />
            <span>Create Session</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className="group p-4 rounded-xl border border-[#F0F0ED]/10 bg-[#1B1D1F]/60 hover:bg-[#1B1D1F] hover:border-[#292C2F]/50 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2.5">
                  <h4 className="text-sm font-semibold text-[#F0F0ED] truncate group-hover:text-[#F0F0ED]">
                    {session.title}
                  </h4>
                  <StatusPill status={session.status} type="session" />
                </div>

                <div className="flex items-center gap-4 text-xs text-[#F0F0ED]/50 font-mono">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    <span>Last active {new Date(session.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                  <span>Created {new Date(session.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Status Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {session.status === 'active' && (
                  <>
                    <button
                      onClick={(e) => handleStatusTransition(e, session.id, 'paused')}
                      title="Pause Session"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#000000] border border-[#E05252]/40 text-[#E05252] hover:bg-[#E05252]/10 transition-colors cursor-pointer"
                    >
                      <Pause size={12} />
                      <span>Pause</span>
                    </button>
                    <button
                      onClick={(e) => handleStatusTransition(e, session.id, 'completed')}
                      title="Mark Completed"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#000000] border border-[#292C2F] text-[#F0F0ED]/80 hover:bg-[#292C2F]/20 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 size={12} />
                      <span>Complete</span>
                    </button>
                  </>
                )}

                {session.status === 'paused' && (
                  <>
                    <button
                      onClick={(e) => handleStatusTransition(e, session.id, 'active')}
                      title="Resume Session"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#292C2F] text-[#F0F0ED] hover:bg-[#292C2F]/80 transition-colors cursor-pointer"
                    >
                      <Play size={12} />
                      <span>Resume</span>
                    </button>
                    <button
                      onClick={(e) => handleStatusTransition(e, session.id, 'completed')}
                      title="Mark Completed"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#000000] border border-[#292C2F] text-[#F0F0ED]/80 hover:bg-[#292C2F]/20 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 size={12} />
                      <span>Complete</span>
                    </button>
                  </>
                )}

                {session.status === 'completed' && (
                  <>
                    <button
                      onClick={(e) => handleStatusTransition(e, session.id, 'active')}
                      title="Reopen Session"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#000000] border border-[#292C2F] text-[#F0F0ED]/80 hover:bg-[#292C2F]/20 transition-colors cursor-pointer"
                    >
                      <Play size={12} />
                      <span>Reopen</span>
                    </button>
                    <button
                      onClick={(e) => handleStatusTransition(e, session.id, 'archived')}
                      title="Archive Session"
                      className="p-1.5 rounded-lg text-[#F0F0ED]/40 hover:text-[#F0F0ED] hover:bg-[#000000] transition-colors cursor-pointer"
                    >
                      <Archive size={13} />
                    </button>
                  </>
                )}

                {session.status === 'archived' && (
                  <button
                    onClick={(e) => handleStatusTransition(e, session.id, 'active')}
                    title="Unarchive Session"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#000000] border border-[#F0F0ED]/20 text-[#F0F0ED]/80 hover:bg-[#000000]/80 transition-colors cursor-pointer"
                  >
                    <ArchiveRestore size={12} />
                    <span>Unarchive</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Session Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000000]/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-[#1B1D1F] border border-[#F0F0ED]/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#F0F0ED]">
                <MessageSquare size={16} className="text-[#292C2F]" />
                <span>New Agent Session</span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#F0F0ED]/40 hover:text-[#F0F0ED] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSession} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#F0F0ED]/80 mb-1">
                  Session Title
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder={`e.g. Implement SQLite storage (optional)`}
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#000000] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED] placeholder:text-[#F0F0ED]/30 focus:border-[#292C2F] focus:outline-hidden"
                />
                <p className="text-[11px] text-[#F0F0ED]/40 mt-1">
                  Leave empty to generate a default timestamped session title.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F0F0ED]/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#F0F0ED]/70 hover:bg-[#000000] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#292C2F] text-[#F0F0ED] hover:bg-[#292C2F]/80 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  {isSubmitting ? 'Creating...' : 'Create Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
