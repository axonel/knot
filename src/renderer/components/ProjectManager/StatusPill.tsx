import React from 'react';
import type { SessionStatus, TaskStatus } from '../../../shared/types.js';

interface StatusPillProps {
  status: SessionStatus | TaskStatus | string;
  type?: 'session' | 'task';
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, type = 'session' }) => {
  let bgClass = 'bg-[#090B0D]';
  let borderClass = 'border-[#F9F9F9]/20';
  let textClass = 'text-[#F9F9F9]/70';
  let label = status;

  if (type === 'session') {
    switch (status) {
      case 'active':
        bgClass = 'bg-[#004E72]/30';
        borderClass = 'border-[#004E72]';
        textClass = 'text-[#F9F9F9] font-semibold';
        label = 'Active';
        break;
      case 'paused':
        bgClass = 'bg-[#FF6E42]/10';
        borderClass = 'border-[#FF6E42]/50';
        textClass = 'text-[#FF6E42] font-semibold';
        label = 'Paused';
        break;
      case 'completed':
        bgClass = 'bg-[#004E72]/20';
        borderClass = 'border-[#004E72]/40';
        textClass = 'text-[#F9F9F9]/80';
        label = 'Completed';
        break;
      case 'archived':
        bgClass = 'bg-[#090B0D]';
        borderClass = 'border-[#F9F9F9]/10';
        textClass = 'text-[#F9F9F9]/40';
        label = 'Archived';
        break;
    }
  } else {
    // Task status
    switch (status) {
      case 'running':
        bgClass = 'bg-[#004E72]/40';
        borderClass = 'border-[#004E72]';
        textClass = 'text-[#F9F9F9] font-semibold';
        label = 'Running';
        break;
      case 'queued':
        bgClass = 'bg-[#FF6E42]/10';
        borderClass = 'border-[#FF6E42]/40';
        textClass = 'text-[#FF6E42]';
        label = 'Queued';
        break;
      case 'succeeded':
        bgClass = 'bg-[#004E72]/20';
        borderClass = 'border-[#004E72]/30';
        textClass = 'text-[#F9F9F9]/80';
        label = 'Succeeded';
        break;
      case 'failed':
        bgClass = 'bg-[#FF6E42]/20';
        borderClass = 'border-[#FF6E42]';
        textClass = 'text-[#FF6E42] font-bold';
        label = 'Failed';
        break;
      case 'cancelled':
        bgClass = 'bg-[#090B0D]';
        borderClass = 'border-[#F9F9F9]/10';
        textClass = 'text-[#F9F9F9]/40';
        label = 'Cancelled';
        break;
      case 'awaiting_approval':
      case 'needs_attention':
        bgClass = 'bg-[#FF6E42]/15';
        borderClass = 'border-[#FF6E42]';
        textClass = 'text-[#FF6E42]';
        label = status === 'awaiting_approval' ? 'Approval' : 'Attention';
        break;
      case 'approved':
        bgClass = 'bg-[#004E72]/30';
        borderClass = 'border-[#004E72]/50';
        textClass = 'text-[#F9F9F9]';
        label = 'Approved';
        break;
    }
  }

  return (
    <span
      data-testid="status-pill"
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border ${bgClass} ${borderClass} ${textClass}`}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-80" />
      {label}
    </span>
  );
};
