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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090B0D]/85 backdrop-blur-xs select-none animate-in fade-in duration-150"
      onClick={() => {
        if (!isStopping) onCancel();
      }}
    >
      <div
        className="w-full max-w-xl flex flex-col rounded-xl bg-[#092634] border border-[#F9F9F9]/15 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#090B0D] border-b border-[#F9F9F9]/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-rose-950/60 text-rose-400 border border-rose-800">
              <AlertOctagon size={16} />
            </div>
            <div>
              <h2 id="stop-process-modal-title" className="text-xs font-bold font-mono tracking-wider uppercase text-[#F9F9F9]">
                Confirm Process Termination
              </h2>
              <p className="text-[11px] text-[#F9F9F9]/60 font-mono">
                Operating System process lifecycle control &bull; Omarchy Linux
              </p>
            </div>
          </div>

          <button
            onClick={onCancel}
            disabled={isStopping}
            aria-label="Cancel process termination"
            title="Cancel (Esc)"
            className="p-1.5 rounded-lg text-[#F9F9F9]/60 hover:text-[#F9F9F9] hover:bg-[#F9F9F9]/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6E42] cursor-pointer disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Target Process Identification */}
          <div className="p-3 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu size={14} className="text-[#FF6E42]" />
                <span className="font-bold text-[#F9F9F9] text-sm">
                  {processDetails.name}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-[#004E72]/40 text-[#F9F9F9] border border-[#004E72]">
                {processDetails.state}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[#F9F9F9]/70 pt-1 border-t border-[#F9F9F9]/5">
              <div className="flex items-center gap-1.5">
                <Hash size={12} className="text-[#F9F9F9]/40" />
                <span>PID: {processDetails.pid ?? 'Unavailable (Child/Spawned)'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity size={12} className="text-[#F9F9F9]/40" />
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
              <p className="text-[11px] text-[#F9F9F9]/80 leading-relaxed">
                This will shut down {processDetails.name}. Knot will not automatically restart the process.
                You must manually click Start to re-initialize it.
              </p>
            </div>
          </div>

          {/* Graceful Termination & Escalation Strategy */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#FF6E42] flex items-center gap-1.5">
              <Terminal size={12} />
              <span>Termination & Escalation Policy</span>
            </span>

            <div className="p-3 rounded-lg bg-[#090B0D]/80 border border-[#F9F9F9]/10 space-y-2 text-[11px] text-[#F9F9F9]/70 leading-relaxed font-mono">
              <p>
                <strong className="text-[#F9F9F9]">1. Graceful Phase:</strong> Knot sends a standard OS <code className="text-[#FF6E42]">SIGINT</code>/<code className="text-[#FF6E42]">SIGTERM</code> signal, allowing buffers to flush and file descriptors to close cleanly.
              </p>
              <p>
                <strong className="text-[#F9F9F9]">2. Timeout Escalation:</strong> If the process does not terminate within the 3.0s grace timeout, Knot automatically escalates to <code className="text-rose-400">SIGKILL</code> to prevent orphaned background processes.
              </p>
            </div>
          </div>

          {/* Operational Impact */}
          <div className="space-y-1.5 text-[11px] text-[#F9F9F9]/70">
            <span className="font-bold font-mono text-[10px] uppercase text-[#F9F9F9]/50 tracking-wider">
              Potential Effects on Active Connections & Tasks:
            </span>
            <ul className="space-y-1 list-disc list-inside text-[#F9F9F9]/80 pl-1">
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
        <div className="px-5 py-3.5 bg-[#090B0D] border-t border-[#F9F9F9]/10 flex items-center justify-between shrink-0">
          <span className="text-[10px] font-mono text-[#F9F9F9]/50">
            Press <kbd className="px-1 py-0.5 rounded bg-[#092634] text-[#F9F9F9]/80 border border-[#F9F9F9]/20">Esc</kbd> to cancel
          </span>

          <div className="flex items-center gap-2">
            {/* Cancel Button has initial focus for safety */}
            <button
              ref={cancelBtnRef}
              onClick={onCancel}
              disabled={isStopping}
              data-testid="cancel-stop-btn"
              className="px-4 py-2 rounded-lg bg-[#092634] hover:bg-[#092634]/80 text-[#F9F9F9] text-xs font-semibold border border-[#F9F9F9]/15 hover:border-[#F9F9F9]/30 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6E42] cursor-pointer"
            >
              Cancel &bull; Keep Running
            </button>

            {/* Confirm Stop Button */}
            <button
              onClick={() => onConfirmStop()}
              disabled={isStopping}
              data-testid="confirm-stop-btn"
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-[#F9F9F9] text-xs font-bold flex items-center gap-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6E42] cursor-pointer disabled:opacity-50 shadow-md"
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
