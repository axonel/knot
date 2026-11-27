import React from 'react';
import { ProcessState } from '../../../shared/types.js';

interface StatusBadgeProps {
  state: ProcessState;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ state, className = '' }) => {
  const getBadgeStyle = (): { bg: string; border: string; text: string; dot: string; ping?: boolean } => {
    switch (state) {
      case 'Running':
        return {
          bg: 'bg-[#292C2F]/50',
          border: 'border-[#292C2F]',
          text: 'text-[#F0F0ED]',
          dot: 'bg-[#E05252]',
        };
      case 'Starting':
        return {
          bg: 'bg-[#292C2F]/30',
          border: 'border-[#292C2F]',
          text: 'text-[#F0F0ED]',
          dot: 'bg-[#E05252]',
          ping: true,
        };
      case 'Stopping':
        return {
          bg: 'bg-[#E05252]/15',
          border: 'border-[#E05252]/40',
          text: 'text-[#E05252]',
          dot: 'bg-[#E05252]',
          ping: true,
        };
      case 'Error':
        return {
          bg: 'bg-[#E05252]/20',
          border: 'border-[#E05252]/50',
          text: 'text-[#E05252]',
          dot: 'bg-[#E05252]',
        };
      case 'Stopped':
      default:
        return {
          bg: 'bg-[#000000]',
          border: 'border-[#292C2F]',
          text: 'text-[#A5A5A0]',
          dot: 'bg-[#A5A5A0]/40',
        };
    }
  };

  const style = getBadgeStyle();

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border ${style.bg} ${style.border} ${style.text} ${className}`}
      data-testid="status-badge"
    >
      <span className="relative flex h-2 w-2">
        {style.ping && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${style.dot}`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${style.dot}`} />
      </span>
      {state}
    </span>
  );
};
