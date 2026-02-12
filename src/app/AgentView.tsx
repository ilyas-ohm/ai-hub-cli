import React, { useEffect, useState } from 'react';
import { Box, Text, useStdout } from 'ink';

// Better ANSI and noise stripper
const cleanOutput = (str) => {
  if (!str) return '';
  
  return str
    // Remove ANSI escape codes
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    // Remove OSC sequences (window titles, etc)
    .replace(/\x1b\][0-9;]*(?:;[^\x07]*)?\x07/g, '')
    .replace(/\x1b\][0-9;]*(?:;[^\x1b]*)?\x1b\\/g, '')
    // Remove control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
};

// Filter out noise/setup messages
const isNoise = (line) => {
  const noisePatterns = [
    /^\]/,  // OSC sequences
    /^npm /,
    /^config /,
    /^get /,
    /^registry/,
    /^\[?\d+h/,  // Hour marks
    /^\?9001/,
    /^\?1004/,
    /^\?25/,
    /^\?2004/,
    /^\?2026/,
    /^\?1049/,
    /^2J/,
    /^\[H/,
    /^\[K/,
    /^0m/,
    /^38;2;/,  // RGB color codes
    /^48;2;/,
    /^]+0;/,   // Window title
    /^\d+;.*npm/,  // Lines starting with numbers and npm
    /^\s*npm\s+config/,
    /^\s*config\s+get/,
  ];
  
  return noisePatterns.some(pattern => pattern.test(line));
};

export const AgentView = ({ tabId, agents, tabs }) => {
  const { stdout } = useStdout();
  const [lines, setLines] = useState([]);
  
  const tab = tabs.find(t => t.id === tabId);
  const agent = tab ? agents.find(a => a.agentId === tab.agentId) : null;

  useEffect(() => {
    if (!agent?.output?.length) {
      setLines([]);
      return;
    }
    
    // Get all output and clean it
    const allText = agent.output.join('');
    const cleanText = cleanOutput(allText);
    
    // Split and filter
    const textLines = cleanText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !isNoise(line))
      .filter(line => line.length > 3)
      .filter(line => !line.includes('Welcome'))
      .filter(line => !line.includes('Syntax'))
      .filter(line => !line.includes('npm config'))
      .filter(line => !line.includes('registry'))
      .slice(-20);
    
    setLines(textLines);
  }, [agent?.lastOutput, agent?.output?.length]);

  if (!agent) {
    return (
      <Box flexGrow={1} justifyContent="center" alignItems="center">
        <Text color="red">Agent not found</Text>
      </Box>
    );
  }

  if (agent.status === 'starting') {
    return (
      <Box flexGrow={1} justifyContent="center" alignItems="center">
        <Text color="yellow">Starting {tab?.title}...</Text>
      </Box>
    );
  }

  return (
    <Box 
      flexGrow={1} 
      flexDirection="column" 
      paddingX={1}
      paddingY={0}
    >
      {lines.length === 0 ? (
        <Text dimColor>Waiting for AI response...</Text>
      ) : (
        lines.map((line, index) => (
          <Text key={index}>
            {line}
          </Text>
        ))
      )}
    </Box>
  );
};
