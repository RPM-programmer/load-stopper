// index.js
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

// Наша собственная палитра стилей для терминала
const styles = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    // Цвета текста
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    gray: '\x1b[90m',
    // Цвета фона (для ярких акцентов)
    bgRed: '\x1b[41m',
    white: '\x1b[37m'
};

let isCriticalMode = false;
let config = {
    cpuThreshold: 85,
    ramThreshold: 10,
    intervalMs: 5000,
    logFilePath: path.join(process.cwd(), 'load-stopper.log')
};

// Наш собственный красивый логгер
async function customLog({ level, msg, metrics }) {
    const timestamp = new Date().toISOString();
    const { cpu, freeRam } = metrics || {};
    
    // 1. Форматируем чистый текст для записи в файл (без ломающих ANSI-кодов)
    const metricsStr = metrics ? ` [CPU: ${cpu}%, Free RAM: ${freeRam}%]` : '';
    const fileLogLine = `[${timestamp}] [${level.toUpperCase()}] ${msg}${metricsStr}\n`;

    // 2. Форматируем стилизованный цветной текст для консоли разработчика
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
            // Делаем критическую ошибку максимально заметной (белый текст на красном фоне + жирный)
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

    // Выводим стилизованную строку в консоль
    if (level === 'critical' || level === 'warn') {
        console.error(coloredLine);
    } else {
        console.log(coloredLine);
    }

    // Записываем чистую строку на диск асинхронно
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

export function init(userConfig = {}) {
    config = { ...config, ...userConfig };
    setInterval(checkMetrics, config.intervalMs);
    
    customLog({
        level: 'info',
        msg: `Module initialized. Thresholds -> CPU: ${config.cpuThreshold}%, Free RAM: ${config.ramThreshold}%`
    });
}

export function middleware(req, res, next) {
    if (isCriticalMode) {
        res.status(503).set('Retry-After', '30').json({
            status: 'error',
            error: 'Service Unavailable',
            message: 'The server is temporarily overloaded and protecting itself from crashing. Please try again later.'
        });
        return;
    }
    next();
}

export function isCritical() {
    return isCriticalMode;
}

export default { init, middleware, isCritical };
