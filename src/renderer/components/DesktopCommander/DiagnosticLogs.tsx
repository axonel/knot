import React, { useState, useRef, useEffect } from 'react';
import { LogEntry, LogLevel } from '../../../shared/types.js';
import { Terminal, Copy, Check, Trash2, Download, ArrowDown, MoreHorizontal, ChevronDown, ChevronRight } from 'lucide-react';

interface DiagnosticLogsProps {
  logs: LogEntry[];
  onClear: () => void;
  defaultExpanded?: boolean;
}

export const DiagnosticLogs: React.FC<DiagnosticLogsProps> = ({
  logs,
  onClear,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return log.level === filter;
  });

  useEffect(() => {
    if (autoScroll && isExpanded && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll, isExpanded]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleCopy = async () => {
    if (logs.length === 0) return;
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (logs.length === 0) return;
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `desktop-commander-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsMenuOpen(false);
  };

  const handleClear = () => {
    onClear();
    setIsMenuOpen(false);
  };

  const getLogLevelBadge = (level: LogLevel) => {
    switch (level) {
      case 'stderr':
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#E05252]/15 border border-[#E05252]/30 text-[#E05252] shrink-0 select-none">
            stderr
          </span>
        );
      case 'system':
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#292C2F] border border-[#292C2F] text-[#F0F0ED] shrink-0 select-none">
            system
          </span>
        );
      case 'stdout':
      default:
        return (
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#000000] border border-[#292C2F] text-[#A5A5A0] shrink-0 select-none">
            stdout
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl border border-[#292C2F] bg-[#1B1D1F] overflow-hidden flex flex-col flex-1 shadow-xs">
      {/* Action Toolbar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-3 bg-[#1B1D1F] border-b border-[#292C2F] select-none">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-xs font-semibold text-[#F0F0ED] hover:text-white transition-colors cursor-pointer text-left self-start sm:self-auto"
          data-testid="toggle-logs-btn"
          aria-expanded={isExpanded}
          aria-label="Toggle diagnostic logs expansion"
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-[#A5A5A0]" />
          ) : (
            <ChevronRight size={14} className="text-[#A5A5A0]" />
          )}
          <span className="flex items-center gap-1.5">
            <Terminal size={14} className="text-[#E05252]" />
            <span>Diagnostic Logs</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#000000] text-[#A5A5A0] border border-[#292C2F]">
            {logs.length}
          </span>
        </button>

        {isExpanded && (
          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            {/* Filter Buttons */}
            <div className="flex items-center rounded-lg bg-[#000000] p-0.5 border border-[#292C2F]">
              {(['all', 'stdout', 'stderr', 'system'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setFilter(level)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer capitalize ${
                    filter === level
                      ? 'bg-[#292C2F] text-[#F0F0ED] font-semibold'
                      : 'text-[#A5A5A0] hover:text-[#F0F0ED]'
                  }`}
                  aria-pressed={filter === level}
                >
                  {level}
                </button>
              ))}
            </div>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
              aria-label={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
              className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                autoScroll
                  ? 'bg-[#292C2F] border-[#292C2F] text-[#F0F0ED]'
                  : 'bg-[#000000] border-[#292C2F] text-[#A5A5A0] hover:text-[#F0F0ED]'
              }`}
            >
              <ArrowDown size={13} />
            </button>

            {/* Copy Logs */}
            <button
              onClick={handleCopy}
              disabled={logs.length === 0}
              title="Copy visible logs to clipboard"
              aria-label="Copy visible logs to clipboard"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#000000] border border-[#292C2F] text-xs text-[#F0F0ED] hover:bg-[#292C2F]/50 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Contextual Actions Menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                disabled={logs.length === 0}
                title="More log actions"
                aria-label="More log actions"
                className="p-1.5 rounded-lg bg-[#000000] border border-[#292C2F] text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F]/50 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <MoreHorizontal size={13} />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 rounded-lg bg-[#1B1D1F] border border-[#292C2F] shadow-xl py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={handleDownload}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#F0F0ED] hover:bg-[#292C2F] text-left transition-colors cursor-pointer"
                  >
                    <Download size={13} className="text-[#A5A5A0]" />
                    <span>Download Logs</span>
                  </button>
                  <div className="my-1 border-t border-[#292C2F]" />
                  <button
                    onClick={handleClear}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#E05252] hover:bg-[#E05252]/10 text-left transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Clear Buffer</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Log Viewport */}
      {isExpanded && (
        <div
          ref={logContainerRef}
          className="p-3.5 bg-[#000000] min-h-[260px] max-h-[500px] overflow-y-auto font-mono text-[11px] leading-relaxed select-text space-y-1.5 flex-1"
          data-testid="log-container"
        >
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center select-none space-y-2 h-full">
              <div className="w-10 h-10 rounded-full bg-[#1B1D1F] border border-[#292C2F] flex items-center justify-center text-[#A5A5A0]">
                <Terminal size={18} />
              </div>
              <span className="text-xs font-semibold text-[#F0F0ED]">No diagnostic output yet</span>
              <p className="text-[11px] text-[#A5A5A0] max-w-sm leading-normal font-sans">
                Diagnostic events, tool execution traces, and output will appear here in real time when Desktop Commander Remote runs.
              </p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-[#A5A5A0] text-xs font-sans select-none">
              <span>No log entries match the '{filter}' filter.</span>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`py-1 px-2 rounded-sm transition-colors flex items-start gap-2 break-all ${
                  log.level === 'stderr'
                    ? 'bg-[#E05252]/5 text-[#E05252]'
                    : log.level === 'system'
                    ? 'bg-[#292C2F]/15 text-[#A5A5A0]'
                    : 'text-[#F0F0ED]/90'
                }`}
              >
                <span className="text-[#A5A5A0]/60 shrink-0 select-none">
                  {log.timestamp.slice(11, 19)}
                </span>
                {getLogLevelBadge(log.level)}
                <span className="whitespace-pre-wrap flex-1 leading-snug">{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
