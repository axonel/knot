import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Lock,
  FileCode,
  CheckCircle,
  RefreshCw,
  FolderGit2,
} from 'lucide-react';
import type { SecurityDiagnostics, Project, ProjectTrustPolicy } from '../../../shared/types.js';

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  onProjectUpdated?: (project: Project) => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  onClose,
  project,
  onProjectUpdated,
}) => {
  const [diagnostics, setDiagnostics] = useState<SecurityDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmTrust, setShowConfirmTrust] = useState(false);

  const fetchDiagnostics = useCallback(async () => {
    if (!window.knotApi?.security) return;
    setLoading(true);
    setError(null);
    try {
      const data = await window.knotApi.security.getDiagnostics(project?.id);
      setDiagnostics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    if (isOpen) {
      fetchDiagnostics();
      setShowConfirmTrust(false);
    }
  }, [isOpen, fetchDiagnostics]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentPolicy: ProjectTrustPolicy =
    project?.trustPolicy || diagnostics?.projectTrust.trustPolicy || 'approval_required';

  const handleTogglePolicy = async () => {
    if (!project || !window.knotApi?.projects?.updateTrustPolicy) return;
    const nextPolicy: ProjectTrustPolicy =
      currentPolicy === 'trusted' ? 'approval_required' : 'trusted';

    if (nextPolicy === 'trusted' && !showConfirmTrust) {
      setShowConfirmTrust(true);
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      const updated = await window.knotApi.projects.updateTrustPolicy(project.id, nextPolicy);
      if (onProjectUpdated) {
        onProjectUpdated(updated);
      }
      setShowConfirmTrust(false);
      await fetchDiagnostics();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111213]/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-[#1B1D1F] border border-[#292C2F] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#F0F0ED]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#292C2F]/60 bg-[#111213]/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#292C2F]/30 text-[#E05252]">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F0F0ED]">
                Security Boundaries & Threat Hardening
              </h2>
              <p className="text-xs text-[#F0F0ED]/60">
                Permission model, execution safeguards, and filesystem isolation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchDiagnostics}
              disabled={loading}
              title="Refresh Security Status"
              className="p-1.5 rounded hover:bg-[#292C2F]/40 text-[#F0F0ED]/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[#292C2F]/40 text-[#F0F0ED]/80 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {error && (
            <div className="p-3 bg-[#E05252]/10 border border-[#E05252]/50 rounded text-[#E05252] flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Project Trust Policy Card */}
          <div className="p-4 bg-[#111213]/60 border border-[#292C2F]/60 rounded space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-[#E05252]" />
                <span className="font-bold text-sm text-[#F0F0ED]">Project Trust Policy</span>
                {project && (
                  <span className="px-2 py-0.5 rounded text-[11px] bg-[#292C2F]/40 text-[#F0F0ED]/80 border border-[#292C2F]">
                    {project.name}
                  </span>
                )}
              </div>
              <span
                className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                  currentPolicy === 'trusted'
                    ? 'bg-[#E05252]/20 text-[#E05252] border border-[#E05252]/50'
                    : 'bg-[#292C2F]/40 text-[#F0F0ED] border border-[#292C2F]'
                }`}
              >
                {currentPolicy === 'trusted' ? 'Trusted (Opt-in)' : 'Approval Required (Default)'}
              </span>
            </div>

            <p className="text-[#F0F0ED]/70 leading-relaxed">
              {currentPolicy === 'trusted'
                ? 'Tasks classified as safe will be automatically approved and dispatched. Tasks with sensitive keywords (credentials, filesystem deletion, environment configuration) or ambiguous instructions strictly require manual user approval.'
                : 'All inbound task assignments from ChatGPT require explicit user review and approval before Antigravity execution is allowed. This is the secure, fail-safe default.'}
            </p>

            {showConfirmTrust && (
              <div className="p-3 bg-[#E05252]/10 border border-[#E05252]/40 rounded space-y-2">
                <div className="flex items-center gap-2 text-[#E05252] font-bold">
                  <AlertTriangle size={14} />
                  <span>Confirm Switching to Trusted Mode</span>
                </div>
                <p className="text-[#F0F0ED]/80">
                  Tasks from ChatGPT will automatically execute without manual prompts unless they
                  touch sensitive operations. Ensure you understand the prompts ChatGPT will
                  dispatch.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleTogglePolicy}
                    disabled={updating}
                    className="px-3 py-1 bg-[#E05252] hover:bg-[#E05252]/90 text-[#111213] font-bold rounded text-xs transition-colors"
                  >
                    Confirm & Enable Trusted Mode
                  </button>
                  <button
                    onClick={() => setShowConfirmTrust(false)}
                    className="px-3 py-1 bg-transparent hover:bg-[#292C2F]/40 text-[#F0F0ED] rounded text-xs border border-[#292C2F] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!showConfirmTrust && project && (
              <div className="pt-1">
                <button
                  onClick={handleTogglePolicy}
                  disabled={updating}
                  className={`px-3 py-1.5 rounded font-medium text-xs transition-colors border ${
                    currentPolicy === 'trusted'
                      ? 'bg-[#292C2F]/40 hover:bg-[#292C2F] text-[#F0F0ED] border-[#292C2F]'
                      : 'bg-[#E05252]/20 hover:bg-[#E05252]/30 text-[#E05252] border-[#E05252]/50'
                  }`}
                >
                  {currentPolicy === 'trusted'
                    ? 'Switch to Approval Required (Recommended)'
                    : 'Switch to Trusted Mode...'}
                </button>
              </div>
            )}
          </div>

          {/* Grid of Safeguards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Task Authorization & Content Hash Binding */}
            <div className="p-4 bg-[#111213]/40 border border-[#292C2F]/40 rounded space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#F0F0ED]">
                <FileCode size={14} className="text-[#E05252]" />
                <span>Task Authorization & Integrity</span>
              </div>
              <ul className="space-y-1.5 text-[#F0F0ED]/70">
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Deterministic SHA-256 content hashing on all tasks</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Approvals bound to hash; modified tasks invalidate approval</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Retried tasks reset approval state to awaiting approval</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>
                    Pending approvals:{' '}
                    <strong className="text-[#F0F0ED]">
                      {diagnostics?.taskAuthorization.pendingApprovalsCount ?? 0}
                    </strong>
                  </span>
                </li>
              </ul>
            </div>

            {/* Antigravity CLI Permissions */}
            <div className="p-4 bg-[#111213]/40 border border-[#292C2F]/40 rounded space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#F0F0ED]">
                <ShieldCheck size={14} className="text-[#E05252]" />
                <span>Antigravity Process Hardening</span>
              </div>
              <ul className="space-y-1.5 text-[#F0F0ED]/70">
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Native interactive permissions preserved</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Bypass flags (--dangerously-skip-permissions) blocked</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Executable path pinned to validated system binary</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Root (/) and home (~) working directories rejected</span>
                </li>
              </ul>
            </div>

            {/* Filesystem Boundary & Symlink Guards */}
            <div className="p-4 bg-[#111213]/40 border border-[#292C2F]/40 rounded space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#F0F0ED]">
                <FolderGit2 size={14} className="text-[#E05252]" />
                <span>Filesystem Boundary Isolation</span>
              </div>
              <ul className="space-y-1.5 text-[#F0F0ED]/70">
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Enforced repository path boundaries</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Inbox symlinks rejected via lstat before read</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>256 KB message size limit strictly enforced</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Directory traversal outside project root blocked</span>
                </li>
              </ul>
            </div>

            {/* Electron & IPC Boundary */}
            <div className="p-4 bg-[#111213]/40 border border-[#292C2F]/40 rounded space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#F0F0ED]">
                <Lock size={14} className="text-[#E05252]" />
                <span>Electron Renderer & IPC Boundary</span>
              </div>
              <ul className="space-y-1.5 text-[#F0F0ED]/70">
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Context isolation and sandbox enabled</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Node.js integration disabled in renderer</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>IPC sender frame verified on privileged handlers</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#E05252] shrink-0" />
                  <span>Secrets & tokens redacted from SQLite audit logs</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Unauthenticated Bridge Notice */}
          <div className="p-3 bg-[#111213]/40 border border-[#292C2F]/30 rounded text-[#F0F0ED]/60 leading-relaxed text-[11px]">
            <strong className="text-[#F0F0ED]/90">Bridge Trust Notice:</strong> The filesystem
            bridge operates over local directories. Frontmatter metadata claims (such as{' '}
            <code className="text-[#E05252]">sender: chatgpt</code>) reflect transport attribution,
            not cryptographic identity. Knot treats all bridge inbox content as untrusted input and
            enforces local user approval policies accordingly.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-[#292C2F]/60 bg-[#111213]/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-bold bg-[#292C2F] hover:bg-[#292C2F]/80 text-[#F0F0ED] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
