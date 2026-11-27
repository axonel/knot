import React from 'react';
import type { SessionStatus, TaskStatus } from '../../../shared/types.js';

interface StatusPillProps {
  status: SessionStatus | TaskStatus | string;
  type?: 'session' | 'task';
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, type = 'session' }) => {
  let bgClass = 'bg-[#000000]';
  let borderClass = 'border-[#F0F0ED]/20';
  let textClass = 'text-[#F0F0ED]/70';
  let label = status;

  if (type === 'session') {
    switch (status) {
      case 'active':
        bgClass = 'bg-[#292C2F]/30';
        borderClass = 'border-[#292C2F]';
        textClass = 'text-[#F0F0ED] font-semibold';
        label = 'Active';
        break;
      case 'paused':
        bgClass = 'bg-[#E05252]/10';
        borderClass = 'border-[#E05252]/50';
        textClass = 'text-[#E05252] font-semibold';
        label = 'Paused';
        break;
      case 'completed':
        bgClass = 'bg-[#292C2F]/20';
        borderClass = 'border-[#292C2F]/40';
        textClass = 'text-[#F0F0ED]/80';
        label = 'Completed';
        break;
      case 'archived':
        bgClass = 'bg-[#000000]';
        borderClass = 'border-[#F0F0ED]/10';
        textClass = 'text-[#F0F0ED]/40';
        label = 'Archived';
        break;
    }
  } else {
    // Task status
    switch (status) {
      case 'running':
        bgClass = 'bg-[#292C2F]/40';
        borderClass = 'border-[#292C2F]';
        textClass = 'text-[#F0F0ED] font-semibold';
        label = 'Running';
        break;
      case 'queued':
        bgClass = 'bg-[#E05252]/10';
        borderClass = 'border-[#E05252]/40';
        textClass = 'text-[#E05252]';
        label = 'Queued';
        break;
      case 'succeeded':
        bgClass = 'bg-[#292C2F]/20';
        borderClass = 'border-[#292C2F]/30';
        textClass = 'text-[#F0F0ED]/80';
        label = 'Succeeded';
        break;
      case 'failed':
        bgClass = 'bg-[#E05252]/20';
        borderClass = 'border-[#E05252]';
        textClass = 'text-[#E05252] font-bold';
        label = 'Failed';
        break;
      case 'cancelled':
        bgClass = 'bg-[#000000]';
        borderClass = 'border-[#F0F0ED]/10';
        textClass = 'text-[#F0F0ED]/40';
        label = 'Cancelled';
        break;
      case 'awaiting_approval':
      case 'needs_attention':
        bgClass = 'bg-[#E05252]/15';
        borderClass = 'border-[#E05252]';
        textClass = 'text-[#E05252]';
        label = status === 'awaiting_approval' ? 'Approval' : 'Attention';
        break;
      case 'approved':
        bgClass = 'bg-[#292C2F]/30';
        borderClass = 'border-[#292C2F]/50';
        textClass = 'text-[#F0F0ED]';
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
