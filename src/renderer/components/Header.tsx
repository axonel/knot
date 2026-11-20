import React from 'react';
import { GitBranch, Activity } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="h-12 border-b border-[#F9F9F9]/10 bg-[#092634] px-6 flex items-center justify-between select-none shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-[#F9F9F9]">Knot</span>
        <span className="text-[#F9F9F9]/30 text-xs">/</span>
        <span className="text-xs text-[#F9F9F9]/70 font-mono">Process Manager</span>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9]/70 font-mono text-[11px]">
          <GitBranch size={12} className="text-[#004E72]" />
          <span>axonel/knot</span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-[#F9F9F9]/60">
          <Activity size={12} className="text-[#004E72]" />
          <span>Remote Ready</span>
        </div>
      </div>
    </header>
  );
};
