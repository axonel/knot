import React, { useState } from 'react';
import { ShieldCheck, AlertCircle, Copy, Check, FolderGit2, HardDrive } from 'lucide-react';
import type { Project, BridgeStatusInfo } from '../../../shared/types.js';

interface DirectoryAccessDiagnosticProps {
  project: Project | null;
  bridgeStatus: BridgeStatusInfo | null;
}

export const DirectoryAccessDiagnostic: React.FC<DirectoryAccessDiagnosticProps> = ({
  project,
  bridgeStatus,
}) => {
  const [copied, setCopied] = useState(false);

  const bridgeRoot = bridgeStatus?.bridgeRoot || '';
  const repoPath = project?.repositoryPath || '';

  const allowedDirs = [bridgeRoot];
  if (repoPath && !allowedDirs.includes(repoPath)) {
    allowedDirs.push(repoPath);
  }

  const configSnippet = JSON.stringify(
    {
      allowedDirectories: allowedDirs,
    },
    null,
    2
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(configSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bridgeAccessOk = bridgeStatus?.mcpPermissionConfigured ?? false;
  const repoConfigured = Boolean(repoPath);

  return (
    <div className="p-3.5 rounded-xl border border-[#F9F9F9]/10 bg-[#092634]/70 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-[#004E72]" />
          <h3 className="text-xs font-bold text-[#F9F9F9]">Desktop Commander Access Diagnostic</h3>
        </div>
        <button
          onClick={handleCopy}
          className="px-2 py-1 rounded bg-[#090B0D] border border-[#F9F9F9]/10 text-[#F9F9F9]/80 hover:text-[#F9F9F9] hover:bg-[#004E72]/20 transition-all text-[11px] font-mono flex items-center gap-1"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy allowedDirectories'}</span>
        </button>
      </div>

      {/* Directory Status Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        {/* Bridge Directory Status */}
        <div className="p-2.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 flex items-start gap-2">
          <HardDrive size={14} className="text-[#004E72] mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#F9F9F9] text-[11px]">Bridge Directory</span>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                  bridgeAccessOk
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                    : 'bg-amber-950/80 text-amber-400 border border-amber-800'
                }`}
              >
                {bridgeAccessOk ? 'Accessible' : 'Check Permission'}
              </span>
            </div>
            <div className="text-[10px] text-[#F9F9F9]/40 font-mono truncate mt-0.5">
              {bridgeRoot || 'Not initialized'}
            </div>
          </div>
        </div>

        {/* Project Repository Status */}
        <div className="p-2.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10 flex items-start gap-2">
          <FolderGit2 size={14} className="text-[#FF6E42] mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#F9F9F9] text-[11px]">Project Repository</span>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                  repoConfigured
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                    : 'bg-rose-950/80 text-rose-400 border border-rose-800'
                }`}
              >
                {repoConfigured ? 'Configured' : 'Missing Path'}
              </span>
            </div>
            <div className="text-[10px] text-[#F9F9F9]/40 font-mono truncate mt-0.5">
              {repoPath || 'No repository path set in project'}
            </div>
          </div>
        </div>
      </div>

      {!repoConfigured && (
        <div className="flex items-center gap-2 p-2 rounded bg-amber-950/30 border border-amber-800/50 text-[11px] text-amber-300">
          <AlertCircle size={14} className="shrink-0" />
          <span>Configure a repository path in Project Settings so ChatGPT and Antigravity can inspect and modify code.</span>
        </div>
      )}
    </div>
  );
};
