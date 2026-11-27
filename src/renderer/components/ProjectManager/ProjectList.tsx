import React, { useState } from 'react';
import type { Project } from '../../../shared/types.js';
import {
  FolderGit2,
  FolderOpen,
  Plus,
  Archive,
  ArchiveRestore,
  ExternalLink,
  Clock,
  Layers,
  X,
  AlertCircle,
} from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  isLoading: boolean;
  onSelectProject: (projectId: string) => void;
  onRefresh: () => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  isLoading,
  onSelectProject,
  onRefresh,
}) => {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [repositoryPath, setRepositoryPath] = useState('');
  const [repositoryRemote, setRepositoryRemote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredProjects = projects.filter((p) => includeArchived || !p.archivedAt);

  const handleSelectDirectory = async () => {
    try {
      const selected = await window.knotApi?.projects.selectDirectory();
      if (selected) {
        setRepositoryPath(selected);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to select directory: ${msg}`);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await window.knotApi?.projects.create({
        name: name.trim(),
        repositoryPath: repositoryPath.trim() || undefined,
        repositoryRemote: repositoryRemote.trim() || undefined,
      });

      setName('');
      setRepositoryPath('');
      setRepositoryRemote('');
      setIsModalOpen(false);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to create project: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleArchive = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    try {
      if (project.archivedAt) {
        await window.knotApi?.projects.unarchive(project.id);
      } else {
        await window.knotApi?.projects.archive(project.id);
      }
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to update project: ${msg}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F0F0ED]/10">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#F0F0ED]">
            Development Projects
          </h2>
          <p className="text-xs text-[#F0F0ED]/60 mt-0.5">
            Coordinate agent sessions, messages, and task history across local repositories.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[#F0F0ED]/70 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-[#F0F0ED]/20 bg-[#111213] text-[#292C2F] focus:ring-0 focus:ring-offset-0"
            />
            <span>Show archived</span>
          </label>

          <button
            onClick={() => {
              setError(null);
              setIsModalOpen(true);
            }}
            data-testid="new-project-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#292C2F] text-[#F0F0ED] hover:bg-[#292C2F]/80 transition-colors shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>New Project</span>
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

      {/* Projects Grid / List */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-[#F0F0ED]/40 font-mono">
          Loading projects...
        </div>
      ) : filteredProjects.length === 0 ? (
        /* Empty State */
        <div className="p-12 text-center rounded-xl border border-dashed border-[#F0F0ED]/10 bg-[#1B1D1F]/30 space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-[#111213] border border-[#F0F0ED]/10 flex items-center justify-center text-[#292C2F]">
            <FolderGit2 size={24} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-[#F0F0ED]">No projects found</h3>
            <p className="text-xs text-[#F0F0ED]/60 max-w-sm mx-auto">
              {includeArchived
                ? 'No projects exist yet. Register your first repository to begin multi-agent coordination.'
                : 'No active projects found. Create a new project or enable "Show archived" above.'}
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#292C2F] text-[#F0F0ED] hover:bg-[#292C2F]/80 transition-colors"
          >
            <Plus size={14} />
            <span>Create First Project</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              className={`group p-4 rounded-xl border transition-all cursor-pointer bg-[#1B1D1F]/60 hover:bg-[#1B1D1F] ${
                project.archivedAt
                  ? 'border-[#F0F0ED]/5 opacity-60'
                  : 'border-[#F0F0ED]/10 hover:border-[#292C2F]/60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#111213] border border-[#F0F0ED]/10 flex items-center justify-center text-[#292C2F] shrink-0 group-hover:border-[#292C2F]/40 transition-colors">
                    <FolderGit2 size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[#F0F0ED] truncate group-hover:text-[#F0F0ED]">
                      {project.name}
                    </h3>
                    {project.archivedAt && (
                      <span className="text-[10px] font-mono text-[#E05252] uppercase tracking-wider">
                        Archived
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => handleToggleArchive(e, project)}
                    title={project.archivedAt ? 'Unarchive Project' : 'Archive Project'}
                    className="p-1.5 rounded-lg text-[#F0F0ED]/40 hover:text-[#F0F0ED] hover:bg-[#111213] transition-colors"
                  >
                    {project.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </button>
                </div>
              </div>

              {/* Path & Remote info */}
              <div className="mt-3 space-y-1.5 text-xs text-[#F0F0ED]/60 font-mono">
                {project.repositoryPath ? (
                  <div className="flex items-center gap-1.5 truncate" title={project.repositoryPath}>
                    <FolderOpen size={12} className="shrink-0 text-[#292C2F]" />
                    <span className="truncate">{project.repositoryPath}</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-[#F0F0ED]/30 italic">No local path set</div>
                )}

                {project.repositoryRemote && (
                  <div className="flex items-center gap-1.5 truncate" title={project.repositoryRemote}>
                    <ExternalLink size={12} className="shrink-0 text-[#E05252]" />
                    <span className="truncate">{project.repositoryRemote}</span>
                  </div>
                )}
              </div>

              {/* Card Footer: Session count & Updated time */}
              <div className="mt-4 pt-3 border-t border-[#F0F0ED]/5 flex items-center justify-between text-[11px] text-[#F0F0ED]/50">
                <div className="flex items-center gap-1.5 font-medium">
                  <Layers size={13} className="text-[#292C2F]" />
                  <span>
                    {project.sessionCount} {project.sessionCount === 1 ? 'session' : 'sessions'}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <Clock size={12} />
                  <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111213]/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-[#1B1D1F] border border-[#F0F0ED]/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F0ED]/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#F0F0ED]">
                <FolderGit2 size={16} className="text-[#292C2F]" />
                <span>New Project</span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#F0F0ED]/40 hover:text-[#F0F0ED] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#F0F0ED]/80 mb-1">
                  Project Name <span className="text-[#E05252]">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. knot or my-project"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED] placeholder:text-[#F0F0ED]/30 focus:border-[#292C2F] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#F0F0ED]/80 mb-1">
                  Local Repository Path
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="/home/user/projects/my-repo"
                    value={repositoryPath}
                    onChange={(e) => setRepositoryPath(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-[#111213] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED] placeholder:text-[#F0F0ED]/30 focus:border-[#292C2F] focus:outline-hidden font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleSelectDirectory}
                    className="px-3 py-2 rounded-lg bg-[#111213] border border-[#F0F0ED]/20 hover:border-[#292C2F] text-xs text-[#F0F0ED]/80 hover:text-[#F0F0ED] transition-colors cursor-pointer"
                  >
                    Browse
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#F0F0ED]/80 mb-1">
                  Remote Repository URL
                </label>
                <input
                  type="text"
                  placeholder="https://github.com/org/repo"
                  value={repositoryRemote}
                  onChange={(e) => setRepositoryRemote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED] placeholder:text-[#F0F0ED]/30 focus:border-[#292C2F] focus:outline-hidden font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F0F0ED]/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#F0F0ED]/70 hover:bg-[#111213] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#292C2F] text-[#F0F0ED] hover:bg-[#292C2F]/80 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                >
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
