import React from 'react';
import { KnotLogo } from './KnotLogo.js';
import {
  FolderGit2,
  Terminal,
  Radio,
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isFocusMode?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  isCollapsed = false,
  onToggleCollapse,
  isFocusMode = false,
}) => {
  if (isFocusMode) {
    return null;
  }

  const navItems = [
    {
      id: 'workspace',
      label: 'Workspace',
      icon: Layers,
      badge: 'Live',
    },
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
  ];

  return (
    <aside
      className={`${
        isCollapsed ? 'w-14' : 'w-56'
      } bg-[#092634] border-r border-[#F9F9F9]/10 flex flex-col justify-between py-3.5 select-none shrink-0 transition-all duration-200 z-20`}
    >
      {/* Top Brand & Nav Section */}
      <div className={isCollapsed ? 'px-1.5' : 'px-3'}>
        {/* Brand Header */}
        <div
          className={`pb-3 mb-3 border-b border-[#F9F9F9]/10 flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-between px-1'
          }`}
        >
          {isCollapsed ? (
            <button
              onClick={onToggleCollapse}
              title="Expand Sidebar"
              className="cursor-pointer hover:opacity-80 transition-opacity"
            >
              <KnotLogo showText={false} size={28} />
            </button>
          ) : (
            <>
              <KnotLogo showText={true} subtitle={true} size={36} />
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  title="Collapse Sidebar"
                  className="p-1 rounded text-[#F9F9F9]/50 hover:text-[#F9F9F9] hover:bg-[#090B0D]/50 transition-all cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
              )}
            </>
          )}
        </div>

        {/* Navigation list */}
        <nav className="space-y-1">
          {!isCollapsed && (
            <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-[#F9F9F9]/40 font-semibold">
              Workspace
            </div>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                title={isCollapsed ? `${item.label}${item.badge ? ` (${item.badge})` : ''}` : undefined}
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-2.5' : 'justify-between px-2.5 py-2'
                } rounded-lg text-xs font-medium transition-all cursor-pointer relative ${
                  isActive
                    ? 'bg-[#004E72] text-[#F9F9F9] shadow-sm font-semibold'
                    : 'text-[#F9F9F9]/70 hover:bg-[#090B0D]/50 hover:text-[#F9F9F9]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    size={16}
                    className={`shrink-0 ${isActive ? 'text-[#F9F9F9]' : 'text-current'}`}
                  />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </div>

                {/* Badges */}
                {item.badge && (
                  isCollapsed ? (
                    <span
                      className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#FF6E42]"
                      title={item.badge}
                    />
                  ) : (
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded border shrink-0 ${
                        isActive
                          ? 'bg-[#092634] text-[#F9F9F9] border-[#F9F9F9]/20'
                          : 'bg-[#090B0D] text-[#F9F9F9]/40 border-[#F9F9F9]/10'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Environment Status & Collapse Trigger */}
      <div className={isCollapsed ? 'px-1.5 space-y-2' : 'px-3 space-y-2'}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-1.5 pt-2 border-t border-[#F9F9F9]/10">
            <div
              title="Process Isolation: Active"
              className="p-2 rounded bg-[#090B0D] border border-[#F9F9F9]/10 text-[#004E72]"
            >
              <ShieldCheck size={14} />
            </div>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                title="Expand Sidebar"
                className="w-full flex items-center justify-center p-2 rounded text-[#F9F9F9]/50 hover:text-[#F9F9F9] hover:bg-[#090B0D]/50 transition-all cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="p-2.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-[#F9F9F9]/70">
                <div className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck size={13} className="text-[#004E72]" />
                  <span>Process Isolation</span>
                </div>
                <span className="text-[10px] font-mono text-[#F9F9F9]/40">Active</span>
              </div>
              <div className="text-[10px] text-[#F9F9F9]/40 font-mono leading-tight">
                Desktop Commander Remote
              </div>
            </div>

            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-xs text-[#F9F9F9]/50 hover:text-[#F9F9F9] hover:bg-[#090B0D]/50 transition-all cursor-pointer font-mono text-[11px]"
              >
                <ChevronLeft size={14} />
                <span>Collapse Rail</span>
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
