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
          bg: 'bg-[#004E72]/20',
          border: 'border-[#004E72]/60',
          text: 'text-[#F9F9F9]',
          dot: 'bg-[#F9F9F9]',
        };
      case 'Starting':
        return {
          bg: 'bg-[#004E72]/15',
          border: 'border-[#004E72]/40',
          text: 'text-[#F9F9F9]/90',
          dot: 'bg-[#004E72]',
          ping: true,
        };
      case 'Stopping':
        return {
          bg: 'bg-[#FF6E42]/15',
          border: 'border-[#FF6E42]/40',
          text: 'text-[#FF6E42]',
          dot: 'bg-[#FF6E42]',
          ping: true,
        };
      case 'Error':
        return {
          bg: 'bg-[#FF6E42]/20',
          border: 'border-[#FF6E42]/60',
          text: 'text-[#FF6E42]',
          dot: 'bg-[#FF6E42]',
        };
      case 'Stopped':
      default:
        return {
          bg: 'bg-[#F9F9F9]/5',
          border: 'border-[#F9F9F9]/15',
          text: 'text-[#F9F9F9]/60',
          dot: 'bg-[#F9F9F9]/40',
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
