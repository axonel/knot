import React, { useState } from 'react';
import {
  ShieldAlert,
  Terminal,
  FileCode,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  Workflow,
  ListChecks,
} from 'lucide-react';
import type { Task } from '../../../shared/types.js';

interface TaskApprovalPreviewProps {
  task: Task;
  defaultExpanded?: boolean;
}

/**
 * Extracts declared shell commands strictly from task.payload or description code blocks.
 * Grounded in actual data — returns null if none were declared.
 */
function extractDeclaredCommands(task: Task): string[] | null {
  const commands: string[] = [];

  const payload = task.payload;
  if (payload) {
    if (Array.isArray(payload.commands)) {
      for (const cmd of payload.commands) {
        if (typeof cmd === 'string' && cmd.trim()) commands.push(cmd.trim());
      }
    } else if (typeof payload.command === 'string' && payload.command.trim()) {
      commands.push(payload.command.trim());
    } else if (typeof payload.cmd === 'string' && payload.cmd.trim()) {
      commands.push(payload.cmd.trim());
    }
  }

  // Also check code blocks in description if payload had none
  if (commands.length === 0 && task.description) {
    const codeBlockRegex = /```(?:bash|sh|shell|zsh)?\r?\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = codeBlockRegex.exec(task.description)) !== null) {
      const block = match[1]?.trim();
      if (block) {
        // Add non-empty lines
        const lines = block.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
        if (lines.length > 0) {
          commands.push(...lines);
        }
      }
    }
  }

  return commands.length > 0 ? commands : null;
}

/**
 * Extracts declared file paths strictly from task.payload or gitBoundary.
 * Grounded in actual data — returns null if none were declared.
 */
function extractDeclaredFiles(task: Task): string[] | null {
  const files: Set<string> = new Set();

  const payload = task.payload as Record<string, unknown> | null | undefined;
  if (payload) {
    const candidateArrays = [
      payload.files,
      payload.affectedFiles,
      payload.paths,
      (payload.executionDetails as Record<string, unknown> | undefined)?.changedFiles,
    ];

    for (const arr of candidateArrays) {
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === 'string' && item.trim()) {
            files.add(item.trim());
          }
        }
      }
    }
  }

  if (task.gitBoundary?.start) {
    const { unstagedFiles = [], untrackedFiles = [] } = task.gitBoundary.start;
    for (const f of unstagedFiles) if (f) files.add(f);
    for (const f of untrackedFiles) if (f) files.add(f);
  }

  return files.size > 0 ? Array.from(files) : null;
}

export const TaskApprovalPreview: React.FC<TaskApprovalPreviewProps> = ({
  task,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const proposedCommands = extractDeclaredCommands(task);
  const affectedFiles = extractDeclaredFiles(task);

  // Risk & Policy evaluation
  const policyCategory =
    (task.payload?.policyCategory as string) ||
    (task.payload?.riskLevel as string) ||
    (task.payload?.riskCategory as string) ||
    (task.status === 'awaiting_approval' ? 'approval_required' : 'standard');

  const policyReason =
    (task.payload?.policyReason as string) ||
    (task.payload?.reason as string) ||
    null;

  const executionMode = task.executionMode || (task.payload?.executionMode as string) || 'direct';

  const isSensitive =
    policyCategory.toLowerCase() === 'sensitive' ||
    task.priority === 'urgent' ||
    Boolean(policyReason);

  return (
    <div
      data-testid={`approval-preview-${task.id}`}
      className="rounded-lg border border-[#292C2F] bg-[#000000] overflow-hidden text-xs my-1.5 shadow-sm"
    >
      {/* Header Toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        data-testid={`approval-preview-toggle-${task.id}`}
        className="w-full px-3 py-2 flex items-center justify-between bg-[#1B1D1F] hover:bg-[#292C2F] text-[#F0F0ED] transition-all cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E05252]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert
            size={14}
            className={isSensitive ? 'text-[#E05252] shrink-0' : 'text-[#A5A5A0] shrink-0'}
          />
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#F0F0ED]">
            Pre-Execution Proposal Preview
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
              isSensitive
                ? 'bg-[#292C2F] text-[#E05252] border border-[#E05252]/40'
                : 'bg-[#292C2F] text-[#A5A5A0] border border-[#292C2F]'
            }`}
          >
            {policyCategory}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[#A5A5A0] shrink-0 text-[11px] font-mono">
          <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Expandable Preview Details */}
      {isExpanded && (
        <div className="p-3 space-y-3 border-t border-[#292C2F] bg-[#000000]">
          {/* Explicit Unexecuted Proposal Disclaimer */}
          <div
            data-testid="preview-proposal-disclaimer"
            className="flex items-start gap-2 p-2.5 rounded bg-[#1B1D1F] border border-[#E05252]/40 text-[11px] text-[#F0F0ED]"
          >
            <Info size={13} className="shrink-0 mt-0.5 text-[#E05252]" />
            <div className="space-y-0.5">
              <span className="font-bold font-mono tracking-wide uppercase text-[#E05252] block text-[10px]">
                Planned Proposal &bull; Unexecuted
              </span>
              <p className="text-[#A5A5A0] leading-relaxed">
                The operations below represent planned instructions that have not yet been executed.
                Verify all parameters before authorizing execution.
              </p>
            </div>
          </div>

          {/* Policy Reason (if evaluated) */}
          {policyReason && (
            <div className="p-2 rounded bg-[#1B1D1F] border border-[#E05252]/30 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-[#E05252]">
                <AlertTriangle size={12} />
                <span>Approval Policy Trigger:</span>
              </div>
              <p className="text-[#F0F0ED] font-mono text-[11px] pl-4">{policyReason}</p>
            </div>
          )}

          {/* Execution Mode & Priority */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[#A5A5A0] p-2 rounded bg-[#1B1D1F] border border-[#292C2F]">
            <div className="flex items-center gap-1.5">
              <Workflow size={12} className="text-[#E05252]" />
              <span>Mode: <strong className="text-[#F0F0ED]">{executionMode}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-[#E05252]" />
              <span>Priority: <strong className="text-[#F0F0ED]">{task.priority || 'normal'}</strong></span>
            </div>
          </div>

          {/* Proposed Commands */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-[#A5A5A0] uppercase tracking-wide">
              <Terminal size={12} className="text-[#E05252]" />
              <span>Proposed Shell Commands:</span>
            </div>
            {proposedCommands && proposedCommands.length > 0 ? (
              <div
                data-testid="preview-proposed-commands"
                className="p-2.5 rounded bg-[#1B1D1F] border border-[#292C2F] space-y-1 overflow-x-auto"
              >
                {proposedCommands.map((cmd, idx) => (
                  <div key={idx} className="font-mono text-[11px] text-[#F0F0ED] flex items-start gap-2">
                    <span className="text-[#E05252] select-none font-bold">$</span>
                    <code className="text-[#F0F0ED]/90 whitespace-pre">{cmd}</code>
                  </div>
                ))}
              </div>
            ) : (
              <div
                data-testid="preview-no-commands"
                className="p-2 rounded bg-[#1B1D1F] border border-[#292C2F] text-[11px] font-mono text-[#A5A5A0] italic"
              >
                No specific shell commands declared in task payload
              </div>
            )}
          </div>

          {/* Affected File Paths */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-[#A5A5A0] uppercase tracking-wide">
              <FileCode size={12} className="text-[#E05252]" />
              <span>Declared File Paths:</span>
            </div>
            {affectedFiles && affectedFiles.length > 0 ? (
              <ul
                data-testid="preview-affected-files"
                className="p-2.5 rounded bg-[#1B1D1F] border border-[#292C2F] space-y-1 text-[11px] font-mono text-[#F0F0ED] max-h-36 overflow-y-auto"
              >
                {affectedFiles.map((file, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E05252] shrink-0" />
                    <span className="truncate">{file}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div
                data-testid="preview-no-files"
                className="p-2 rounded bg-[#1B1D1F] border border-[#292C2F] text-[11px] font-mono text-[#A5A5A0] italic"
              >
                No specific file paths declared in task payload
              </div>
            )}
          </div>

          {/* Description & Scope */}
          {task.description && (
            <div className="space-y-1 pt-1">
              <span className="text-[10px] font-mono uppercase text-[#A5A5A0]/80 font-bold">
                Task Scope / Description:
              </span>
              <p className="text-[11px] text-[#F0F0ED] leading-relaxed bg-[#1B1D1F] p-2.5 rounded border border-[#292C2F] whitespace-pre-wrap font-sans">
                {task.description}
              </p>
            </div>
          )}

          {/* Acceptance Criteria */}
          {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center gap-1 text-[10px] font-mono uppercase text-[#A5A5A0]/80 font-bold">
                <ListChecks size={11} className="text-[#E05252]" />
                <span>Declared Acceptance Criteria:</span>
              </div>
              <ul className="text-[11px] text-[#A5A5A0] space-y-1 pl-1">
                {task.acceptanceCriteria.map((criterion, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E05252] mt-1 shrink-0" />
                    <span className="text-[#F0F0ED]">{criterion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
