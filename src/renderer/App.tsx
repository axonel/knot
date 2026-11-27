import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { ProcessManager } from './components/DesktopCommander/ProcessManager.js';
import { ProjectManager } from './components/ProjectManager/ProjectManager.js';
import { BridgeManager } from './components/Bridge/BridgeManager.js';
import { AntigravityWorkspace } from './components/Antigravity/AntigravityWorkspace.js';
import { CollaborationWorkspace } from './components/Workspace/CollaborationWorkspace.js';
import { isEditableTarget } from './utils/keyboardUtils.js';
import { ClickSpark } from './components/ReactBits/index.js';

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
          {!isFocusMode && <Header currentTab={currentTab} />}

          <main className={`flex-1 overflow-hidden ${currentTab === 'workspace' ? 'p-0 flex flex-col' : 'overflow-y-auto p-4 sm:p-6'}`}>
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
              <section className="w-full">
                <ProcessManager />
              </section>
            )}
          </main>
        </div>
      </div>
    </ClickSpark>
  );
};

export default App;
