import React, { useEffect, useRef } from 'react';
import { AlertOctagon, X, ShieldAlert, Cpu, Hash, Activity, Terminal } from 'lucide-react';

export interface ProcessDetails {
  name: string; // e.g. 'Desktop Commander' | 'Antigravity Worker'
  processType: 'desktop_commander' | 'antigravity';
  state: string; // e.g. 'Running' | 'Thinking' | 'Starting' | 'Ready'
  pid?: number | null;
  activeSessionId?: string | null;
}

export interface StopProcessModalProps {
  isOpen: boolean;
  processDetails: ProcessDetails | null;
  isStopping?: boolean;
  onConfirmStop: () => Promise<void> | void;
  onCancel: () => void;
}

export const StopProcessModal: React.FC<StopProcessModalProps> = ({
  isOpen,
  processDetails,
  isStopping = false,
  onConfirmStop,
  onCancel,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Focus restoration & initial focus on CANCEL (safety default)
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        cancelBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else if (previousActiveElementRef.current) {
      previousActiveElementRef.current.focus();
      previousActiveElementRef.current = null;
    }
  }, [isOpen]);

  // Escape key closes modal safely without stopping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isStopping) {
        e.stopPropagation();
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isStopping, onCancel]);

  if (!isOpen || !processDetails) return null;

  const isDesktopCommander = processDetails.processType === 'desktop_commander';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stop-process-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 select-none animate-in fade-in duration-150"
      onClick={() => {
        if (!isStopping) onCancel();
      }}
    >
      <div
        className="w-full max-w-xl flex flex-col rounded-xl bg-[#1B1D1F] border border-[#F0F0ED]/15 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#000000] border-b border-[#F0F0ED]/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-rose-950/60 text-rose-400 border border-rose-800">
              <AlertOctagon size={16} />
            </div>
            <div>
              <h2 id="stop-process-modal-title" className="text-xs font-bold font-mono tracking-wider uppercase text-[#F0F0ED]">
                Confirm Process Termination
              </h2>
              <p className="text-[11px] text-[#F0F0ED]/60 font-mono">
                Operating System process lifecycle control &bull; Omarchy Linux
              </p>
            </div>
          </div>

          <button
            onClick={onCancel}
            disabled={isStopping}
            aria-label="Cancel process termination"
            title="Cancel (Esc)"
            className="p-1.5 rounded-lg text-[#F0F0ED]/60 hover:text-[#F0F0ED] hover:bg-[#F0F0ED]/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] cursor-pointer disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Target Process Identification */}
          <div className="p-3 rounded-lg bg-[#000000] border border-[#F0F0ED]/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu size={14} className="text-[#E05252]" />
                <span className="font-bold text-[#F0F0ED] text-sm">
                  {processDetails.name}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[#292C2F]/40 text-[#F0F0ED] border border-[#292C2F]">
                {processDetails.state}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[#F0F0ED]/70 pt-1 border-t border-[#F0F0ED]/5">
              <div className="flex items-center gap-1.5">
                <Hash size={12} className="text-[#F0F0ED]/40" />
                <span>PID: {processDetails.pid ?? 'Unavailable (Child/Spawned)'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity size={12} className="text-[#F0F0ED]/40" />
                <span>Lifecycle: Dedicated Subprocess</span>
              </div>
            </div>
          </div>

          {/* Explicit Distinction: Stop vs Restart */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-amber-200">
            <ShieldAlert size={15} className="shrink-0 mt-0.5 text-amber-400" />
            <div className="space-y-1">
              <span className="font-bold block text-[11px] tracking-wide uppercase font-mono text-amber-300">
                Explicit Stop Operation &bull; No Automatic Restart
              </span>
              <p className="text-[11px] text-[#F0F0ED]/80 leading-relaxed">
                This will shut down {processDetails.name}. Knot will not automatically restart the process.
                You must manually click Start to re-initialize it.
              </p>
            </div>
          </div>

          {/* Graceful Termination & Escalation Strategy */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#E05252] flex items-center gap-1.5">
              <Terminal size={12} />
              <span>Termination & Escalation Policy</span>
            </span>

            <div className="p-3 rounded-lg bg-[#000000]/80 border border-[#F0F0ED]/10 space-y-2 text-[11px] text-[#F0F0ED]/70 leading-relaxed font-mono">
              <p>
                <strong className="text-[#F0F0ED]">1. Graceful Phase:</strong> Knot sends a standard OS <code className="text-[#E05252]">SIGINT</code>/<code className="text-[#E05252]">SIGTERM</code> signal, allowing buffers to flush and file descriptors to close cleanly.
              </p>
              <p>
                <strong className="text-[#F0F0ED]">2. Timeout Escalation:</strong> If the process does not terminate within the 3.0s grace timeout, Knot automatically escalates to <code className="text-rose-400">SIGKILL</code> to prevent orphaned background processes.
              </p>
            </div>
          </div>

          {/* Operational Impact */}
          <div className="space-y-1.5 text-[11px] text-[#F0F0ED]/70">
            <span className="font-bold font-mono text-[10px] uppercase text-[#F0F0ED]/50 tracking-wider">
              Potential Effects on Active Connections & Tasks:
            </span>
            <ul className="space-y-1 list-disc list-inside text-[#F0F0ED]/80 pl-1">
              {isDesktopCommander ? (
                <>
                  <li>Active MCP client connections from external AI assistants will be terminated.</li>
                  <li>Inbound and outbound filesystem mailbox watchers will be suspended.</li>
                </>
              ) : (
                <>
                  <li>Active task execution in this session will be immediately interrupted.</li>
                  <li>The active task will transition to <code className="text-amber-400">interrupted</code> status in the SQLite database and Timeline.</li>
                  <li>Uncommitted tool edits or active subprocess streams may be abandoned.</li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-[#000000] border-t border-[#F0F0ED]/10 flex items-center justify-between shrink-0">
          <span className="text-[10px] font-mono text-[#F0F0ED]/50">
            Press <kbd className="px-1 py-0.5 rounded bg-[#1B1D1F] text-[#F0F0ED]/80 border border-[#F0F0ED]/20">Esc</kbd> to cancel
          </span>

          <div className="flex items-center gap-2">
            {/* Cancel Button has initial focus for safety */}
            <button
              ref={cancelBtnRef}
              onClick={onCancel}
              disabled={isStopping}
              data-testid="cancel-stop-btn"
              className="px-4 py-2 rounded-lg bg-[#1B1D1F] hover:bg-[#1B1D1F]/80 text-[#F0F0ED] text-xs font-semibold border border-[#F0F0ED]/15 hover:border-[#F0F0ED]/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] cursor-pointer"
            >
              Cancel &bull; Keep Running
            </button>

            {/* Confirm Stop Button */}
            <button
              onClick={() => onConfirmStop()}
              disabled={isStopping}
              data-testid="confirm-stop-btn"
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-[#F0F0ED] text-xs font-bold flex items-center gap-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] cursor-pointer disabled:opacity-50 shadow-md"
            >
              <AlertOctagon size={13} />
              <span>{isStopping ? 'Stopping Process...' : 'Stop Process'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
