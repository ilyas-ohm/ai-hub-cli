import { create } from 'zustand';

export const useTabStore = create((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (agentId, title) => {
    const id = `tab-${Date.now()}`;
    const newTab = {
      id,
      agentId,
      title,
      isActive: true
    };
    
    set(state => ({
      tabs: state.tabs.map(t => ({ ...t, isActive: false })).concat(newTab),
      activeTabId: id
    }));
    
    return id;
  },

  removeTab: (id) => {
    set(state => {
      const filteredTabs = state.tabs.filter(t => t.id !== id);
      const newActiveId = state.activeTabId === id 
        ? (filteredTabs[filteredTabs.length - 1]?.id || null)
        : state.activeTabId;
      
      return {
        tabs: filteredTabs.map(t => ({ ...t, isActive: t.id === newActiveId })),
        activeTabId: newActiveId
      };
    });
  },

  setActiveTab: (id) => {
    set(state => ({
      tabs: state.tabs.map(t => ({ ...t, isActive: t.id === id })),
      activeTabId: id
    }));
  }
}));

export const useAgentStore = create((set, get) => ({
  agents: [],

  addAgent: (agent) => {
    set(state => ({
      agents: [...state.agents, agent]
    }));
  },

  removeAgent: (id) => {
    const agent = get().agents.find(a => a.id === id);
    if (agent?.process) {
      agent.process.kill();
    }
    set(state => ({
      agents: state.agents.filter(a => a.id !== id)
    }));
  },

  updateAgentStatus: (id, status) => {
    set(state => ({
      agents: state.agents.map(a => 
        a.id === id ? { ...a, status } : a
      )
    }));
  },

  appendOutput: (id, data) => {
    set(state => ({
      agents: state.agents.map(a => {
        if (a.id === id) {
          const newOutput = [...a.output, data].slice(-1000);
          return { ...a, output: newOutput, lastOutput: data };
        }
        return a;
      })
    }));
  },

  killAll: () => {
    get().agents.forEach(agent => {
      if (agent.process) {
        try {
          agent.process.kill();
        } catch (e) {
          // Process might already be dead
        }
      }
    });
    set({ agents: [] });
  }
}));
