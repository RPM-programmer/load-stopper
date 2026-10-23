># load-stopper

[![npm version](https://img.shields.io/badge/npm_versions-load--stopper-blue?logo=npm)](https://www.npmjs.com/package/load-stopper?activeTab=versions)
[![npm download](https://img.shields.io/badge/npm_downloads-load--stopper-blue?logo=npm)](https://npmjs.com/package/load-stopper)
[![github download](https://img.shields.io/badge/github_downloads-load--stopper-blue?logo=github)](https://github.com/RPM-programmer/load-stopper)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue)](LICENSE)


A lightweight, cross-platform, zero-dependency resource monitoring middleware for Node.js. It acts as an automatic **circuit breaker** for your server, intercepting incoming traffic and serving an HTTP 503 error if CPU, RAM, or Event Loop lag exceeds safe limits, protecting your databases and application logic from crashing under heavy load.

Now features a **Cross-Platform Autonomous Cluster Network**. When one process gets overloaded, it instantly broadcasts a zero-overhead UDP Multicast signal to all other local Node.js instances, triggering their shields pre-emptively to save your infrastructure.

Supports both **ES Modules (ESM)** and **CommonJS (CJS)** out of the box, with native TypeScript definitions.

---

## Features

- **Zero Dependencies** — High performance without external bloat, built entirely on native `node:os`, `node:fs`, `node:perf_hooks`, and `node:dgram`.
- **Event Loop Monitoring** — Tracks Event Loop delay (lag) using high-precision `monitorEventLoopDelay`.
- **Autonomous Cluster Defense** — Synchronizes overload states between isolated processes via UDP Multicast (works on Linux, Windows, and macOS).
- **DevOps Ready** — Built-in Prometheus metrics (`/load-stopper/metrics`) and health check (`/load-stopper/healthz`) endpoints.
- **Custom Visual Logging** — Beautiful, color-coded terminal alerts for debugging, while stripping ANSI colors when saving clean text to disk logs.

---

## Installation

```bash
npm install load-stopper
```

---

## Usage

### 1. ES Modules (ESM)
```javascript
import express from 'express';
import loadStopper from 'load-stopper';

const app = express();

// Initialize with custom configurations
loadStopper.init({
    cpuThreshold: 80,                         // Trigger if CPU > 80%
    ramThreshold: 15,                         // Trigger if free RAM < 15%
    maxEventLoopDelayMs: 50,                  // Trigger if Event Loop lag > 50ms
    intervalMs: 3000,                         // Check resources every 3 seconds
    logFilePath: './logs/overloads.log'       // Log file path
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
    multicastPort: 5554 // Must match across cluster nodes to bridge them
});

app.use(loadStopper.middleware);

app.get('/', (req, res) => {
    res.send('Hello from CommonJS server!');
});

app.listen(3000);
```

---

## Integration & DevOps (Built-in Routes)

The middleware automatically intercepts two critical paths for infrastructure monitoring:

### 1. Prometheus Metrics
* **Path:** `GET /load-stopper/metrics`
* **Output:** Standard Prometheus format exposing cluster lock status and thresholds.
```text
# HELP load_stopper_is_overloaded Текущий статус блокировки (1 = активна, 0 = норма)
# TYPE load_stopper_is_overloaded gauge
load_stopper_is_overloaded 0
...
```

### 2. Kubernetes Health Checks
* **Path:** `GET /load-stopper/healthz`
* **Returns:** 
  * `HTTP 200 OK` under normal conditions.
  * `HTTP 503 Unhealthy: Circuit Breaker Active` when overloaded.

---

## Configuration Options

You can pass these options to the `loadStopper.init()` method:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `cpuThreshold` | `number` | `85` | Maximum allowed CPU usage percentage (0-100). |
| `ramThreshold` | `number` | `10` | Minimum allowed **free** system memory percentage (0-100). |
| `maxEventLoopDelayMs` | `number` | `50` | Maximum allowed Event Loop lag in milliseconds. |
| `recoveryDelta` | `number` | `5` | Percentage buffer required below threshold to clear critical mode. |
| `cooldownMs` | `number` | `10000` | Minimum time (ms) to remain shielded before allowing recovery. |
| `intervalMs` | `number` | `5000` | Resource metric sampling interval in milliseconds. |
| `retryAfterSecs` | `number` | `30` | Value sent in the `Retry-After` HTTP header during overload. |
| `logFilePath` | `string` | `.../load-stopper.log` | Absolute or relative path where text logs will be written. |
| `multicastAddr` | `string` | `'239.1.2.3'` | Reserved IP multicast group for cluster synchronization. |
| `multicastPort` | `number` | `5554` | UDP port used to bridge unknown process ports together. |
| `onOverload` | `function` | `null` | Custom handler `(req, res, next)` to override default 503 JSON response. |

---

## API Methods

### `loadStopper.isCritical()`
Returns a boolean (`true`/`false`) indicating whether the circuit breaker is currently active.
```javascript
if (loadStopper.isCritical()) {
    console.log("System is shielding traffic");
}
```

### `loadStopper.destroy()`
Gracefully clears all intervals, disables the event loop monitor, leaves the multicast group, and closes network sockets. Useful for graceful shutdowns.

---

## How It Works

1. **Metrics Sampling:** The package samples system metrics at your specified `intervalMs`.
2. **Circuit Breaker Engagement:** If CPU, RAM, or Event Loop lag cross the configured thresholds, **Critical Mode** engages.
3. **Cluster Broadcast:** The overloaded process fires a light **UDP Multicast packet** into the local network. Other local instances running `load-stopper` intercept this packet, log a cascade warning, and activate their shields pre-emptively.
4. **Traffic Dropping:** While active, all non-internal incoming requests are instantly dropped with an `HTTP 503 Service Unavailable` status, custom JSON payload, and a `Retry-After` header.
5. **Cooldown & Recovery:** Once metrics fall below `Threshold - recoveryDelta` and the `cooldownMs` has passed, a stabilization packet resets the cluster breaker, and routes resume standard processing.

---

## License

Licensed under the [**ISC**](LICENSE) License. See the LICENSE file for details.