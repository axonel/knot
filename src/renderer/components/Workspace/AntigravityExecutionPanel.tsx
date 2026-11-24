import React from 'react';
import { Sparkles } from 'lucide-react';
import type { Session } from '../../../shared/types.js';

interface AntigravityExecutionPanelProps {
  session: Session | null;
  onRefresh?: () => void;
}

export const AntigravityExecutionPanel: React.FC<AntigravityExecutionPanelProps> = ({ session }) => {
  return (
    <div className="flex flex-col h-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded-xl p-4">
      <div className="flex items-center gap-2 pb-3 border-b border-[#F9F9F9]/10 text-xs font-bold text-[#F9F9F9]">
        <Sparkles size={16} className="text-[#FF6E42]" />
        <span>Antigravity Execution</span>
      </div>
      <div className="flex-1 flex items-center justify-center text-xs text-[#F9F9F9]/40">
        {session ? 'Worker initializing...' : 'Select a session'}
      </div>
    </div>
  );
};
