// index.js
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

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
let config = {
    cpuThreshold: 85,
    ramThreshold: 10,
    intervalMs: 5000,
    retryAfterSecs: 30,
    logFilePath: path.join(process.cwd(), 'load-stopper.log'),
    multicastAddr: '239.1.2.3', 
    multicastPort: 5554
};

async function customLog({ level, msg, metrics }) {
    const timestamp = new Date().toISOString();
    const { cpu, freeRam } = metrics || {};
    
    const metricsStr = metrics ? ` [CPU: ${cpu}%, Free RAM: ${freeRam}%]` : '';
    const fileLogLine = `[${timestamp}] [${level.toUpperCase()}] ${msg}${metricsStr}\n`;

    let coloredLine = `${styles.gray}[${timestamp}]${styles.reset} `;

    switch (level) {
        case 'info':
            coloredLine += `${styles.cyan}${styles.bold}[INFO]${styles.reset} ${msg}`;
            break;
        case 'warn':
            coloredLine += `${styles.yellow}${styles.bold}[WARN]${styles.reset} ${msg}`;
            if (metrics) {
                coloredLine += ` ${styles.gray}(CPU: ${styles.yellow}${cpu}%${styles.gray}, Free RAM: ${styles.yellow}${freeRam}%${styles.gray})${styles.reset}`;
            }
            break;
        case 'critical':
            coloredLine += `${styles.bgRed}${styles.white}${styles.bold} [CRITICAL] ${styles.reset} ${styles.red}${msg}${styles.reset}`;
            if (metrics) {
                coloredLine += `\n  └─> ${styles.bold}System Status:${styles.reset} CPU: ${styles.red}${styles.bold}${cpu}%${styles.reset} | Free RAM: ${styles.red}${styles.bold}${freeRam}%${styles.reset}`;
            }
            break;
        case 'success':
            coloredLine += `${styles.green}${styles.bold}[SUCCESS]${styles.reset} ${msg}`;
            if (metrics) {
                coloredLine += ` ${styles.gray}(CPU: ${styles.green}${cpu}%${styles.gray}, Free RAM: ${styles.green}${freeRam}%${styles.gray})${styles.reset}`;
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
    
    const cpuLoad = 100 - Math.round((100 * idleDifference) / totalDifference);
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const freeMemPercent = Math.round((freeMem / totalMem) * 100);

    const metrics = { cpu: cpuLoad, freeRam: freeMemPercent };

    if (cpuLoad > config.cpuThreshold || freeMemPercent < config.ramThreshold) {
        if (!isCriticalMode) {
            isCriticalMode = true;
            await customLog({
                level: 'critical',
                msg: 'CRITICAL MODE ACTIVATED! Server load is too high.',
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
            isCriticalMode = false;
            await customLog({
                level: 'success',
                msg: 'Load stabilized. Circuit breaker disengaged. Returning to normal operational mode.',
                metrics
            });
        }
    }
    startMeasure = endMeasure;
}

import dgram from 'node:dgram';

export function init(userConfig = {}) {
    config = { ...config, ...userConfig };
    setInterval(checkMetrics, config.intervalMs);
    
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    socket.on('message', (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            if (data.senderPid === process.pid) return;

            if (data.action === 'ACTIVATE_SHIELD') {
                if (!isCriticalMode) {
                    isCriticalMode = true;
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

    socket.bind(config.multicastPort, '0.0.0.0', () => {
        try {
            socket.setMulticastLoopback(true);
            
            socket.addMembership(config.multicastAddr);
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
            
            client.send(message, config.multicastPort, config.multicastAddr, (err) => {
                if (err) {
                    console.error(`${styles.red}[LoadStopper Internal Error] Failed to broadcast cluster state: ${err.message}${styles.reset}`);
                }
                client.close();
            });
        } catch (e) {
            client.close();
        }
    });
}




export function middleware(req, res, next) {
    if (isCriticalMode) {
        const seconds = config.retryAfterSecs;
        res.status(503).set('Retry-After', '30').json({
            status: 'error',
            error: 'Service Unavailable',
            message: `The server is temporarily overloaded. Shielding active. Please try again automatically in exactly ${seconds} seconds.`
        });
        return;
    }
    next();
}

export function isCritical() {
    return isCriticalMode;
}

export default { init, middleware, isCritical };
