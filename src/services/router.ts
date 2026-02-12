import { AVAILABLE_AGENTS } from '../types/index.js';
import { ProcessManager } from './process-manager.js';
import { useAgentStore } from '../store/index.js';

export interface RouteResult {
  targets: string[]; // agent IDs
  message: string;
  isBroadcast: boolean;
  isSequential: boolean;
  steps: { agent: string; message: string }[];
}

export class Router {
  private static instance: Router;
  private processManager: ProcessManager;

  static getInstance(): Router {
    if (!Router.instance) {
      Router.instance = new Router();
    }
    return Router.instance;
  }

  constructor() {
    this.processManager = ProcessManager.getInstance();
  }

  parseInput(input: string): RouteResult {
    // Check for @all - broadcast to all agents
    if (input.includes('@all')) {
      const message = input.replace(/@all/g, '').trim();
      return {
        targets: AVAILABLE_AGENTS.map(a => a.id),
        message,
        isBroadcast: true,
        isSequential: false,
        steps: []
      };
    }

    // Check for sequential handoff with "then" or "->"
    const sequentialMatch = input.match(/@(\w+)\s+(.+?)\s+(?:then|->|=>)\s+@(\w+)\s+(.+)/i);
    if (sequentialMatch) {
      const [, agent1, msg1, agent2, msg2] = sequentialMatch;
      return {
        targets: [agent1.toLowerCase(), agent2.toLowerCase()],
        message: '', // Not used in sequential
        isBroadcast: false,
        isSequential: true,
        steps: [
          { agent: agent1.toLowerCase(), message: msg1.trim() },
          { agent: agent2.toLowerCase(), message: msg2.trim() }
        ]
      };
    }

    // Check for pipe routing @claude X | @gemini Y
    const pipeMatch = input.match(/@(\w+)\s+(.+?)\s*\|\s*@(\w+)\s+(.+)/);
    if (pipeMatch) {
      const [, agent1, msg1, agent2, msg2] = pipeMatch;
      return {
        targets: [agent1.toLowerCase(), agent2.toLowerCase()],
        message: '',
        isBroadcast: false,
        isSequential: true,
        steps: [
          { agent: agent1.toLowerCase(), message: msg1.trim() },
          { agent: agent2.toLowerCase(), message: `Previous agent was asked: "${msg1.trim()}". Now: ${msg2.trim()}` }
        ]
      };
    }

    // Single @mention routing
    const mentionMatch = input.match(/@(\w+)\s+(.+)/);
    if (mentionMatch) {
      const [, agent, message] = mentionMatch;
      return {
        targets: [agent.toLowerCase()],
        message: message.trim(),
        isBroadcast: false,
        isSequential: false,
        steps: []
      };
    }

    // No @mention - route to active/default agent
    return {
      targets: [],
      message: input.trim(),
      isBroadcast: false,
      isSequential: false,
      steps: []
    };
  }

  async route(input: string, activeAgentId?: string): Promise<void> {
    const route = this.parseInput(input);
    const agents = useAgentStore.getState().agents;

    if (route.isBroadcast) {
      // Send to all agents
      for (const agentId of route.targets) {
        const agent = agents.find(a => a.agentId === agentId);
        if (agent) {
          this.processManager.sendInput(agent.id, `[BROADCAST] ${route.message}`);
        }
      }
    } else if (route.isSequential) {
      // Handle sequential steps
      for (const step of route.steps) {
        const agent = agents.find(a => a.agentId === step.agent);
        if (agent) {
          this.processManager.sendInput(agent.id, step.message);
          // Wait a bit between steps (5 seconds)
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    } else if (route.targets.length === 1) {
      // Single agent routing
      const agent = agents.find(a => a.agentId === route.targets[0]);
      if (agent) {
        this.processManager.sendInput(agent.id, route.message);
      }
    } else if (activeAgentId) {
      // Send to active agent
      const agent = agents.find(a => a.agentId === activeAgentId);
      if (agent) {
        this.processManager.sendInput(agent.id, route.message);
      }
    }
  }

  spawnAllAgents(): Promise<void[]> {
    const promises = AVAILABLE_AGENTS.map(agent => 
      this.processManager.spawnAgent(agent, 60, 15)
    );
    return Promise.all(promises);
  }
}
