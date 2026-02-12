import React from 'react';
import { Box, Text, useInput } from 'ink';

export const InputBar = ({ value, onChange, onSubmit, disabled }) => {
  useInput((input, key) => {
    if (disabled) return;
    
    if (key.return) {
      onSubmit(value);
    } else if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      onChange(value + input);
    }
  });

  return React.createElement(Box, {
    flexDirection: 'row',
    borderStyle: 'single',
    paddingX: 1,
    height: 3
  },
    React.createElement(Text, { color: 'cyan' }, '> '),
    disabled
      ? React.createElement(Text, { dimColor: true }, 'Select an AI first (Ctrl+T)')
      : React.createElement(Text, null,
          value || React.createElement(Text, { dimColor: true }, 'Type your message...')
        )
  );
};
