import React from 'react';
import { GitBranch, Cpu } from 'lucide-react';
import { ShinyText, Magnet } from './ReactBits/index.js';

export const Header: React.FC = () => {
  return (
    <header className="h-12 border-b border-[#292C2F] bg-[#1B1D1F] px-5 flex items-center justify-between select-none shrink-0 z-10">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-[#F0F0ED] tracking-wide font-sans">Knot</span>
        <span className="text-[#A5A5A0]/40 text-xs font-mono">/</span>
        <span className="text-xs text-[#A5A5A0] font-mono">Workstation Engine</span>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <Magnet padding={8} disabled={false}>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#000000] border border-[#292C2F] text-[#F0F0ED] font-mono text-[11px] shadow-2xs cursor-default">
            <GitBranch size={12} className="text-[#E05252]" />
            <span>axonel/knot</span>
          </div>
        </Magnet>

        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#000000] border border-[#292C2F] text-[11px] text-[#A5A5A0] font-mono">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E05252] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E05252]"></span>
          </span>
          <ShinyText text="Remote Ready" speed={4} className="text-[11px] font-mono font-medium text-[#F0F0ED]" />
        </div>

        <div className="hidden sm:flex items-center gap-1 text-[11px] text-[#A5A5A0] font-mono px-2 py-1">
          <Cpu size={12} className="text-[#A5A5A0]/60" />
          <span>Wayland / Hyprland</span>
        </div>
      </div>
    </header>
  );
};
