import * as pty from 'node-pty';
import { useAgentStore } from '../store/index.js';

// Buffer for batching output updates
const outputBuffers = new Map();
const updateTimers = new Map();

export class ProcessManager {
  static instance = null;
  static setupComplete = new Set();
  
  static getInstance() {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  // Batch update function - collects output and flushes every 100ms
  flushOutput(agentId) {
    const buffer = outputBuffers.get(agentId);
    if (buffer && buffer.length > 0) {
      const data = buffer.join('');
      outputBuffers.set(agentId, []);
      useAgentStore.getState().appendOutput(agentId, data);
    }
  }

  scheduleFlush(agentId) {
    if (updateTimers.has(agentId)) {
      clearTimeout(updateTimers.get(agentId));
    }
    
    const timer = setTimeout(() => {
      this.flushOutput(agentId);
      updateTimers.delete(agentId);
    }, 100); // Batch updates every 100ms
    
    updateTimers.set(agentId, timer);
  }

  async spawnAgent(agentConfig, cols = 80, rows = 24) {
    const agentId = `agent-${Date.now()}`;
    const agentType = agentConfig.id;
    
    // Initialize buffer for this agent
    outputBuffers.set(agentId, []);
    
    const proc = pty.spawn(agentConfig.command, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        CI: 'true',
        NONINTERACTIVE: '1'
      }
    });

    const agentProcess = {
      id: agentId,
      agentId: agentConfig.id,
      process: proc,
      status: 'starting',
      output: [],
      lastOutput: '',
      setupDone: ProcessManager.setupComplete.has(agentType)
    };

    let setupTimeout;

    proc.onData((data) => {
      // Add to buffer instead of immediate update
      const buffer = outputBuffers.get(agentId) || [];
      buffer.push(data);
      outputBuffers.set(agentId, buffer);
      
      // Auto-configure on first run
      if (!agentProcess.setupDone) {
        this.handleSetup(agentType, data, proc);
      }
      
      // Schedule batch update
      this.scheduleFlush(agentId);
    });

    proc.onExit(({ exitCode }) => {
      // Clear any pending updates
      if (updateTimers.has(agentId)) {
        clearTimeout(updateTimers.get(agentId));
      }
      // Final flush
      this.flushOutput(agentId);
      
      useAgentStore.getState().updateAgentStatus(agentId, exitCode === 0 ? 'dead' : 'error');
      
      // Cleanup
      outputBuffers.delete(agentId);
      updateTimers.delete(agentId);
    });

    // Mark as ready after setup time
    setupTimeout = setTimeout(() => {
      useAgentStore.getState().updateAgentStatus(agentId, 'idle');
      ProcessManager.setupComplete.add(agentType);
      agentProcess.setupDone = true;
    }, 8000);

    useAgentStore.getState().addAgent(agentProcess);
    
    return agentProcess;
  }

  handleSetup(agentType, data, proc) {
    const text = data.toLowerCase();
    
    if (agentType === 'claude') {
      if (text.includes('choose the text style') || text.includes('dark mode') || text.includes('light mode')) {
        setTimeout(() => proc.write('1\r'), 500);
        setTimeout(() => proc.write('\r'), 1000);
      }
      if (text.includes('get started') || text.includes("let's get started")) {
        setTimeout(() => proc.write('\r'), 500);
      }
    }
    
    if (agentType === 'gemini') {
      if (text.includes('do you want to connect') || text.includes('antigravity')) {
        setTimeout(() => proc.write('2\r'), 500);
      }
      if (text.includes('do you trust this folder')) {
        setTimeout(() => proc.write('1\r'), 500);
      }
      if (text.includes('login with google') || text.includes('gemini api key')) {
        setTimeout(() => proc.write('2\r'), 500);
      }
    }
    
    if (agentType === 'codex') {
      if (text.includes('tip:') || text.includes('welcome')) {
        setTimeout(() => proc.write('\r'), 500);
      }
    }
    
    if (agentType === 'opencode') {
      if (text.includes('welcome') || text.includes('get started')) {
        setTimeout(() => proc.write('\r'), 500);
      }
    }
  }

  sendInput(agentId, input) {
    const agent = useAgentStore.getState().agents.find(a => a.id === agentId);
    if (agent && agent.process) {
      agent.process.write(input + '\r');
      useAgentStore.getState().updateAgentStatus(agentId, 'busy');
      
      setTimeout(() => {
        useAgentStore.getState().updateAgentStatus(agentId, 'idle');
      }, 5000);
    }
  }

  killAgent(agentId) {
    if (updateTimers.has(agentId)) {
      clearTimeout(updateTimers.get(agentId));
    }
    outputBuffers.delete(agentId);
    updateTimers.delete(agentId);
    useAgentStore.getState().removeAgent(agentId);
  }

  killAll() {
    updateTimers.forEach((timer) => clearTimeout(timer));
    updateTimers.clear();
    outputBuffers.clear();
    useAgentStore.getState().killAll();
  }
}
