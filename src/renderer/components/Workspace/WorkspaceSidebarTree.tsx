import React, { useState } from 'react';
import {
  FolderGit2,
  MessageSquare,
  Plus,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ListTodo,
} from 'lucide-react';
import type { Project, Session, Task } from '../../../shared/types.js';

interface WorkspaceSidebarTreeProps {
  projects: Project[];
  sessionsByProject: Map<string, Session[]>;
  tasksBySession: Map<string, Task[]>;
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  onSelectSession: (project: Project, session: Session) => void;
  onCreateProject: () => void;
  onCreateSession: (project: Project) => void;
  onCollapse?: () => void;
}

export const WorkspaceSidebarTree: React.FC<WorkspaceSidebarTreeProps> = ({
  projects,
  sessionsByProject,
  tasksBySession,
  selectedProjectId,
  selectedSessionId,
  onSelectSession,
  onCreateProject,
  onCreateSession,
  onCollapse,
}) => {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(projects.map((p) => p.id))
  );

  const toggleExpand = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#092634] border-r border-[#F9F9F9]/10 p-3 space-y-3 select-none">
      {/* Header & Quick Create */}
      <div className="flex items-center justify-between pb-2 border-b border-[#F9F9F9]/10">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#F9F9F9]/60">
          Projects & Sessions
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreateProject}
            title="Create New Project"
            className="p-1 rounded bg-[#004E72] hover:bg-[#004E72]/80 text-[#F9F9F9] transition-all text-xs flex items-center gap-1 cursor-pointer"
          >
            <Plus size={12} />
            <span className="text-[10px] pr-0.5">Project</span>
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Collapse Projects Panel"
              className="p-1 rounded text-[#F9F9F9]/50 hover:text-[#F9F9F9] hover:bg-[#090B0D]/50 transition-all cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {projects.length === 0 ? (
          <div className="text-center py-6 text-[#F9F9F9]/40 text-xs">
            <p>No projects yet.</p>
            <button
              onClick={onCreateProject}
              className="mt-2 px-2.5 py-1 rounded bg-[#004E72] text-[#F9F9F9] text-xs font-medium"
            >
              Create First Project
            </button>
          </div>
        ) : (
          projects.map((project) => {
            const isExpanded = expandedProjects.has(project.id);
            const isSelected = selectedProjectId === project.id;
            const sessions = sessionsByProject.get(project.id) || [];

            return (
              <div key={project.id} className="space-y-1">
                {/* Project Item */}
                <div
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#004E72]/40 text-[#F9F9F9] border border-[#004E72]'
                      : 'text-[#F9F9F9]/80 hover:bg-[#090B0D]/50 hover:text-[#F9F9F9]'
                  }`}
                  onClick={() => toggleExpand(project.id)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-[#FF6E42] shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-[#F9F9F9]/40 shrink-0" />
                    )}
                    <FolderGit2 size={14} className="text-[#FF6E42] shrink-0" />
                    <span className="truncate">{project.name}</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateSession(project);
                    }}
                    title="Add session to project"
                    className="p-1 rounded hover:bg-[#004E72] text-[#F9F9F9]/60 hover:text-[#F9F9F9] transition-all"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {/* Sessions Sub-Tree */}
                {isExpanded && (
                  <div className="pl-4 space-y-0.5 border-l border-[#F9F9F9]/10 ml-2">
                    {sessions.length === 0 ? (
                      <div className="py-1 px-2 text-[10px] text-[#F9F9F9]/40 italic">
                        No sessions yet.
                      </div>
                    ) : (
                      sessions.map((session) => {
                        const isSessionSelected = selectedSessionId === session.id;
                        const tasks = tasksBySession.get(session.id) || [];
                        const pendingTasks = tasks.filter((t) =>
                          ['queued', 'awaiting_approval', 'running'].includes(t.status)
                        );

                        return (
                          <div
                            key={session.id}
                            onClick={() => onSelectSession(project, session)}
                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                              isSessionSelected
                                ? 'bg-[#004E72] text-[#F9F9F9] font-semibold'
                                : 'text-[#F9F9F9]/70 hover:bg-[#090B0D]/40 hover:text-[#F9F9F9]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <MessageSquare size={12} className="shrink-0 text-current opacity-70" />
                              <span className="truncate">{session.title}</span>
                            </div>

                            {pendingTasks.length > 0 && (
                              <span
                                title={`${pendingTasks.length} pending task(s)`}
                                className={`inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                                  isSessionSelected
                                    ? 'bg-[#FF6E42] text-[#F9F9F9]'
                                    : 'bg-[#FF6E42]/20 text-[#FF6E42] border border-[#FF6E42]/40'
                                }`}
                              >
                                <ListTodo size={9} />
                                {pendingTasks.length}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
