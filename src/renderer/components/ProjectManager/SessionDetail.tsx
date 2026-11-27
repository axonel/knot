import React, { useState, useEffect, useCallback } from 'react';
import type {
  Session,
  Message,
  Task,
  EventItem,
  SessionStatus,
  MessageSender,
  TaskStatus,
} from '../../../shared/types.js';
import { StatusPill } from './StatusPill.js';
import {
  ArrowLeft,
  MessageSquare,
  ListTodo,
  Activity,
  Send,
  Plus,
  Play,
  Pause,
  CheckCircle2,
  Archive,
  ArchiveRestore,
  Clock,
  AlertCircle,
  X,
  User,
  Bot,
  Terminal,
} from 'lucide-react';

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
  onSessionUpdated: () => void;
}

export const SessionDetail: React.FC<SessionDetailProps> = ({
  sessionId,
  onBack,
  onSessionUpdated,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activeTab, setActiveTab] = useState<'messages' | 'tasks' | 'events'>('messages');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New message form state
  const [msgSender, setMsgSender] = useState<MessageSender>('user');
  const [msgContent, setMsgContent] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // New task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAgent, setTaskAgent] = useState('antigravity');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // New event form state
  const [eventType, setEventType] = useState('checkpoint');
  const [eventActor, setEventActor] = useState('user');
  const [isRecordingEvent, setIsRecordingEvent] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [sess, msgList, taskList, eventList] = await Promise.all([
        window.knotApi?.sessions.get(sessionId),
        window.knotApi?.messages.list(sessionId, { limit: 100 }),
        window.knotApi?.tasks.list(sessionId),
        window.knotApi?.events.list(sessionId, { limit: 100 }),
      ]);

      setSession(sess || null);
      setMessages(msgList || []);
      setTasks(taskList || []);
      setEvents(eventList || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load session details: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusTransition = async (targetStatus: SessionStatus) => {
    try {
      await window.knotApi?.sessions.updateStatus(sessionId, targetStatus);
      loadData();
      onSessionUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Status update failed: ${msg}`);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgContent.trim()) return;

    setIsSendingMsg(true);
    setError(null);

    try {
      await window.knotApi?.messages.append({
        sessionId,
        sender: msgSender,
        contentMarkdown: msgContent.trim(),
      });
      setMsgContent('');
      loadData();
      onSessionUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to send message: ${msg}`);
    } finally {
      setIsSendingMsg(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    setIsCreatingTask(true);
    setError(null);

    try {
      await window.knotApi?.tasks.create({
        sessionId,
        title: taskTitle.trim(),
        description: taskDesc.trim() || undefined,
        assignedTo: taskAgent.trim() || undefined,
      });
      setTaskTitle('');
      setTaskDesc('');
      loadData();
      onSessionUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to create task: ${msg}`);
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: TaskStatus) => {
    try {
      await window.knotApi?.tasks.updateStatus(taskId, status);
      loadData();
      onSessionUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to update task: ${msg}`);
    }
  };

  const handleRecordEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventType.trim()) return;

    setIsRecordingEvent(true);
    setError(null);

    try {
      await window.knotApi?.events.append({
        sessionId,
        eventType: eventType.trim(),
        actor: eventActor.trim(),
        data: { recordedFromUi: true, timestamp: new Date().toISOString() },
      });
      setEventType('checkpoint');
      loadData();
      onSessionUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to record event: ${msg}`);
    } finally {
      setIsRecordingEvent(false);
    }
  };

  const renderSenderIcon = (sender: MessageSender) => {
    switch (sender) {
      case 'user':
        return <User size={14} className="text-[#F0F0ED]" />;
      case 'chatgpt':
        return <Bot size={14} className="text-[#E05252]" />;
      case 'antigravity':
        return <Bot size={14} className="text-[#292C2F]" />;
      case 'system':
      default:
        return <Terminal size={14} className="text-[#F0F0ED]/60" />;
    }
  };

  if (isLoading && !session) {
    return (
      <div className="p-8 text-center text-xs text-[#F0F0ED]/40 font-mono">
        Loading session data...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-xs text-[#E05252]">Session not found.</p>
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded-lg text-xs bg-[#1B1D1F] border border-[#F0F0ED]/10 text-[#F0F0ED]"
        >
          Return to Project
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Session Header */}
      <div className="space-y-3 pb-5 border-b border-[#F0F0ED]/10">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F0F0ED]/60 hover:text-[#F0F0ED] transition-colors cursor-pointer"
        >
          <ArrowLeft size={14} />
          <span>Back to Sessions</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-[#F0F0ED]">
                {session.title}
              </h2>
              <StatusPill status={session.status} type="session" />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#F0F0ED]/50 font-mono">
              <span>ID: <code className="text-[#F0F0ED]/70">{session.id.slice(0, 8)}</code></span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                <span>Last active {new Date(session.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </span>
              <span>Started {session.startedAt ? new Date(session.startedAt).toLocaleDateString() : 'N/A'}</span>
            </div>
          </div>

          {/* Lifecycle Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {session.status === 'active' && (
              <>
                <button
                  onClick={() => handleStatusTransition('paused')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#000000] border border-[#E05252]/40 text-[#E05252] hover:bg-[#E05252]/10 transition-colors cursor-pointer"
                >
                  <Pause size={12} />
                  <span>Pause</span>
                </button>
                <button
                  onClick={() => handleStatusTransition('completed')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#000000] border border-[#292C2F] text-[#F0F0ED]/80 hover:bg-[#292C2F]/20 transition-colors cursor-pointer"
                >
                  <CheckCircle2 size={12} />
                  <span>Complete</span>
                </button>
              </>
            )}

            {session.status === 'paused' && (
              <>
                <button
                  onClick={() => handleStatusTransition('active')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#292C2F] text-[#F0F0ED] hover:bg-[#292C2F]/80 transition-colors cursor-pointer"
                >
                  <Play size={12} />
                  <span>Resume</span>
                </button>
                <button
                  onClick={() => handleStatusTransition('completed')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#000000] border border-[#292C2F] text-[#F0F0ED]/80 hover:bg-[#292C2F]/20 transition-colors cursor-pointer"
                >
                  <CheckCircle2 size={12} />
                  <span>Complete</span>
                </button>
              </>
            )}

            {session.status === 'completed' && (
              <>
                <button
                  onClick={() => handleStatusTransition('active')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#000000] border border-[#292C2F] text-[#F0F0ED]/80 hover:bg-[#292C2F]/20 transition-colors cursor-pointer"
                >
                  <Play size={12} />
                  <span>Reopen</span>
                </button>
                <button
                  onClick={() => handleStatusTransition('archived')}
                  className="p-1.5 rounded-lg text-[#F0F0ED]/40 hover:text-[#F0F0ED] hover:bg-[#000000] transition-colors cursor-pointer"
                >
                  <Archive size={13} />
                </button>
              </>
            )}

            {session.status === 'archived' && (
              <button
                onClick={() => handleStatusTransition('active')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[#000000] border border-[#F0F0ED]/20 text-[#F0F0ED]/80 hover:bg-[#000000]/80 transition-colors cursor-pointer"
              >
                <ArchiveRestore size={12} />
                <span>Unarchive</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-[#1B1D1F] border border-[#E05252]/50 text-xs text-[#E05252]">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-[#F0F0ED]/40 hover:text-[#F0F0ED] transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Navigation Tabs for Session Data */}
      <div className="flex items-center gap-2 border-b border-[#F0F0ED]/10 pb-2">
        <button
          onClick={() => setActiveTab('messages')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'messages'
              ? 'bg-[#292C2F] text-[#F0F0ED] font-semibold'
              : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED] hover:bg-[#1B1D1F]'
          }`}
        >
          <MessageSquare size={14} />
          <span>Messages ({messages.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'tasks'
              ? 'bg-[#292C2F] text-[#F0F0ED] font-semibold'
              : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED] hover:bg-[#1B1D1F]'
          }`}
        >
          <ListTodo size={14} />
          <span>Tasks ({tasks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'events'
              ? 'bg-[#292C2F] text-[#F0F0ED] font-semibold'
              : 'text-[#F0F0ED]/60 hover:text-[#F0F0ED] hover:bg-[#1B1D1F]'
          }`}
        >
          <Activity size={14} />
          <span>Events ({events.length})</span>
        </button>
      </div>

      {/* Tab 1: Messages View */}
      {activeTab === 'messages' && (
        <div className="space-y-4">
          <div className="space-y-3 min-h-[160px]">
            {messages.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#F0F0ED]/40 border border-dashed border-[#F0F0ED]/10 rounded-xl">
                No messages recorded in this session yet. Use the prompt below to append a note or message.
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className="p-3.5 rounded-xl border border-[#F0F0ED]/10 bg-[#1B1D1F]/50 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-[#000000] border border-[#F0F0ED]/10">
                        {renderSenderIcon(msg.sender)}
                      </div>
                      <span className="font-semibold uppercase tracking-wider text-[11px] text-[#F0F0ED]">
                        {msg.sender}
                      </span>
                      <span className="font-mono text-[10px] text-[#292C2F] font-bold">
                        #{msg.sequence}
                      </span>
                    </div>

                    <span className="text-[10px] font-mono text-[#F0F0ED]/40">
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="text-xs text-[#F0F0ED]/90 font-mono whitespace-pre-wrap leading-relaxed pl-7">
                    {msg.contentMarkdown}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Message Form */}
          <form
            onSubmit={handleSendMessage}
            className="p-3.5 rounded-xl border border-[#F0F0ED]/10 bg-[#1B1D1F] space-y-3"
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-[#F0F0ED]/80">Append Message / Test Note</span>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-[#F0F0ED]/50">Sender:</label>
                <select
                  value={msgSender}
                  onChange={(e) => setMsgSender(e.target.value as MessageSender)}
                  className="px-2 py-1 rounded-md bg-[#000000] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED] focus:outline-hidden"
                >
                  <option value="user">User</option>
                  <option value="chatgpt">ChatGPT</option>
                  <option value="antigravity">Antigravity</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>

            <textarea
              rows={2}
              placeholder="Type message content or notes here..."
              value={msgContent}
              onChange={(e) => setMsgContent(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#000000] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED] placeholder:text-[#F0F0ED]/30 focus:border-[#292C2F] focus:outline-hidden font-mono"
            />

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSendingMsg || !msgContent.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#292C2F] text-[#F0F0ED] hover:bg-[#292C2F]/80 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                <Send size={13} />
                <span>{isSendingMsg ? 'Appending...' : 'Send Message'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Tasks View */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="space-y-2.5">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#F0F0ED]/40 border border-dashed border-[#F0F0ED]/10 rounded-xl">
                No tasks assigned to this session yet.
              </div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3 rounded-xl border border-[#F0F0ED]/10 bg-[#1B1D1F]/50 flex items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#F0F0ED] truncate">
                        {task.title}
                      </span>
                      <StatusPill status={task.status} type="task" />
                      {task.assignedTo && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#000000] text-[#292C2F] border border-[#292C2F]/30">
                          @{task.assignedTo}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-[11px] text-[#F0F0ED]/60 truncate">{task.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {task.status !== 'running' && task.status !== 'succeeded' && (
                      <button
                        onClick={() => handleUpdateTaskStatus(task.id, 'running')}
                        className="px-2 py-1 rounded text-[11px] bg-[#292C2F]/40 hover:bg-[#292C2F] text-[#F0F0ED] transition-colors"
                      >
                        Start
                      </button>
                    )}
                    {task.status !== 'succeeded' && (
                      <button
                        onClick={() => handleUpdateTaskStatus(task.id, 'succeeded')}
                        className="px-2 py-1 rounded text-[11px] bg-[#000000] border border-[#292C2F] text-[#F0F0ED]/80 hover:bg-[#292C2F]/20 transition-colors"
                      >
                        Complete
                      </button>
                    )}
                    {task.status !== 'failed' && task.status !== 'succeeded' && (
                      <button
                        onClick={() => handleUpdateTaskStatus(task.id, 'failed')}
                        className="px-2 py-1 rounded text-[11px] bg-[#000000] border border-[#E05252]/40 text-[#E05252] hover:bg-[#E05252]/10 transition-colors"
                      >
                        Fail
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Task Form */}
          <form
            onSubmit={handleCreateTask}
            className="p-3.5 rounded-xl border border-[#F0F0ED]/10 bg-[#1B1D1F] space-y-3"
          >
            <div className="text-xs font-semibold text-[#F0F0ED]/80">Create Task</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Task title (e.g. Run test suite)"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-[#000000] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED] placeholder:text-[#F0F0ED]/30 focus:border-[#292C2F] focus:outline-hidden"
              />
              <select
                value={taskAgent}
                onChange={(e) => setTaskAgent(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-[#000000] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED] focus:outline-hidden"
              >
                <option value="antigravity">Assign: Antigravity</option>
                <option value="chatgpt">Assign: ChatGPT</option>
                <option value="knot">Assign: Knot Coordinator</option>
              </select>
            </div>
            <input
              type="text"
              placeholder="Task description (optional)"
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-[#000000] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED] placeholder:text-[#F0F0ED]/30 focus:border-[#292C2F] focus:outline-hidden"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isCreatingTask || !taskTitle.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#292C2F] text-[#F0F0ED] hover:bg-[#292C2F]/80 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                <Plus size={13} />
                <span>{isCreatingTask ? 'Adding...' : 'Add Task'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: Events View */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          <div className="space-y-2 font-mono text-xs">
            {events.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#F0F0ED]/40 border border-dashed border-[#F0F0ED]/10 rounded-xl">
                No telemetry events logged yet.
              </div>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 rounded-lg border border-[#F0F0ED]/10 bg-[#000000] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-[#292C2F] font-semibold uppercase">
                      [{ev.eventType}]
                    </span>
                    <span className="text-[#F0F0ED]/80 text-[11px]">by {ev.actor}</span>
                  </div>

                  <span className="text-[10px] text-[#F0F0ED]/40">
                    {new Date(ev.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Record Event Form */}
          <form
            onSubmit={handleRecordEvent}
            className="p-3.5 rounded-xl border border-[#F0F0ED]/10 bg-[#1B1D1F] flex items-center gap-3"
          >
            <input
              type="text"
              placeholder="Event type (e.g. handshake, checkpoint)"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg bg-[#000000] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED] placeholder:text-[#F0F0ED]/30 focus:border-[#292C2F] focus:outline-hidden font-mono"
            />
            <input
              type="text"
              placeholder="Actor"
              value={eventActor}
              onChange={(e) => setEventActor(e.target.value)}
              className="w-28 px-3 py-1.5 rounded-lg bg-[#000000] border border-[#F0F0ED]/10 text-xs text-[#F0F0ED] focus:outline-hidden font-mono"
            />
            <button
              type="submit"
              disabled={isRecordingEvent || !eventType.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#292C2F] text-[#F0F0ED] hover:bg-[#292C2F]/80 disabled:opacity-50 transition-colors shadow-sm cursor-pointer shrink-0"
            >
              <Plus size={13} />
              <span>Record</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
