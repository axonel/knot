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
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090B0D]/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-[#092634] border border-[#004E72] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#F9F9F9]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#004E72]/60 bg-[#090B0D]/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#004E72]/30 text-[#FF6E42]">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F9F9F9]">
                Security Boundaries & Threat Hardening
              </h2>
              <p className="text-xs text-[#F9F9F9]/60">
                Permission model, execution safeguards, and filesystem isolation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchDiagnostics}
              disabled={loading}
              title="Refresh Security Status"
              className="p-1.5 rounded hover:bg-[#004E72]/40 text-[#F9F9F9]/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[#004E72]/40 text-[#F9F9F9]/80 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {error && (
            <div className="p-3 bg-[#FF6E42]/10 border border-[#FF6E42]/50 rounded text-[#FF6E42] flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Project Trust Policy Card */}
          <div className="p-4 bg-[#090B0D]/60 border border-[#004E72]/60 rounded space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-[#FF6E42]" />
                <span className="font-bold text-sm text-[#F9F9F9]">Project Trust Policy</span>
                {project && (
                  <span className="px-2 py-0.5 rounded text-[11px] bg-[#004E72]/40 text-[#F9F9F9]/80 border border-[#004E72]">
                    {project.name}
                  </span>
                )}
              </div>
              <span
                className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                  currentPolicy === 'trusted'
                    ? 'bg-[#FF6E42]/20 text-[#FF6E42] border border-[#FF6E42]/50'
                    : 'bg-[#004E72]/40 text-[#F9F9F9] border border-[#004E72]'
                }`}
              >
                {currentPolicy === 'trusted' ? 'Trusted (Opt-in)' : 'Approval Required (Default)'}
              </span>
            </div>

            <p className="text-[#F9F9F9]/70 leading-relaxed">
              {currentPolicy === 'trusted'
                ? 'Tasks classified as safe will be automatically approved and dispatched. Tasks with sensitive keywords (credentials, filesystem deletion, environment configuration) or ambiguous instructions strictly require manual user approval.'
                : 'All inbound task assignments from ChatGPT require explicit user review and approval before Antigravity execution is allowed. This is the secure, fail-safe default.'}
            </p>

            {showConfirmTrust && (
              <div className="p-3 bg-[#FF6E42]/10 border border-[#FF6E42]/40 rounded space-y-2">
                <div className="flex items-center gap-2 text-[#FF6E42] font-bold">
                  <AlertTriangle size={14} />
                  <span>Confirm Switching to Trusted Mode</span>
                </div>
                <p className="text-[#F9F9F9]/80">
                  Tasks from ChatGPT will automatically execute without manual prompts unless they
                  touch sensitive operations. Ensure you understand the prompts ChatGPT will
                  dispatch.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleTogglePolicy}
                    disabled={updating}
                    className="px-3 py-1 bg-[#FF6E42] hover:bg-[#FF6E42]/90 text-[#090B0D] font-bold rounded text-xs transition-colors"
                  >
                    Confirm & Enable Trusted Mode
                  </button>
                  <button
                    onClick={() => setShowConfirmTrust(false)}
                    className="px-3 py-1 bg-transparent hover:bg-[#004E72]/40 text-[#F9F9F9] rounded text-xs border border-[#004E72] transition-colors"
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
                      ? 'bg-[#004E72]/40 hover:bg-[#004E72] text-[#F9F9F9] border-[#004E72]'
                      : 'bg-[#FF6E42]/20 hover:bg-[#FF6E42]/30 text-[#FF6E42] border-[#FF6E42]/50'
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
            <div className="p-4 bg-[#090B0D]/40 border border-[#004E72]/40 rounded space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#F9F9F9]">
                <FileCode size={14} className="text-[#FF6E42]" />
                <span>Task Authorization & Integrity</span>
              </div>
              <ul className="space-y-1.5 text-[#F9F9F9]/70">
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Deterministic SHA-256 content hashing on all tasks</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Approvals bound to hash; modified tasks invalidate approval</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Retried tasks reset approval state to awaiting approval</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>
                    Pending approvals:{' '}
                    <strong className="text-[#F9F9F9]">
                      {diagnostics?.taskAuthorization.pendingApprovalsCount ?? 0}
                    </strong>
                  </span>
                </li>
              </ul>
            </div>

            {/* Antigravity CLI Permissions */}
            <div className="p-4 bg-[#090B0D]/40 border border-[#004E72]/40 rounded space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#F9F9F9]">
                <ShieldCheck size={14} className="text-[#FF6E42]" />
                <span>Antigravity Process Hardening</span>
              </div>
              <ul className="space-y-1.5 text-[#F9F9F9]/70">
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Native interactive permissions preserved</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Bypass flags (--dangerously-skip-permissions) blocked</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Executable path pinned to validated system binary</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Root (/) and home (~) working directories rejected</span>
                </li>
              </ul>
            </div>

            {/* Filesystem Boundary & Symlink Guards */}
            <div className="p-4 bg-[#090B0D]/40 border border-[#004E72]/40 rounded space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#F9F9F9]">
                <FolderGit2 size={14} className="text-[#FF6E42]" />
                <span>Filesystem Boundary Isolation</span>
              </div>
              <ul className="space-y-1.5 text-[#F9F9F9]/70">
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Enforced repository path boundaries</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Inbox symlinks rejected via lstat before read</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>256 KB message size limit strictly enforced</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Directory traversal outside project root blocked</span>
                </li>
              </ul>
            </div>

            {/* Electron & IPC Boundary */}
            <div className="p-4 bg-[#090B0D]/40 border border-[#004E72]/40 rounded space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#F9F9F9]">
                <Lock size={14} className="text-[#FF6E42]" />
                <span>Electron Renderer & IPC Boundary</span>
              </div>
              <ul className="space-y-1.5 text-[#F9F9F9]/70">
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Context isolation and sandbox enabled</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Node.js integration disabled in renderer</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>IPC sender frame verified on privileged handlers</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[#FF6E42] shrink-0" />
                  <span>Secrets & tokens redacted from SQLite audit logs</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Unauthenticated Bridge Notice */}
          <div className="p-3 bg-[#090B0D]/40 border border-[#004E72]/30 rounded text-[#F9F9F9]/60 leading-relaxed text-[11px]">
            <strong className="text-[#F9F9F9]/90">Bridge Trust Notice:</strong> The filesystem
            bridge operates over local directories. Frontmatter metadata claims (such as{' '}
            <code className="text-[#FF6E42]">sender: chatgpt</code>) reflect transport attribution,
            not cryptographic identity. Knot treats all bridge inbox content as untrusted input and
            enforces local user approval policies accordingly.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-[#004E72]/60 bg-[#090B0D]/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-bold bg-[#004E72] hover:bg-[#004E72]/80 text-[#F9F9F9] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
