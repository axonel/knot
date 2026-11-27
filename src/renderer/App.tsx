import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { ProcessManager } from './components/DesktopCommander/ProcessManager.js';
import { ProjectManager } from './components/ProjectManager/ProjectManager.js';
import { BridgeManager } from './components/Bridge/BridgeManager.js';
import { AntigravityWorkspace } from './components/Antigravity/AntigravityWorkspace.js';
import { CollaborationWorkspace } from './components/Workspace/CollaborationWorkspace.js';
import { Layers, ShieldCheck, Lock } from 'lucide-react';
import { isEditableTarget } from './utils/keyboardUtils.js';
import { ClickSpark, SpotlightCard } from './components/ReactBits/index.js';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('workspace');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [workspaceCenterView, setWorkspaceCenterView] = useState<'conversation' | 'context' | 'timeline'>('conversation');

  useEffect(() => {
    const handleResize = () => {
      // Auto-collapse sidebar when screen width narrows below 1100px
      if (window.innerWidth < 1100) {
        setIsSidebarCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleGlobalNav = (e: KeyboardEvent) => {
      if (e.repeat || isEditableTarget(e.target)) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key === '1') {
        setWorkspaceCenterView('conversation');
        setCurrentTab('workspace');
      } else if (e.key === '2') {
        setWorkspaceCenterView('context');
        setCurrentTab('workspace');
      } else if (e.key === '3') {
        setWorkspaceCenterView('timeline');
        setCurrentTab('workspace');
      }
    };

    window.addEventListener('keydown', handleGlobalNav);
    return () => window.removeEventListener('keydown', handleGlobalNav);
  }, []);

  return (
    <ClickSpark sparkColor="#E05252" sparkSize={6} sparkRadius={22}>
      <div className="flex h-screen w-screen overflow-hidden bg-[#000000] text-[#F0F0ED] font-sans relative selection:bg-[#E05252]/30 selection:text-[#F0F0ED]">
        {/* Navigation Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          isFocusMode={isFocusMode}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
          {!isFocusMode && <Header />}

          <main className={`flex-1 overflow-hidden ${currentTab === 'workspace' ? 'p-0 flex flex-col' : 'overflow-y-auto p-6 space-y-6'}`}>
            {currentTab === 'workspace' ? (
              <CollaborationWorkspace
                isFocusMode={isFocusMode}
                onToggleFocusMode={() => setIsFocusMode((prev) => !prev)}
                centerView={workspaceCenterView}
                onCenterViewChange={setWorkspaceCenterView}
              />
            ) : currentTab === 'projects' ? (
              <section>
                <ProjectManager />
              </section>
            ) : currentTab === 'antigravity' ? (
              <section>
                <AntigravityWorkspace />
              </section>
            ) : currentTab === 'bridge' ? (
              <section>
                <BridgeManager />
              </section>
            ) : (
              <>
                {/* Main Desktop Commander Process Manager Section */}
                <section>
                  <ProcessManager />
                </section>

                {/* Architecture Overview Section */}
                <section className="rounded-xl border border-[#292C2F] bg-[#1B1D1F] p-5 space-y-3 shadow-lg">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#A5A5A0] font-mono">
                    <Layers size={14} className="text-[#E05252]" />
                    <span>Multi-Agent Architecture</span>
                  </div>
                  <p className="text-xs text-[#F0F0ED]/90 leading-relaxed font-normal">
                    <strong className="text-[#F0F0ED]">Knot</strong> connects the user's existing ChatGPT browser session to their local development environment and Antigravity CLI. ChatGPT acts as planner and orchestrator; Antigravity executes implementation tasks and reports results.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-[11px] text-[#A5A5A0]">
                    <SpotlightCard
                      spotlightColor="rgba(224, 82, 82, 0.1)"
                      className="p-3 rounded-lg bg-[#000000] border border-[#292C2F] space-y-1"
                    >
                      <div className="flex items-center gap-1.5 text-[#E05252] font-semibold text-xs">
                        <ShieldCheck size={13} />
                        <span>Process Isolation</span>
                      </div>
                      <p className="text-[#A5A5A0] leading-snug">
                        Strict signal handling, isolated cgroups and PID tracking prevent orphan background processes.
                      </p>
                    </SpotlightCard>
                    <SpotlightCard
                      spotlightColor="rgba(224, 82, 82, 0.1)"
                      className="p-3 rounded-lg bg-[#000000] border border-[#292C2F] space-y-1"
                    >
                      <div className="flex items-center gap-1.5 text-[#E05252] font-semibold text-xs">
                        <Lock size={13} />
                        <span>Log Sanitization</span>
                      </div>
                      <p className="text-[#A5A5A0] leading-snug">
                        Environment variables, credentials and authorization tokens are automatically scrubbed at the boundary.
                      </p>
                    </SpotlightCard>
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      </div>
    </ClickSpark>
  );
};

export default App;
