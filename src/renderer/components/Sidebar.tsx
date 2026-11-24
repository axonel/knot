import React from 'react';
import { KnotLogo } from './KnotLogo.js';
import { FolderGit2, Terminal, Users, Cpu, Settings, ShieldCheck, Radio, Sparkles } from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onTabChange }) => {
  const navItems = [
    {
      id: 'projects',
      label: 'Projects & Sessions',
      icon: FolderGit2,
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      icon: Sparkles,
      badge: 'Agent',
    },
    {
      id: 'commander',
      label: 'Desktop Commander',
      icon: Terminal,
      badge: 'Active',
    },
    {
      id: 'bridge',
      label: 'ChatGPT Bridge',
      icon: Radio,
      badge: 'Live',
    },
    {
      id: 'threads',
      label: 'Agent Threads',
      icon: Users,
      badge: 'Soon',
      disabled: true,
    },
    {
      id: 'mesh',
      label: 'Message Mesh',
      icon: Cpu,
      badge: 'Soon',
      disabled: true,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      disabled: true,
    },
  ];

  return (
    <aside className="w-64 bg-[#092634] border-r border-[#F9F9F9]/10 flex flex-col justify-between p-4 select-none shrink-0">
      {/* Top Brand Section */}
      <div>
        <div className="pb-5 mb-5 border-b border-[#F9F9F9]/10">
          <KnotLogo showText={true} subtitle={true} size={40} />
        </div>

        {/* Navigation list */}
        <nav className="space-y-1">
          <div className="px-2 pb-2 text-[10px] font-mono uppercase tracking-wider text-[#F9F9F9]/40 font-semibold">
            Workspace
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => !item.disabled && onTabChange(item.id)}
                disabled={item.disabled}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#004E72] text-[#F9F9F9] shadow-sm font-semibold'
                    : item.disabled
                    ? 'text-[#F9F9F9]/30 cursor-not-allowed'
                    : 'text-[#F9F9F9]/70 hover:bg-[#090B0D]/50 hover:text-[#F9F9F9] cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    size={16}
                    className={isActive ? 'text-[#F9F9F9]' : 'text-current'}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                      isActive
                        ? 'bg-[#092634] text-[#F9F9F9] border-[#F9F9F9]/20'
                        : 'bg-[#090B0D] text-[#F9F9F9]/40 border-[#F9F9F9]/10'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Environment Status Box */}
      <div className="p-3 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-[#F9F9F9]/70">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck size={14} className="text-[#004E72]" />
            <span>Process Isolation</span>
          </div>
          <span className="text-[10px] font-mono text-[#F9F9F9]/40">Active</span>
        </div>
        <div className="text-[10px] text-[#F9F9F9]/40 font-mono leading-tight">
          Desktop Commander Remote v0.3.x
        </div>
      </div>
    </aside>
  );
};
