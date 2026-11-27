import React, { useState, useEffect } from 'react';
import {
  Compass,
  FileCode2,
  GitPullRequest,
  CheckCircle2,
  Lightbulb,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import type { EventItem, Session } from '../../../shared/types.js';
import { SpotlightCard } from '../ReactBits/index.js';

interface ChatGptActivityPanelProps {
  session: Session | null;
  onRefresh?: () => void;
}

export const ChatGptActivityPanel: React.FC<ChatGptActivityPanelProps> = ({ session }) => {
  const [activities, setActivities] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadActivities = async () => {
    if (!session || !window.knotApi) {
      setActivities([]);
      return;
    }
    setLoading(true);
    try {
      const events = await window.knotApi.events.list(session.id, {
        eventType: 'chatgpt_activity',
        limit: 100,
      });
      setActivities(events);
    } catch (err) {
      console.error('[ChatGptActivityPanel] Failed to load activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const actDebounceTimer = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadActivities();

    if (!window.knotApi) return;

    const unlisten = window.knotApi.bridge.onEvent((evt) => {
      if (evt.type === 'activity-received') {
        if (actDebounceTimer.current) {
          clearTimeout(actDebounceTimer.current);
        }
        actDebounceTimer.current = setTimeout(() => {
          loadActivities();
        }, 150);
      }
    });

    return () => {
      if (actDebounceTimer.current) {
        clearTimeout(actDebounceTimer.current);
      }
      unlisten();
    };
  }, [session?.id]);

  const getCategoryBadge = (category?: string) => {
    switch (category?.toLowerCase()) {
      case 'repo_inspection':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#F0F0ED] border border-[#292C2F]">
            <Compass size={10} className="text-[#E05252]" /> Repo Inspection
          </span>
        );
      case 'code_review':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#E05252] border border-[#E05252]/30">
            <FileCode2 size={10} className="text-[#E05252]" /> Code Review
          </span>
        );
      case 'pr_review':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#F0F0ED] border border-[#292C2F]">
            <GitPullRequest size={10} className="text-[#E05252]" /> PR Review
          </span>
        );
      case 'planning':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#E05252] border border-[#E05252]/40">
            <Lightbulb size={10} className="text-[#E05252]" /> Planning
          </span>
        );
      case 'verification':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#F0F0ED] border border-emerald-500/30">
            <CheckCircle2 size={10} className="text-emerald-400" /> Verification
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#292C2F] text-[#A5A5A0] border border-[#292C2F]">
            Activity
          </span>
        );
    }
  };

  const filteredActivities = activities.filter((act) => {
    const data = act.data as Record<string, unknown> | undefined;
    const cat = String(data?.category || 'other').toLowerCase();
    if (selectedCategory !== 'all' && cat !== selectedCategory.toLowerCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const summary = String(data?.summary || '').toLowerCase();
      const ref = String(data?.reference || '').toLowerCase();
      return summary.includes(q) || ref.includes(q);
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-[#1B1D1F] border border-[#292C2F] rounded-xl overflow-hidden shadow-md">
      {/* Header */}
      <div className="px-4 py-3 bg-[#1B1D1F] border-b border-[#292C2F] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Compass size={16} className="text-[#E05252]" />
          <div>
            <h3 className="text-xs font-bold text-[#F0F0ED]">ChatGPT-Reported Activity</h3>
            <div className="text-[10px] text-[#A5A5A0] font-mono">
              Orchestrator inspection & planning
            </div>
          </div>
        </div>
        <button
          onClick={loadActivities}
          disabled={loading}
          title="Reload activities"
          className="p-1.5 rounded-lg bg-[#111213] border border-[#292C2F] text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F] transition-all text-xs cursor-pointer"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-2.5 bg-[#111213] border-b border-[#292C2F] space-y-2 shrink-0">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-2.5 text-[#A5A5A0]" />
          <input
            type="text"
            placeholder="Search activities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1B1D1F] border border-[#292C2F] rounded-lg pl-8 pr-2.5 py-1 text-xs text-[#F0F0ED] placeholder-[#A5A5A0]/40 focus:outline-none focus:border-[#E05252] font-sans"
          />
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-mono scrollbar-none">
          <Filter size={11} className="text-[#A5A5A0]/60 shrink-0 ml-0.5" />
          {['all', 'repo_inspection', 'code_review', 'pr_review', 'planning', 'verification'].map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-0.5 rounded whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[#292C2F] text-[#F0F0ED] font-bold border border-[#E05252]/40'
                    : 'bg-[#1B1D1F] text-[#A5A5A0] hover:text-[#F0F0ED] hover:bg-[#292C2F]/50 border border-transparent'
                }`}
              >
                {cat === 'all'
                  ? 'All'
                  : cat === 'repo_inspection'
                  ? 'Inspection'
                  : cat === 'code_review'
                  ? 'Review'
                  : cat === 'pr_review'
                  ? 'PR'
                  : cat === 'planning'
                  ? 'Plan'
                  : 'Verify'}
              </button>
            )
          )}
        </div>
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-[#111213]">
        {!session ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#A5A5A0] text-xs">
            Select a session to view activity.
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#A5A5A0] text-xs">
            <Compass size={24} className="mb-2 text-[#E05252] opacity-50" />
            <p className="font-semibold text-[#F0F0ED]">No activity reports yet</p>
            <p className="text-[11px] mt-1 max-w-xs text-[#A5A5A0]">
              When ChatGPT inspects repositories, reviews PRs or drafts plans, it writes activity reports here.
            </p>
          </div>
        ) : (
          filteredActivities.map((act) => {
            const data = (act.data || {}) as Record<string, unknown>;
            const category = String(data.category || 'other');
            const reference = data.reference ? String(data.reference) : null;
            const summary = String(data.summary || '');

            return (
              <SpotlightCard
                key={act.id}
                spotlightColor="rgba(224, 82, 82, 0.08)"
                className="p-3 rounded-lg bg-[#1B1D1F] border border-[#292C2F] space-y-1.5 transition-all hover:border-[#E05252]/40"
              >
                {/* Header Row */}
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {getCategoryBadge(category)}
                    {reference && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#111213] text-[#F0F0ED]/90 border border-[#292C2F]">
                        <ExternalLink size={9} className="text-[#E05252]" />
                        {reference}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-[#A5A5A0]">
                    {act.createdAt ? new Date(act.createdAt).toLocaleTimeString() : ''}
                  </span>
                </div>

                {/* Summary Text */}
                <div className="text-xs text-[#F0F0ED]/90 leading-relaxed font-sans whitespace-pre-wrap">
                  {summary}
                </div>
              </SpotlightCard>
            );
          })
        )}
      </div>
    </div>
  );
};
