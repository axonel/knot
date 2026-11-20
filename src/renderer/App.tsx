import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { ProcessManager } from './components/DesktopCommander/ProcessManager.js';
import { ProjectManager } from './components/ProjectManager/ProjectManager.js';
import { Layers } from 'lucide-react';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('projects');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090B0D] text-[#F9F9F9] font-sans">
      {/* Navigation Sidebar */}
      <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {currentTab === 'projects' ? (
            <section>
              <ProjectManager />
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
                  <strong className="text-[#F9F9F9]">Knot</strong> is designed for multi-agent coordination. The Desktop Commander Remote process acts as the terminal and filesystem MCP bridge, allowing remote autonomous agents to communicate, inspect code, and execute diagnostics within this workspace.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2 text-[11px] text-[#F9F9F9]/60">
                  <div className="p-2.5 rounded-lg bg-[#090B0D] border border-[#F9F9F9]/10">
                    <span className="text-[#004E72] font-semibold block mb-0.5">Process Isolation</span>
                    Managed directly via Node child process. Strict signal handling and PID tracking prevent orphan processes.
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#090B0D] border border-[#FF6E42] font-semibold block mb-0.5">
                    <span className="text-[#FF6E42] font-semibold block mb-0.5">Log Sanitization</span>
                    All credentials, authorization tokens, and private keys are scrubbed before display in the diagnostic console.
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
