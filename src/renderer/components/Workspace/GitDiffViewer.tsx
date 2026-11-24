import React, { useState, useEffect, useMemo } from 'react';
import {
  GitCommit,
  GitBranch,
  X,
  FileCode,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  ShieldAlert,
  Search,
  FilePlus,
  FileEdit,
  FileMinus,
  HelpCircle,
} from 'lucide-react';
import type { TaskGitInspectionResult, FileChangeType, FileProvenance } from '../../../shared/types.js';

interface GitDiffViewerProps {
  taskId: string;
  onClose: () => void;
}

type FilterOption = 'all' | 'added' | 'modified' | 'deleted' | 'staged' | 'unstaged' | 'uncertain';

export const GitDiffViewer: React.FC<GitDiffViewerProps> = ({ taskId, onClose }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<TaskGitInspectionResult | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedCommit, setCopiedCommit] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;

    const fetchDiff = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!window.knotApi?.git?.getTaskDiff) {
          throw new Error('Git inspection API not available in desktop runtime.');
        }
        const res = await window.knotApi.git.getTaskDiff(taskId);
        if (!isCancelled) {
          setInspection(res);
          if (res.files.length > 0) {
            setSelectedFilePath(res.files[0].path);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchDiff();

    return () => {
      isCancelled = true;
    };
  }, [taskId]);

  const handleCopyCommit = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedCommit(true);
    setTimeout(() => setCopiedCommit(false), 2000);
  };

  const filteredFiles = useMemo(() => {
    if (!inspection) return [];
    return inspection.files.filter((file) => {
      // Filter by type
      if (activeFilter === 'added' && file.changeType !== 'added' && file.changeType !== 'untracked') return false;
      if (activeFilter === 'modified' && file.changeType !== 'modified' && file.changeType !== 'renamed') return false;
      if (activeFilter === 'deleted' && file.changeType !== 'deleted') return false;
      if (activeFilter === 'staged' && !file.isStaged) return false;
      if (activeFilter === 'unstaged' && (file.isStaged || file.isUntracked)) return false;
      if (activeFilter === 'uncertain' && file.provenance !== 'attribution-uncertain') return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return file.path.toLowerCase().includes(q) || (file.oldPath && file.oldPath.toLowerCase().includes(q));
      }

      return true;
    });
  }, [inspection, activeFilter, searchQuery]);

  const selectedFile = useMemo(() => {
    if (!inspection || !selectedFilePath) return null;
    return inspection.files.find((f) => f.path === selectedFilePath) || null;
  }, [inspection, selectedFilePath]);

  const renderChangeTypeIcon = (type: FileChangeType) => {
    switch (type) {
      case 'added':
      case 'untracked':
        return <FilePlus size={14} className="text-[#F9F9F9] shrink-0" />;
      case 'deleted':
        return <FileMinus size={14} className="text-[#FF6E42] shrink-0" />;
      case 'renamed':
      case 'modified':
      default:
        return <FileEdit size={14} className="text-[#004E72] shrink-0" />;
    }
  };

  const renderProvenanceBadge = (provenance: FileProvenance) => {
    switch (provenance) {
      case 'git-derived':
        return (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#004E72]/30 text-[#F9F9F9] border border-[#004E72]/60">
            Git-derived
          </span>
        );
      case 'antigravity-reported':
        return (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#FF6E42]/20 text-[#FF6E42] border border-[#FF6E42]/50">
            Antigravity-reported
          </span>
        );
      case 'attribution-uncertain':
        return (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#092634] text-[#FF6E42] border border-[#FF6E42]/60">
            Attribution uncertain
          </span>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Git Change Inspection and Diff Viewer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="w-full max-w-6xl h-[88vh] bg-[#090B0D] border border-[#F9F9F9]/15 rounded-xl shadow-2xl flex flex-col overflow-hidden text-[#F9F9F9]">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#092634] border-b border-[#F9F9F9]/10 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-[#004E72]/40 text-[#F9F9F9]">
              <GitCommit size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate">Git Change Inspection</h2>
              <p className="text-[11px] text-[#F9F9F9]/50 truncate font-mono">
                Task: {inspection?.taskTitle || taskId}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#F9F9F9]/60 hover:text-[#F9F9F9] hover:bg-[#F9F9F9]/10 transition-colors"
            title="Close Diff Viewer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#F9F9F9]/60">
            <div className="w-8 h-8 border-2 border-[#004E72] border-t-[#FF6E42] rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium">Inspecting Git changes & calculating task attribution...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto">
            <AlertTriangle size={36} className="text-[#FF6E42] mb-3" />
            <h3 className="text-base font-bold text-[#F9F9F9] mb-1">Git Inspection Failed</h3>
            <p className="text-xs text-[#F9F9F9]/60 font-mono bg-[#092634] p-3 rounded-lg border border-[#F9F9F9]/10 text-left w-full mb-4 whitespace-pre-wrap">
              {error}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-[#092634] hover:bg-[#004E72] text-[#F9F9F9] text-xs font-semibold transition-all"
            >
              Close Viewer
            </button>
          </div>
        )}

        {/* Loaded Inspection Content */}
        {!loading && inspection && (
          <>
            {/* Repository & Task Context Bar */}
            <div className="px-4 py-2.5 bg-[#092634]/60 border-b border-[#F9F9F9]/10 text-xs space-y-2 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Branch */}
                  <div className="flex items-center gap-1.5 font-mono text-[#F9F9F9]/80">
                    <GitBranch size={13} className="text-[#004E72]" />
                    <span>{inspection.branch || 'HEAD'}</span>
                  </div>

                  {/* Commit Hash if verified */}
                  {inspection.verifiedCommitHash && (
                    <div className="flex items-center gap-1 font-mono text-[#F9F9F9]/80">
                      <GitCommit size={13} className="text-[#004E72]" />
                      <span>{inspection.verifiedCommitHash.slice(0, 8)}</span>
                      <button
                        onClick={() => handleCopyCommit(inspection.verifiedCommitHash!)}
                        className="p-1 hover:text-[#F9F9F9] text-[#F9F9F9]/40 rounded"
                        title="Copy commit hash"
                      >
                        {copiedCommit ? <Check size={11} className="text-[#F9F9F9]" /> : <Copy size={11} />}
                      </button>
                    </div>
                  )}

                  {/* Attribution Confidence Chip */}
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      inspection.attributionConfidence === 'high'
                        ? 'bg-[#004E72]/40 text-[#F9F9F9] border-[#004E72]'
                        : inspection.attributionConfidence === 'medium'
                        ? 'bg-[#092634] text-[#F9F9F9]/80 border-[#F9F9F9]/20'
                        : 'bg-[#FF6E42]/20 text-[#FF6E42] border-[#FF6E42]/60'
                    }`}
                  >
                    {inspection.attributionConfidence === 'high'
                      ? 'Likely Task-Derived (Clean Baseline)'
                      : inspection.attributionConfidence === 'medium'
                      ? 'Medium Attribution'
                      : 'Attribution Uncertain (Dirty Baseline)'}
                  </span>
                </div>

                {/* Summary Metrics */}
                <div className="flex items-center gap-2.5 font-mono text-[11px] text-[#F9F9F9]/70">
                  <span>{inspection.summary.totalFiles} files</span>
                  <span className="text-[#F9F9F9] font-semibold">+{inspection.summary.totalAdditions}</span>
                  <span className="text-[#FF6E42] font-semibold">-{inspection.summary.totalDeletions}</span>
                  {inspection.summary.uncertainCount > 0 && (
                    <span className="text-[#FF6E42]">({inspection.summary.uncertainCount} uncertain)</span>
                  )}
                </div>
              </div>

              {/* Warnings and Attribution Notes */}
              {inspection.repositoryChangedSinceCompletion && (
                <div className="flex items-center gap-2 p-1.5 rounded bg-[#092634] border border-[#FF6E42]/60 text-[11px] text-[#F9F9F9]">
                  <AlertTriangle size={13} className="shrink-0 text-[#FF6E42]" />
                  <span>
                    <strong>Repository state moved:</strong> HEAD or working tree has changed since this task completed.
                    Current diff may reflect subsequent edits.
                  </span>
                </div>
              )}

              {inspection.attributionNotes && inspection.attributionNotes.length > 0 && !inspection.repositoryChangedSinceCompletion && (
                <div className="flex items-start gap-1.5 text-[11px] text-[#F9F9F9]/60 font-mono">
                  <HelpCircle size={12} className="text-[#004E72] mt-0.5 shrink-0" />
                  <span>{inspection.attributionNotes.join(' ')}</span>
                </div>
              )}
            </div>

            {/* Main Area: Dedicated Empty State OR Sidebar + Diff Viewer */}
            {inspection.files.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
                <CheckCircle2 size={40} className="text-[#004E72] mb-3" />
                <h3 className="text-base font-bold text-[#F9F9F9] mb-1">No Git Changes Detected</h3>
                <p className="text-xs text-[#F9F9F9]/60">
                  This task produced no committed or working-tree file modifications.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Left Sidebar: Changed Files */}
                <div className="w-80 border-r border-[#F9F9F9]/10 bg-[#092634]/30 flex flex-col shrink-0">
                  {/* Search & Filter Bar */}
                  <div className="p-2.5 border-b border-[#F9F9F9]/10 space-y-2 shrink-0">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-2 text-[#F9F9F9]/40" />
                      <input
                        type="text"
                        placeholder="Filter changed files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#090B0D] border border-[#F9F9F9]/10 rounded pl-8 pr-2.5 py-1 text-xs text-[#F9F9F9] focus:outline-none focus:border-[#004E72]"
                      />
                    </div>

                    {/* Filter chips */}
                    <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                      <button
                        onClick={() => setActiveFilter('all')}
                        className={`px-1.5 py-0.5 rounded border transition-colors ${
                          activeFilter === 'all'
                            ? 'bg-[#004E72] text-[#F9F9F9] border-[#004E72]'
                            : 'bg-[#090B0D] text-[#F9F9F9]/60 border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
                        }`}
                      >
                        All ({inspection.summary.totalFiles})
                      </button>
                      <button
                        onClick={() => setActiveFilter('added')}
                        className={`px-1.5 py-0.5 rounded border transition-colors ${
                          activeFilter === 'added'
                            ? 'bg-[#004E72] text-[#F9F9F9] border-[#004E72]'
                            : 'bg-[#090B0D] text-[#F9F9F9]/60 border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
                        }`}
                      >
                        Added
                      </button>
                      <button
                        onClick={() => setActiveFilter('modified')}
                        className={`px-1.5 py-0.5 rounded border transition-colors ${
                          activeFilter === 'modified'
                            ? 'bg-[#004E72] text-[#F9F9F9] border-[#004E72]'
                            : 'bg-[#090B0D] text-[#F9F9F9]/60 border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
                        }`}
                      >
                        Modified
                      </button>
                      <button
                        onClick={() => setActiveFilter('deleted')}
                        className={`px-1.5 py-0.5 rounded border transition-colors ${
                          activeFilter === 'deleted'
                            ? 'bg-[#004E72] text-[#F9F9F9] border-[#004E72]'
                            : 'bg-[#090B0D] text-[#F9F9F9]/60 border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
                        }`}
                      >
                        Deleted
                      </button>
                      {inspection.summary.stagedCount > 0 && (
                        <button
                          onClick={() => setActiveFilter('staged')}
                          className={`px-1.5 py-0.5 rounded border transition-colors ${
                            activeFilter === 'staged'
                              ? 'bg-[#004E72] text-[#F9F9F9] border-[#004E72]'
                              : 'bg-[#090B0D] text-[#F9F9F9]/60 border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
                          }`}
                        >
                          Staged ({inspection.summary.stagedCount})
                        </button>
                      )}
                      {inspection.summary.unstagedCount > 0 && (
                        <button
                          onClick={() => setActiveFilter('unstaged')}
                          className={`px-1.5 py-0.5 rounded border transition-colors ${
                            activeFilter === 'unstaged'
                              ? 'bg-[#004E72] text-[#F9F9F9] border-[#004E72]'
                              : 'bg-[#090B0D] text-[#F9F9F9]/60 border-[#F9F9F9]/10 hover:text-[#F9F9F9]'
                          }`}
                        >
                          Unstaged ({inspection.summary.unstagedCount})
                        </button>
                      )}
                      {inspection.summary.uncertainCount > 0 && (
                        <button
                          onClick={() => setActiveFilter('uncertain')}
                          className={`px-1.5 py-0.5 rounded border transition-colors ${
                            activeFilter === 'uncertain'
                              ? 'bg-[#FF6E42] text-[#090B0D] border-[#FF6E42]'
                              : 'bg-[#090B0D] text-[#FF6E42] border-[#FF6E42]/60 hover:text-[#F9F9F9]'
                          }`}
                        >
                          Uncertain ({inspection.summary.uncertainCount})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* File list */}
                  <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                    {filteredFiles.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[#F9F9F9]/40 font-mono">
                        No matching files found.
                      </div>
                    ) : (
                      filteredFiles.map((file) => {
                        const isSelected = selectedFilePath === file.path;
                        return (
                          <button
                            key={file.path}
                            onClick={() => setSelectedFilePath(file.path)}
                            className={`w-full text-left p-2 rounded-lg border transition-all flex flex-col gap-1 ${
                              isSelected
                                ? 'bg-[#004E72]/25 border-[#004E72] text-[#F9F9F9]'
                                : 'bg-[#092634]/40 border-transparent text-[#F9F9F9]/80 hover:bg-[#092634]/80 hover:border-[#F9F9F9]/10'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              {renderChangeTypeIcon(file.changeType)}
                              <span className="text-xs font-mono font-medium truncate flex-1" title={file.path}>
                                {file.path}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[10px] font-mono text-[#F9F9F9]/40 pl-5">
                              <div className="flex items-center gap-1.5">
                                {file.additions > 0 && (
                                  <span className="text-[#F9F9F9] font-semibold">+{file.additions}</span>
                                )}
                                {file.deletions > 0 && (
                                  <span className="text-[#FF6E42] font-semibold">-{file.deletions}</span>
                                )}
                                {file.isStaged && <span className="text-[#004E72] font-semibold">[staged]</span>}
                                {file.isUntracked && <span className="text-[#FF6E42]">[untracked]</span>}
                              </div>
                              {renderProvenanceBadge(file.provenance)}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Panel: Unified Diff View */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#090B0D] overflow-hidden">
                  {selectedFile ? (
                    <>
                      {/* Selected File Details Bar */}
                      <div className="px-4 py-2.5 bg-[#092634]/40 border-b border-[#F9F9F9]/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {renderChangeTypeIcon(selectedFile.changeType)}
                          <span className="text-xs font-mono font-bold truncate text-[#F9F9F9]">
                            {selectedFile.path}
                          </span>
                          {selectedFile.oldPath && (
                            <span className="text-[11px] font-mono text-[#F9F9F9]/40 truncate">
                              (renamed from {selectedFile.oldPath})
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 font-mono text-xs">
                            {selectedFile.additions > 0 && (
                              <span className="text-[#F9F9F9] font-semibold">+{selectedFile.additions}</span>
                            )}
                            {selectedFile.deletions > 0 && (
                              <span className="text-[#FF6E42] font-semibold">-{selectedFile.deletions}</span>
                            )}
                          </div>
                          {renderProvenanceBadge(selectedFile.provenance)}
                        </div>
                      </div>

                      {/* Attribution Note */}
                      {selectedFile.attributionReason && (
                        <div className="px-4 py-1.5 bg-[#092634]/20 border-b border-[#F9F9F9]/5 text-[11px] font-mono text-[#F9F9F9]/60 flex items-center gap-1.5">
                          <HelpCircle size={12} className="text-[#004E72] shrink-0" />
                          <span>{selectedFile.attributionReason}</span>
                        </div>
                      )}

                      {/* Diff View / Omission Banner */}
                      <div className="flex-1 overflow-auto p-3 font-mono text-xs">
                        {selectedFile.omittedReason ? (
                          <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
                            {selectedFile.omittedReason === 'sensitive_file' ? (
                              <>
                                <ShieldAlert size={36} className="text-[#FF6E42] mb-3" />
                                <h4 className="text-sm font-bold text-[#F9F9F9] mb-1">
                                  Diff Omitted for Security
                                </h4>
                                <p className="text-xs text-[#F9F9F9]/60">
                                  Diff omitted: File may contain sensitive credentials or secrets.
                                </p>
                              </>
                            ) : selectedFile.omittedReason === 'binary' ? (
                              <>
                                <FileCode size={36} className="text-[#004E72] mb-3" />
                                <h4 className="text-sm font-bold text-[#F9F9F9] mb-1">Binary File</h4>
                                <p className="text-xs text-[#F9F9F9]/60">
                                  Diff omitted: Binary file detected.
                                </p>
                              </>
                            ) : selectedFile.omittedReason === 'large_file' ? (
                              <>
                                <AlertTriangle size={36} className="text-[#FF6E42] mb-3" />
                                <h4 className="text-sm font-bold text-[#F9F9F9] mb-1">Large File</h4>
                                <p className="text-xs text-[#F9F9F9]/60">
                                  Diff omitted: File exceeds display threshold.
                                </p>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={36} className="text-[#004E72] mb-3" />
                                <h4 className="text-sm font-bold text-[#F9F9F9] mb-1">Empty Diff</h4>
                                <p className="text-xs text-[#F9F9F9]/60">
                                  No textual changes detected between baselines.
                                </p>
                              </>
                            )}
                          </div>
                        ) : selectedFile.hunks && selectedFile.hunks.length > 0 ? (
                        <div className="space-y-4">
                          {selectedFile.hunks.map((hunk, hIdx) => (
                            <div key={hIdx} className="border border-[#F9F9F9]/10 rounded overflow-hidden">
                              {/* Hunk Header */}
                              <div className="px-3 py-1 bg-[#004E72]/40 text-[#F9F9F9] font-bold text-[11px] border-b border-[#F9F9F9]/10">
                                {hunk.header}
                              </div>

                              {/* Hunk Lines */}
                              <table className="w-full border-collapse">
                                <tbody>
                                  {hunk.lines.map((line, lIdx) => {
                                    const isAdd = line.type === 'addition';
                                    const isDel = line.type === 'deletion';

                                    return (
                                      <tr
                                        key={lIdx}
                                        className={
                                          isAdd
                                            ? 'bg-[#004E72]/30 text-[#F9F9F9]'
                                            : isDel
                                            ? 'bg-[#FF6E42]/20 text-[#FF6E42]'
                                            : 'hover:bg-[#F9F9F9]/5 text-[#F9F9F9]/80'
                                        }
                                      >
                                        <td className="w-10 px-2 py-0.5 text-right text-[10px] text-[#F9F9F9]/30 select-none border-r border-[#F9F9F9]/5">
                                          {line.oldLineNumber ?? ''}
                                        </td>
                                        <td className="w-10 px-2 py-0.5 text-right text-[10px] text-[#F9F9F9]/30 select-none border-r border-[#F9F9F9]/5">
                                          {line.newLineNumber ?? ''}
                                        </td>
                                        <td className="w-5 px-1 py-0.5 text-center select-none font-bold">
                                          {isAdd ? '+' : isDel ? '-' : ' '}
                                        </td>
                                        <td className="px-2 py-0.5 whitespace-pre overflow-x-auto">
                                          {line.content}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-[#F9F9F9]/40 text-xs">
                          No diff available for this file.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-[#F9F9F9]/40 text-xs">
                    Select a changed file from the sidebar to inspect its diff.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
};
