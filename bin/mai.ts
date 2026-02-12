#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { App } from '../src/app/App.js';

// Clear the console
console.clear();

// Render the app using React.createElement
render(React.createElement(App));
