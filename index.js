import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import dgram from 'node:dgram';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const styles = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    gray: '\x1b[90m',
    bgRed: '\x1b[41m',
    white: '\x1b[37m'
};

let isCriticalMode = false;
let checkInterval = null;
let loopMonitor = null;
let mainSocket = null;
let lastOverloadTime = 0;

let config = {
    cpuThreshold: 85,
    ramThreshold: 10,
    maxEventLoopDelayMs: 50,
    recoveryDelta: 5,
    cooldownMs: 10000,
    intervalMs: 5000,
    retryAfterSecs: 30,
    logFilePath: path.join(process.cwd(), 'load-stopper.log'),
    multicastAddr: '239.1.2.3', 
    multicastPort: 5554,
    onOverload: null
};

async function customLog({ level, msg, metrics }) {
    const timestamp = new Date().toISOString();
    const { cpu, freeRam, eventLoopDelay } = metrics || {};
    
    let metricsStr = '';
    if (metrics) {
        metricsStr = ` [CPU: ${cpu}%, Free RAM: ${freeRam}%`;
        if (eventLoopDelay !== undefined) metricsStr += `, Loop Lag: ${eventLoopDelay}ms`;
        metricsStr += ']';
    }
    
    const fileLogLine = `[${timestamp}] [${level.toUpperCase()}] ${msg}${metricsStr}\n`;
    let coloredLine = `${styles.gray}[${timestamp}]${styles.reset} `;

    switch (level) {
        case 'info':
            coloredLine += `${styles.cyan}${styles.bold}[INFO]${styles.reset} ${msg}`;
            break;
        case 'warn':
            coloredLine += `${styles.yellow}${styles.bold}[WARN]${styles.reset} ${msg}`;
            if (metrics) {
                coloredLine += ` ${styles.gray}(CPU: ${styles.yellow}${cpu}%${styles.gray}, RAM: ${styles.yellow}${freeRam}%${styles.gray}, Loop: ${styles.yellow}${eventLoopDelay}ms${styles.gray})${styles.reset}`;
            }
            break;
        case 'critical':
            coloredLine += `${styles.bgRed}${styles.white}${styles.bold} [CRITICAL] ${styles.reset} ${styles.red}${msg}${styles.reset}`;
            if (metrics) {
                coloredLine += `\n  └─> ${styles.bold}System Status:${styles.reset} CPU: ${styles.red}${styles.bold}${cpu}%${styles.reset} | Free RAM: ${styles.red}${styles.bold}${freeRam}%${styles.reset} | Loop Lag: ${styles.red}${styles.bold}${eventLoopDelay}ms${styles.reset}`;
            }
            break;
        case 'success':
            coloredLine += `${styles.green}${styles.bold}[SUCCESS]${styles.reset} ${msg}`;
            if (metrics) {
                coloredLine += ` ${styles.gray}(CPU: ${styles.green}${cpu}%${styles.gray}, RAM: ${styles.green}${freeRam}%${styles.gray}, Loop: ${styles.green}${eventLoopDelay}ms${styles.gray})${styles.reset}`;
            }
            break;
    }

    if (level === 'critical' || level === 'warn') {
        console.error(coloredLine);
    } else {
        console.log(coloredLine);
    }

    try {
        await fs.appendFile(config.logFilePath, fileLogLine, 'utf8');
    } catch (err) {
        console.error(`${styles.red}[LoadStopper Internal Error] Cannot write to log file: ${err.message}${styles.reset}`);
    }
}

function getCpuLoad() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    cpus.forEach(core => {
        for (const type in core.times) {
            totalTick += core.times[type];
        }
        totalIdle += core.times.idle;
    });
    return { totalIdle, totalTick };
}

let startMeasure = getCpuLoad();

async function checkMetrics() {
    const endMeasure = getCpuLoad();
    const idleDifference = endMeasure.totalIdle - startMeasure.totalIdle;
    const totalDifference = endMeasure.totalTick - startMeasure.totalTick;
    
    const cpuLoad = totalDifference > 0 ? 100 - Math.round((100 * idleDifference) / totalDifference) : 0;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const freeMemPercent = Math.round((freeMem / totalMem) * 100);

    let eventLoopDelayMs = 0;
    if (loopMonitor) {
        eventLoopDelayMs = Math.round(loopMonitor.percentile(99) / 1e6);
        loopMonitor.reset();
    }

    const metrics = { cpu: cpuLoad, freeRam: freeMemPercent, eventLoopDelay: eventLoopDelayMs };

    const isCpuOver = cpuLoad > config.cpuThreshold;
    const isRamOver = freeMemPercent < config.ramThreshold;
    const isLoopOver = eventLoopDelayMs > config.maxEventLoopDelayMs;

    if (isCpuOver || isRamOver || isLoopOver) {
        if (!isCriticalMode) {
            isCriticalMode = true;
            lastOverloadTime = Date.now();
            sendStateToPeers('ACTIVATE_SHIELD');
            await customLog({
                level: 'critical',
                msg: `CRITICAL MODE ACTIVATED! Reason: ${isCpuOver ? '[CPU] ' : ''}${isRamOver ? '[RAM] ' : ''}${isLoopOver ? '[EventLoop] ' : ''}`,
                metrics
            });
        } else {
            await customLog({
                level: 'warn',
                msg: 'Server is still heavily overloaded. Shielding routes.',
                metrics
            });
        }
    } else {
        if (isCriticalMode) {
            const safeCpu = cpuLoad < (config.cpuThreshold - config.recoveryDelta);
            const safeRam = freeMemPercent > (config.ramThreshold + config.recoveryDelta);
            const safeLoop = eventLoopDelayMs < config.maxEventLoopDelayMs;
            const cooldownPassed = (Date.now() - lastOverloadTime) > config.cooldownMs;

            if (safeCpu && safeRam && safeLoop && cooldownPassed) {
                isCriticalMode = false;
                sendStateToPeers('DEACTIVATE_SHIELD');
                await customLog({
                    level: 'success',
                    msg: 'Load stabilized. Circuit breaker disengaged. Returning to normal operational mode.',
                    metrics
                });
            }
        }
    }
    startMeasure = endMeasure;
}

export function init(userConfig = {}) {
    config = { ...config, ...userConfig };
    
    loopMonitor = monitorEventLoopDelay({ resolution: 20 });
    loopMonitor.enable();

    checkInterval = setInterval(checkMetrics, config.intervalMs);
    
    mainSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    mainSocket.on('message', (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            if (data.senderPid === process.pid) return;

            if (data.action === 'ACTIVATE_SHIELD') {
                if (!isCriticalMode) {
                    isCriticalMode = true;
                    lastOverloadTime = Date.now();
                    customLog({ 
                        level: 'warn', 
                        msg: `Cascade trigger received from PID ${data.senderPid}. Shielding routes pre-emptively.` 
                    });
                }
            } else if (data.action === 'DEACTIVATE_SHIELD') {
                if (isCriticalMode) {
                    isCriticalMode = false;
                    customLog({ 
                        level: 'success', 
                        msg: `Cluster stabilization signal received from PID ${data.senderPid}. Returning to normal.` 
                    });
                }
            }
        } catch (e) {}
    });

    mainSocket.bind(config.multicastPort, '0.0.0.0', () => {
        try {
            mainSocket.setMulticastLoopback(true);
            mainSocket.addMembership(config.multicastAddr);
        } catch (err) {
            console.error(`${styles.red}[LoadStopper Internal Error] Multicast join failed: ${err.message}${styles.reset}`);
        }
    });

    customLog({ 
        level: 'info', 
        msg: `Cluster networking engaged. Listening on multicast group ${config.multicastAddr}:${config.multicastPort} (PID: ${process.pid})` 
    });
}

function sendStateToPeers(actionName) {
    const client = dgram.createSocket('udp4');
    const message = Buffer.from(JSON.stringify({ 
        action: actionName,
        senderPid: process.pid 
    }));
    
    client.bind(0, '0.0.0.0', () => {
        try {
            client.setMulticastTTL(1); 
            client.send(message, config.multicastPort, config.multicastAddr, () => {
                client.close();
            });
        } catch (e) {
            client.close();
        }
    });
}

export function destroy() {
    if (checkInterval) clearInterval(checkInterval);
    if (loopMonitor) loopMonitor.disable();
    if (mainSocket) {
        try {
            mainSocket.dropMembership(config.multicastAddr);
            mainSocket.close();
        } catch (e) {}
    }
}

export function middleware(req, res, next) {
    if (req.method === 'GET' && req.path === '/load-stopper/metrics') {
        res.setHeader('Content-Type', 'text/plain; version=0.0.4');
        const metricsOutput = [
            `# HELP load_stopper_is_overloaded Текущий статус блокировки (1 = активна, 0 = норма)`,
            `# TYPE load_stopper_is_overloaded gauge`,
            `load_stopper_is_overloaded ${isCriticalMode ? 1 : 0}`,
            `# HELP load_stopper_cpu_threshold Установленный порог процессора`,
            `# TYPE load_stopper_cpu_threshold gauge`,
            `load_stopper_cpu_threshold ${config.cpuThreshold}`
        ].join('\n');
        return res.status(200).send(metricsOutput);
    }

    if (req.method === 'GET' && req.path === '/load-stopper/healthz') {
        if (isCriticalMode) {
            return res.status(503).send('Unhealthy: Circuit Breaker Active');
        }
        return res.status(200).send('OK');
    }

    if (isCriticalMode) {
        const seconds = config.retryAfterSecs;
        res.setHeader('Retry-After', String(seconds));

        if (typeof config.onOverload === 'function') {
            return config.onOverload(req, res, next);
        }

        return res.status(503).json({
            status: 'error',
            error: 'Service Unavailable',
            message: 'The server is temporarily overloaded. Shielding active. Please try again automatically in exactly ${seconds} seconds.'
        });
    }
    next();
}
export function isCritical() {
    return isCriticalMode;
}
export default { init, destroy, middleware, isCritical };
