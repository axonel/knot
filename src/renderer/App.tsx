import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { ProcessManager } from './components/DesktopCommander/ProcessManager.js';
import { ProjectManager } from './components/ProjectManager/ProjectManager.js';
import { BridgeManager } from './components/Bridge/BridgeManager.js';
import { AntigravityWorkspace } from './components/Antigravity/AntigravityWorkspace.js';
import { CollaborationWorkspace } from './components/Workspace/CollaborationWorkspace.js';
import { Layers } from 'lucide-react';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('workspace');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090B0D] text-[#F9F9F9] font-sans">
      {/* Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        isFocusMode={isFocusMode}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!isFocusMode && <Header />}

        <main className={`flex-1 overflow-hidden ${currentTab === 'workspace' ? 'p-0 flex flex-col' : 'overflow-y-auto p-6 space-y-6'}`}>
          {currentTab === 'workspace' ? (
            <CollaborationWorkspace
              isFocusMode={isFocusMode}
              onToggleFocusMode={() => setIsFocusMode((prev) => !prev)}
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
              <section className="rounded-xl border border-[#F9F9F9]/10 bg-[#092634]/50 p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F9F9F9]/60 font-mono">
                  <Layers size={14} className="text-[#004E72]" />
                  <span>Multi-Agent Architecture</span>
                </div>
                <p className="text-xs text-[#F9F9F9]/80 leading-relaxed font-normal">
                  <strong className="text-[#F9F9F9]">Knot</strong> connects the user's existing ChatGPT browser session to their local development environment and Antigravity CLI. ChatGPT is the sole orchestrator and planning agent; Antigravity executes implementation tasks and reports results.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2 text-[11px] text-[#F9F9F9]/60">
                  <div className="p-2.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10">
                    <span className="text-[#004E72] font-semibold block mb-0.5">Process Isolation</span>
                    Strict signal handling and PID tracking prevent orphan processes.
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#090B0D] border border-[#FF6E42]">
                    <span className="text-[#FF6E42] font-semibold block mb-0.5">Log Sanitization</span>
                    All credentials and authorization tokens are scrubbed.
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
