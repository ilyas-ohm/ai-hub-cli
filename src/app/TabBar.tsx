import React from 'react';
import { Box, Text } from 'ink';

export const TabBar = ({ tabs, activeTabId, onSelect, agents }) => {
  const getStatusColor = (agentId) => {
    const agent = agents.find(a => a.agentId === agentId);
    if (!agent) return 'gray';
    switch (agent.status) {
      case 'starting': return 'yellow';
      case 'idle': return 'green';
      case 'busy': return 'blue';
      case 'error': return 'red';
      case 'dead': return 'gray';
      default: return 'white';
    }
  };

  if (tabs.length === 0) {
    return React.createElement(Box, { paddingX: 1, paddingY: 1, borderStyle: 'single' },
      React.createElement(Text, { dimColor: true }, 'No AI agents active')
    );
  }

  return React.createElement(Box, { flexDirection: 'row', borderStyle: 'single', paddingX: 1 },
    tabs.map((tab) =>
      React.createElement(Box, { key: tab.id, marginRight: 2 },
        React.createElement(Text, { color: tab.id === activeTabId ? 'cyan' : 'white' },
          tab.id === activeTabId ? '[' : ' ',
          React.createElement(Text, { color: getStatusColor(tab.agentId) }, '●'),
          ` ${tab.title}`,
          tab.id === activeTabId ? ']' : ' '
        )
      )
    )
  );
};
