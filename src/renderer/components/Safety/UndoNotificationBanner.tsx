import React from 'react';
import { RotateCcw, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { PendingTaskAction } from '../../hooks/useTaskUndoManager.js';

interface UndoNotificationBannerProps {
  pendingActions: PendingTaskAction[];
  onUndo: (taskId: string) => void;
}

export const UndoNotificationBanner: React.FC<UndoNotificationBannerProps> = ({
  pendingActions,
  onUndo,
}) => {
  if (pendingActions.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Pending task actions with undo"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full animate-in slide-in-from-bottom-2 duration-150 select-none pointer-events-auto"
    >
      {pendingActions.map((action) => (
        <div
          key={action.taskId}
          data-testid={`undo-banner-${action.taskId}`}
          className="flex flex-col p-3 rounded-xl bg-[#092634] border border-[#FF6E42]/50 shadow-2xl space-y-2 backdrop-blur-md"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-[#FF6E42]/20 text-[#FF6E42] shrink-0">
                {action.actionType === 'cancel' ? (
                  <AlertTriangle size={15} className="animate-pulse" />
                ) : (
                  <ShieldAlert size={15} className="animate-pulse" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#FF6E42]">
                    {action.actionType === 'cancel' ? 'Cancellation Scheduled' : 'Rejection Scheduled'}
                  </span>
                  <span
                    data-testid={`undo-countdown-${action.taskId}`}
                    className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#FF6E42] text-[#090B0D]"
                  >
                    {action.secondsRemaining}s
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#F9F9F9] truncate" title={action.taskTitle}>
                  {action.taskTitle}
                </p>
              </div>
            </div>

            <button
              onClick={() => onUndo(action.taskId)}
              data-testid={`undo-btn-${action.taskId}`}
              aria-label={`Undo ${action.actionType} for task ${action.taskTitle}`}
              className="px-3 py-1.5 rounded-lg bg-[#004E72] hover:bg-[#004E72]/80 text-[#F9F9F9] text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all border border-[#004E72] hover:border-[#FF6E42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6E42] cursor-pointer shadow-sm active:scale-95"
            >
              <RotateCcw size={13} className="text-[#FF6E42]" />
              <span>Undo</span>
            </button>
          </div>

          <p className="text-[10px] text-[#F9F9F9]/60 font-mono">
            {action.actionType === 'cancel'
              ? 'Task execution continues until the grace period expires without undo.'
              : 'Proposal will be rejected after countdown expires unless undone.'}
          </p>

          {/* Progress Countdown Bar */}
          <div className="w-full h-1 bg-[#090B0D] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FF6E42] transition-all duration-200"
              style={{
                width: `${Math.max(0, Math.min(100, (action.secondsRemaining / action.totalSeconds) * 100))}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
