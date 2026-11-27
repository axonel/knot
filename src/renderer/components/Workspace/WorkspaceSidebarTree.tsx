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
  const seenProjectsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    setExpandedProjects((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const p of projects) {
        if (!seenProjectsRef.current.has(p.id)) {
          seenProjectsRef.current.add(p.id);
          next.add(p.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [projects]);

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
    <div className="flex flex-col h-full bg-[#1B1D1F] border-r border-[#292C2F] p-3 space-y-3 select-none">
      {/* Header & Quick Create */}
      <div className="flex items-center justify-between pb-2 border-b border-[#292C2F]">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#A5A5A0]">
          Projects & Sessions
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreateProject}
            title="Create New Project"
            className="px-2 py-1 rounded bg-[#292C2F] hover:bg-[#E05252] text-[#F0F0ED] transition-all text-xs flex items-center gap-1 cursor-pointer border border-[#292C2F]"
          >
            <Plus size={12} />
            <span className="text-[10px] font-mono pr-0.5">Project</span>
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Collapse Projects Panel"
              className="p-1 rounded text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F] transition-all cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {projects.length === 0 ? (
          <div className="text-center py-6 text-[#A5A5A0]/60 text-xs">
            <p>No projects yet.</p>
            <button
              onClick={onCreateProject}
              className="mt-2 px-2.5 py-1 rounded bg-[#292C2F] hover:bg-[#E05252] text-[#F0F0ED] text-xs font-medium border border-[#292C2F] transition-colors"
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
                      ? 'bg-[#292C2F] text-[#F0F0ED] border border-[#292C2F]'
                      : 'text-[#A5A5A0] hover:bg-[#292C2F]/50 hover:text-[#F0F0ED]'
                  }`}
                  onClick={() => toggleExpand(project.id)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-[#E05252] shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-[#A5A5A0]/60 shrink-0" />
                    )}
                    <FolderGit2 size={14} className="text-[#E05252] shrink-0" />
                    <span className="truncate">{project.name}</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateSession(project);
                    }}
                    title="Add session to project"
                    className="p-1 rounded hover:bg-[#000000] text-[#A5A5A0] hover:text-[#F0F0ED] transition-all"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {/* Sessions Sub-Tree */}
                {isExpanded && (
                  <div className="pl-4 space-y-0.5 border-l border-[#292C2F] ml-2">
                    {sessions.length === 0 ? (
                      <div className="py-1 px-2 text-[10px] text-[#A5A5A0]/50 italic">
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
                                ? 'bg-[#292C2F] text-[#F0F0ED] font-semibold border-l-2 border-[#E05252]'
                                : 'text-[#A5A5A0] hover:bg-[#292C2F]/40 hover:text-[#F0F0ED]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <MessageSquare size={12} className="shrink-0 text-current opacity-70" />
                              <span className="truncate">{session.title}</span>
                            </div>

                            {pendingTasks.length > 0 && (
                              <span
                                title={`${pendingTasks.length} pending task(s)`}
                                className={`inline-flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded-full font-bold ${
                                  isSessionSelected
                                    ? 'bg-[#E05252] text-[#F0F0ED]'
                                    : 'bg-[#E05252]/20 text-[#E05252] border border-[#E05252]/40'
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
