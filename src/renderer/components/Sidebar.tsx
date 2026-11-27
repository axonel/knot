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
} from 'lucide-react';
import { Magnet } from './ReactBits/index.js';

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
      } bg-[#1B1D1F] border-r border-[#292C2F] flex flex-col justify-between py-3.5 select-none shrink-0 transition-all duration-200 z-20`}
    >
      {/* Top Brand & Nav Section */}
      <div className={isCollapsed ? 'px-1.5' : 'px-3'}>
        {/* Brand Header */}
        <div
          className={`pb-3 mb-3 border-b border-[#292C2F] flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-between px-1'
          }`}
        >
          {isCollapsed ? (
            <Magnet padding={10} disabled={false}>
              <button
                onClick={onToggleCollapse}
                title="Expand Sidebar"
                aria-label="Expand Sidebar"
                className="cursor-pointer hover:opacity-80 transition-opacity p-0.5"
              >
                <KnotLogo showText={false} size={28} />
              </button>
            </Magnet>
          ) : (
            <>
              <KnotLogo showText={true} subtitle={true} size={34} />
              {onToggleCollapse && (
                <Magnet padding={12} disabled={false}>
                  <button
                    onClick={onToggleCollapse}
                    title="Collapse Sidebar"
                    aria-label="Collapse Sidebar"
                    className="p-1 rounded text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F] transition-all cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                </Magnet>
              )}
            </>
          )}
        </div>

        {/* Navigation list */}
        <nav className="space-y-1">
          {!isCollapsed && (
            <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-[#A5A5A0]/60 font-semibold">
              Workstation
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
                } rounded-lg text-xs font-medium transition-all cursor-pointer relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252] ${
                  isActive
                    ? 'bg-[#292C2F] text-[#F0F0ED] shadow-sm font-semibold border-l-2 border-[#E05252]'
                    : 'text-[#A5A5A0] hover:bg-[#292C2F]/50 hover:text-[#F0F0ED]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    size={16}
                    className={`shrink-0 ${isActive ? 'text-[#E05252]' : 'text-current'}`}
                  />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </div>

                {/* Badges */}
                {item.badge && (
                  isCollapsed ? (
                    <span
                      className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#E05252]"
                      title={item.badge}
                    />
                  ) : (
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                        isActive
                          ? 'bg-[#000000] text-[#E05252] border-[#E05252]/40 font-semibold'
                          : 'bg-[#000000] text-[#A5A5A0]/60 border-[#292C2F]'
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

      {/* Bottom Rail Collapse Trigger */}
      <div className={isCollapsed ? 'px-1.5' : 'px-3'}>
        <div className="pt-2 border-t border-[#292C2F]">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Rail'}
              aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Rail'}
              className={`w-full flex items-center justify-center ${
                isCollapsed ? 'p-2' : 'gap-1.5 py-1.5 font-mono text-[11px]'
              } rounded text-xs text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F] transition-all cursor-pointer`}
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={14} />}
              {!isCollapsed && <span>Collapse Rail</span>}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
