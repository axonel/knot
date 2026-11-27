import React from 'react';
import { RotateCcw, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { PendingTaskAction } from '../../hooks/useTaskUndoManager.js';
import { Magnet } from '../ReactBits/index.js';

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
          className="flex flex-col p-3 rounded-xl bg-[#1B1D1F] border border-[#E05252]/50 shadow-2xl space-y-2 backdrop-blur-md"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-[#E05252]/20 text-[#E05252] shrink-0">
                {action.actionType === 'cancel' ? (
                  <AlertTriangle size={15} className="animate-pulse" />
                ) : (
                  <ShieldAlert size={15} className="animate-pulse" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#E05252]">
                    {action.actionType === 'cancel' ? 'Cancellation Scheduled' : 'Rejection Scheduled'}
                  </span>
                  <span
                    data-testid={`undo-countdown-${action.taskId}`}
                    className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#E05252] text-[#F0F0ED]"
                  >
                    {action.secondsRemaining}s
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#F0F0ED] truncate" title={action.taskTitle}>
                  {action.taskTitle}
                </p>
              </div>
            </div>

            <Magnet padding={8} disabled={false}>
              <button
                onClick={() => onUndo(action.taskId)}
                data-testid={`undo-btn-${action.taskId}`}
                aria-label={`Undo ${action.actionType} for task ${action.taskTitle}`}
                className="px-3 py-1.5 rounded-lg bg-[#292C2F] hover:bg-[#32363a] text-[#F0F0ED] text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all border border-[#E05252] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] cursor-pointer shadow-sm active:scale-95"
              >
                <RotateCcw size={13} className="text-[#E05252]" />
                <span>Undo</span>
              </button>
            </Magnet>
          </div>

          <p className="text-[10px] text-[#F0F0ED]/60 font-mono">
            {action.actionType === 'cancel'
              ? 'Task execution continues until the grace period expires without undo.'
              : 'Proposal will be rejected after countdown expires unless undone.'}
          </p>

          {/* Progress Countdown Bar */}
          <div className="w-full h-1 bg-[#000000] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#E05252] transition-all duration-200"
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
