# load-stopper

A lightweight, zero-dependency resource monitoring middleware for Node.js. It automatically acts as a circuit breaker for your server, intercepting incoming traffic and serving a customized 503 error page if CPU or RAM usage exceeds safe limits, protecting your databases and heavy application logic from crashing.

It features a built-in, completely independent custom styling engine for visual logging in the terminal while saving clean text to disk.

Supports both **ES Modules (ESM)** and **CommonJS (CJS)** out of the box.

## Features

- **Zero Dependencies** — High performance without external bloat using built-in `node:os` and `node:fs`.
- **Custom Visual Logging** — Beautiful, color-coded console logs for easy debugging (Cyan for Info, Green for Success, Yellow for Warnings, and Bold Red-on-White for Critical Overloads).
- **Smart Disk Logging** — Strips out ANSI terminal escape colors when writing to the log file to keep the disk file clean and parseable.
- **Dual-Format Support** — Native ESM (`import`) and CommonJS (`require`).
- **Configurable Thresholds** — Set your own critical metrics and intervals.

## Installation

```bash
npm install load-stopper
```

## Usage

### 1. ES Modules (ESM)

```javascript
import express from 'express';
import loadStopper from 'load-stopper';

const app = express();

// Initialize with custom configurations
loadStopper.init({
    cpuThreshold: 80,                         // Trigger critical mode if CPU > 80%
    ramThreshold: 15,                         // Trigger critical mode if free RAM < 15%
    intervalMs: 3000,                         // Check system resources every 3 seconds
    logFilePath: './logs/my-overloads.log'    // Custom path for file logs (Optional)
});

// MUST be registered as the very first middleware
app.use(loadStopper.middleware);

app.get('/', (req, res) => {
    res.send('Server is running smoothly!');
});

app.listen(3000);
```

### 2. CommonJS (CJS)

```javascript
const express = require('express');
const loadStopper = require('load-stopper');

const app = express();

loadStopper.init({
    cpuThreshold: 85,
    ramThreshold: 10,
    intervalMs: 5000
});

app.use(loadStopper.middleware);

app.get('/', (req, res) => {
    res.send('Hello from CommonJS server!');
});

app.listen(3000);
```

## API Configuration Options

You can pass a configuration object to the `loadStopper.init()` method:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `cpuThreshold` | `number` | `85` | Maximum allowed CPU usage percentage (0-100). |
| `ramThreshold` | `number` | `10` | Minimum allowed **free** system memory percentage (0-100). |
| `intervalMs` | `number` | `5000` | Resource check interval in milliseconds. |
| `logFilePath` | `string` | `path.join(process.cwd(), 'load-stopper.log')` | Absolute or relative path where text logs will be written. |

## How It Works

1. The package samples system metrics at your specified `intervalMs`.
2. If resources cross the dangerous thresholds, **Critical Mode** engages immediately.
3. The console displays a bright, visible alert with a structural tree layout showing the exact CPU and RAM metrics, while the log file appends a clean string line.
4. While the server is overloaded, incoming HTTP requests are instantly dropped with an `HTTP 503 Service Unavailable` status and a `Retry-After: 30` header to prevent process lockups.
5. Once metrics return to safe zones, the middleware automatically recovers, logs a success event, and routes resume standard processing.

## License

MIT
