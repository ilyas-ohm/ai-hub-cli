import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Box, Text, useApp, useStdin, Static } from 'ink';
import { useAgentStore } from '../store/index.js';
import { ProcessManager } from '../services/process-manager.js';
import { Router } from '../services/router.js';
import { AuthChecker } from '../services/auth-checker.js';
import { AVAILABLE_AGENTS } from '../types/index.js';

// Memoized AgentPanel to prevent unnecessary re-renders
const AgentPanel = memo(({ agentConfig, lines, status }) => {
  const statusColor = {
    'starting': 'yellow',
    'idle': 'green',
    'busy': 'blue',
    'error': 'red',
    'dead': 'gray'
  }[status] || 'white';

  return (
    <Box 
      flexDirection="column" 
      width="50%" 
      height="100%"
      borderStyle="single"
      paddingX={1}
    >
      <Box marginBottom={1} height={1}>
        <Text bold color={agentConfig?.color || 'white'}>
          {agentConfig?.name || 'Unknown'}
        </Text>
        <Text> [</Text>
        <Text color={statusColor}>{status?.toUpperCase() || 'INIT'}</Text>
        <Text>]</Text>
      </Box>
      
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {lines.length === 0 ? (
          <Text dimColor>Waiting...</Text>
        ) : (
          // Use Static for append-only output
          <Static items={lines.slice(-20)}>
            {(line, index) => (
              <Text key={`${agentConfig?.id}-${index}`} wrap="truncate">
                {line}
              </Text>
            )}
          </Static>
        )}
      </Box>
    </Box>
  );
});

// Clean output and filter noise
const cleanOutput = (str) => {
  if (!str) return '';
  return str
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    .replace(/\x1b\][0-9;]*(?:;[^\x07]*)?\x07/g, '')
    .replace(/\x1b\][0-9;]*(?:;[^\x1b]*)?\x1b\\/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
};

const isNoise = (line) => {
  const noisePatterns = [
    /^\]/, /^npm /, /^config /, /^get /, /^registry/,
    /^\[?\d+h/, /^\?9001/, /^\?1004/, /^\?25/, /^\?2004/,
    /^\?2026/, /^\?1049/, /^2J/, /^\[H/, /^\[K/,
    /^0m/, /^38;2;/, /^48;2;/, /^]+0;/,
    /^\d+;.*npm/, /^\s*npm\s+config/, /^\s*config\s+get/,
    /^\s*$/, // Empty lines
  ];
  return noisePatterns.some(pattern => pattern.test(line));
};

export const App = () => {
  const { exit } = useApp();
  const { stdin, setRawMode } = useStdin();
  const [screen, setScreen] = useState('checking');
  const [authStatus, setAuthStatus] = useState([]);
  const [selectedAuthIndex, setSelectedAuthIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [allSpawned, setAllSpawned] = useState(false);
  
  // Use selector-based subscriptions to prevent unnecessary re-renders
  const claudeAgent = useAgentStore(state => state.agents.find(a => a.agentId === 'claude'));
  const geminiAgent = useAgentStore(state => state.agents.find(a => a.agentId === 'gemini'));
  const opencodeAgent = useAgentStore(state => state.agents.find(a => a.agentId === 'opencode'));
  const codexAgent = useAgentStore(state => state.agents.find(a => a.agentId === 'codex'));
  const allAgents = useAgentStore(state => state.agents);
  
  const processManager = useMemo(() => ProcessManager.getInstance(), []);
  const router = useMemo(() => Router.getInstance(), []);
  const inputRef = useRef(inputValue);
  
  inputRef.current = inputValue;

  // Check auth on startup
  useEffect(() => {
    AuthChecker.checkAll().then(status => {
      setAuthStatus(status);
      const needsAuth = status.some(s => !s.isAuthenticated);
      if (needsAuth) {
        setScreen('auth');
      } else {
        setScreen('menu');
      }
    });
  }, []);

  // Memoized line processing - only recalculates when agent output changes
  const processAgentLines = useMemo(() => {
    return (agent) => {
      if (!agent?.output?.length) return [];
      
      const allText = agent.output.join('');
      return cleanOutput(allText)
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .filter(l => !isNoise(l))
        .filter(l => l.length > 3)
        .filter(l => !l.includes('Welcome'))
        .filter(l => !l.includes('Syntax'))
        .slice(-20);
    };
  }, []);

  // Get processed lines for each agent
  const claudeLines = useMemo(() => processAgentLines(claudeAgent), [claudeAgent?.lastOutput]);
  const geminiLines = useMemo(() => processAgentLines(geminiAgent), [geminiAgent?.lastOutput]);
  const opencodeLines = useMemo(() => processAgentLines(opencodeAgent), [opencodeAgent?.lastOutput]);
  const codexLines = useMemo(() => processAgentLines(codexAgent), [codexAgent?.lastOutput]);

  useEffect(() => {
    if (!stdin) return;
    setRawMode(true);
    
    const handleData = (data) => {
      const str = data.toString();
      
      if (str === '\u0003') { // Ctrl+C
        exit();
        return;
      }
      
      if (str === '\u001b') { // ESC
        if (screen === 'chat') setScreen('menu');
        return;
      }
      
      if (screen === 'auth') {
        if (str === '\u001b[A') { // Up
          setSelectedAuthIndex(prev => Math.max(0, prev - 1));
        } else if (str === '\u001b[B') { // Down
          setSelectedAuthIndex(prev => Math.min(authStatus.length - 1, prev + 1));
        } else if (str === '\r' || str === '\n') { // Enter
          setScreen('menu');
        } else if (str === 'a') { // 'a' to authenticate
          const agent = authStatus[selectedAuthIndex];
          if (agent && !agent.isAuthenticated) {
            console.clear();
            console.log(`\nPlease authenticate ${agent.name} by running:`);
            console.log(`\n  ${agent.authCommand}\n`);
            console.log('After authentication, press any key to continue...');
            setScreen('checking');
            setTimeout(() => {
              AuthChecker.checkAll().then(status => {
                setAuthStatus(status);
                const needsAuth = status.some(s => !s.isAuthenticated);
                setScreen(needsAuth ? 'auth' : 'menu');
              });
            }, 1000);
          }
        }
      } else if (screen === 'menu') {
        if (str === '\r' || str === '\n') {
          setScreen('chat');
          if (!allSpawned) {
            router.spawnAllAgents().then(() => {
              setAllSpawned(true);
            });
          }
        }
      } else if (screen === 'chat') {
        if (str === '\r' || str === '\n') { // Enter
          const cmd = inputRef.current.trim();
          if (cmd) {
            setCommandHistory(prev => [...prev.slice(-9), `> ${cmd}`]);
            router.route(cmd);
            setInputValue('');
          }
        } else if (str === '\u007f') { // Backspace
          setInputValue(prev => prev.slice(0, -1));
        } else if (!str.match(/[\x00-\x1f]/)) {
          setInputValue(prev => prev + str);
        }
      }
    };
    
    stdin.on('data', handleData);
    return () => {
      stdin.off('data', handleData);
      setRawMode(false);
    };
  }, [stdin, screen, authStatus, selectedAuthIndex, allSpawned, router]);

  useEffect(() => {
    return () => {
      processManager.killAll();
    };
  }, [processManager]);

  // Checking screen
  if (screen === 'checking') {
    return (
      <Box flexDirection="column" padding={2}>
        <Text bold color="cyan">Checking authentication status...</Text>
      </Box>
    );
  }

  // Auth screen
  if (screen === 'auth') {
    const needsAuth = authStatus.filter(s => !s.isAuthenticated);
    
    return (
      <Box flexDirection="column" padding={2}>
        <Text bold color="yellow">⚠️  Authentication Required</Text>
        <Box marginTop={1}>
          <Text>The following AI agents need authentication:</Text>
        </Box>
        {needsAuth.map((agent, index) => (
          <Box key={agent.agentId} marginLeft={2}>
            <Text>
              {index === selectedAuthIndex ? '▶ ' : '  '}
              <Text bold color="red">✗</Text>
              {' '}
              <Text bold>{agent.name}</Text>
            </Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text>Authenticated agents:</Text>
        </Box>
        {authStatus.filter(s => s.isAuthenticated).map(agent => (
          <Box key={agent.agentId} marginLeft={2}>
            <Text>
              <Text bold color="green">✓</Text>
              {' '}
              <Text bold>{agent.name}</Text>
            </Text>
          </Box>
        ))}
        <Box marginTop={2}>
          <Text dimColor>↑/↓ Navigate • Enter Skip • 'a' Authenticate</Text>
        </Box>
      </Box>
    );
  }

  // Menu screen
  if (screen === 'menu') {
    return (
      <Box flexDirection="column" padding={2}>
        <Text bold color="cyan">🤖 MAI - Multi-AI Orchestration Hub</Text>
        <Box marginTop={1}>
          <Text dimColor>Command multiple AI agents simultaneously</Text>
        </Box>
        <Box marginTop={1}>
          <Text bold>Available Agents:</Text>
        </Box>
        {AVAILABLE_AGENTS.map(agent => (
          <Box key={agent.id} marginLeft={2}>
            <Text>• <Text bold color={agent.color}>{agent.name}</Text></Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text bold>Commands:</Text>
        </Box>
        <Box marginLeft={2}>
          <Text dimColor>@claude fix this bug</Text>
        </Box>
        <Box marginLeft={2}>
          <Text dimColor>@all review this PR</Text>
        </Box>
        <Box marginTop={2}>
          <Text color="green">Press ENTER to start all agents...</Text>
        </Box>
      </Box>
    );
  }

  // Chat screen with 2x2 grid
  return (
    <Box flexDirection="column" height={process.stdout.rows || 30}>
      <Box paddingX={1} height={1}>
        <Text bold color="cyan">🤖 MAI Hub</Text>
        <Text> | </Text>
        <Text dimColor>Type commands with @mentions | ESC=Menu</Text>
      </Box>
      
      <Box flexDirection="row" height={Math.floor((process.stdout.rows - 10) / 2)}>
        <AgentPanel 
          agentConfig={AVAILABLE_AGENTS.find(a => a.id === 'claude')}
          lines={claudeLines}
          status={claudeAgent?.status}
        />
        <AgentPanel 
          agentConfig={AVAILABLE_AGENTS.find(a => a.id === 'gemini')}
          lines={geminiLines}
          status={geminiAgent?.status}
        />
      </Box>
      
      <Box flexDirection="row" height={Math.floor((process.stdout.rows - 10) / 2)}>
        <AgentPanel 
          agentConfig={AVAILABLE_AGENTS.find(a => a.id === 'opencode')}
          lines={opencodeLines}
          status={opencodeAgent?.status}
        />
        <AgentPanel 
          agentConfig={AVAILABLE_AGENTS.find(a => a.id === 'codex')}
          lines={codexLines}
          status={codexAgent?.status}
        />
      </Box>
      
      <Box borderStyle="single" paddingX={1} height={5}>
        <Text bold>Recent Commands:</Text>
        {commandHistory.length === 0 ? (
          <Text dimColor>No commands yet. Try: @claude hello</Text>
        ) : (
          commandHistory.slice(-3).map((cmd, i) => (
            <Text key={i} dimColor>{cmd}</Text>
          ))
        )}
      </Box>
      
      <Box borderStyle="single" paddingX={1} height={1}>
        <Text bold color="green">{'>'} </Text>
        <Text>{inputValue}</Text>
        <Text color="gray">_</Text>
      </Box>
    </Box>
  );
};
