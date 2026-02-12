import { execa } from 'execa';
import { AVAILABLE_AGENTS } from '../types/index.js';

export interface AuthStatus {
  agentId: string;
  name: string;
  isAuthenticated: boolean;
  authCommand: string;
}

export class AuthChecker {
  static async checkAll(): Promise<AuthStatus[]> {
    const results: AuthStatus[] = [];
    
    for (const agent of AVAILABLE_AGENTS) {
      const status = await AuthChecker.checkAgent(agent);
      results.push(status);
    }
    
    return results;
  }

  static async checkAgent(agent: typeof AVAILABLE_AGENTS[0]): Promise<AuthStatus> {
    try {
      let isAuth = false;
      
      switch (agent.id) {
        case 'claude':
          // Check if Claude is logged in by running a simple command
          try {
            const { stdout } = await execa(agent.command, ['--version'], { timeout: 5000 });
            // If we can get version, assume it's installed
            // Try to check login status
            try {
              await execa(agent.command, ['--help'], { timeout: 5000 });
              isAuth = true; // If help works, assume auth is cached
            } catch {
              isAuth = false;
            }
          } catch {
            isAuth = false;
          }
          break;
          
        case 'gemini':
          // Check if Gemini has auth
          try {
            const { stdout } = await execa(agent.command, ['--version'], { timeout: 5000 });
            isAuth = stdout.includes('0.'); // Version number means installed
          } catch {
            isAuth = false;
          }
          break;
          
        case 'opencode':
          try {
            const { stdout } = await execa(agent.command, ['--version'], { timeout: 5000 });
            isAuth = stdout.includes('1.');
          } catch {
            isAuth = false;
          }
          break;
          
        case 'codex':
          try {
            const { stdout } = await execa(agent.command, ['--version'], { timeout: 5000 });
            isAuth = stdout.includes('0.');
          } catch {
            isAuth = false;
          }
          break;
      }
      
      return {
        agentId: agent.id,
        name: agent.name,
        isAuthenticated: isAuth,
        authCommand: `${agent.command} login`
      };
    } catch (error) {
      return {
        agentId: agent.id,
        name: agent.name,
        isAuthenticated: false,
        authCommand: `${agent.command} login`
      };
    }
  }

  static async authenticate(agentId: string): Promise<boolean> {
    const agent = AVAILABLE_AGENTS.find(a => a.id === agentId);
    if (!agent) return false;
    
    try {
      // Try to run auth command
      const result = await execa(agent.command, [], { 
        timeout: 30000,
        stdio: 'inherit'
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
