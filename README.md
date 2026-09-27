# load-stopper

[![npm version](https://img.shields.io/badge/npm_versions-load--stopper-blue?logo=npm)](https://www.npmjs.com/package/load-stopper)
[![npm downloads](https://img.shields.io/badge/npm_downloads-load--stopper-blue?logo=npm)](https://npmjs.com)
[![github downloads](https://img.shields.io/badge/github_downloads-load--stopper-blue?logo=github)](https://github.com/RPM-programmer/load-stopper)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue)](LICENSE)

A lightweight, cross-platform, zero-dependency resource monitoring middleware for Node.js. It automatically acts as a circuit breaker for your server, intercepting incoming traffic and serving a customized 503 error page if CPU or RAM usage exceeds safe limits, protecting your databases and heavy application logic from crashing.

Now features a **Cross-Platform Autonomous Cluster Network**. When one server gets overloaded, it instantly broadcasts a zero-overhead UDP Multicast signal to all other local Node.js servers, triggers their shields pre-emptively, and drops routes simultaneously to save your infrastructure.

It features a built-in, completely independent custom styling engine for visual logging in the terminal while saving clean text to disk.

Supports both **ES Modules (ESM)** and **CommonJS (CJS)** out of the box.

## Features

- **Zero Dependencies** — High performance without external bloat using built-in `node:os`, `node:fs`, and `node:dgram`.
- **Autonomous Cluster Defense** — Automatically synchronizes overload state between unknown ports via UDP Multicast (works out of the box on Linux, Windows, and macOS).
- **Custom Visual Logging** — Beautiful, color-coded console logs for easy debugging (Cyan for Info, Green for Success, Yellow for Warnings, and Bold Red-on-White for Critical Overloads).
- **Smart Disk Logging** — Strips out ANSI terminal escape colors when writing to the log file to keep the disk file clean and parseable.
- **Dual-Format Support** — Native ESM (`import`) and CommonJS (`require`).
- **Configurable Thresholds** — Set your own critical metrics, intervals, and cluster network channels.

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
    multicastPort: 5554,                      // Shared channel port for all local node servers
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
    intervalMs: 5000,
    multicastPort: 5554 // Must match across all your local servers to bridge them
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
| `multicastAddr` | `string` | `'239.1.2.3'` | Reserved IP address for the local virtual cluster group. |
| `multicastPort` | `number` | `5554` | Common port used to bridge unknown host server ports together. |
| `logFilePath` | `string` | `path.join(process.cwd(), 'load-stopper.log')` | Absolute or relative path where text logs will be written. |

## How It Works

1. The package samples system metrics at your specified `intervalMs`.
2. If resources cross the dangerous thresholds, **Critical Mode** engages immediately.
3. The server fires a light cross-platform **UDP Multicast packet** into the local network. 
4. Other servers running `load-stopper` intercept this packet on `multicastPort`, log a cascade warning, and activate their shielding middleware simultaneously to stop incoming traffic on their own ports.
5. The console displays a bright, visible alert with structural logs, while the log file appends a clean string line.
6. While the server cluster is overloaded, incoming HTTP requests are instantly dropped with an `HTTP 503 Service Unavailable` status and a `Retry-After: 30` header to prevent process lockups.
7. Once metrics return to safe zones, a stabilization packet disengages the system-wide circuit breaker, and all routes resume standard processing.

## License

MIT
