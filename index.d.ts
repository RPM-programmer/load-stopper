// index.d.ts

/**
 * Configuration options for the load-stopper module.
 */
export interface LoadStopperConfig {
    /**
     * Maximum allowed CPU usage percentage (0-100).
     * @default 85
     */
    cpuThreshold?: number;

    /**
     * Minimum allowed free system memory percentage (0-100).
     * @default 10
     */
    ramThreshold?: number;

    /**
     * Resource check interval in milliseconds.
     * @default 5000
     */
    intervalMs?: number;

    /**
     * Absolute or relative path where clean text logs will be written.
     * @default path.join(process.cwd(), 'load-stopper.log')
     */
    logFilePath?: string;
}

/**
 * Initializes the load-stopper monitoring interval with custom or default thresholds.
 * @param userConfig Optional configuration object to override defaults.
 */
export function init(userConfig?: LoadStopperConfig): void;

/**
 * Express/Connect compatible middleware that intercepts requests during critical overloads
 * and responds with an HTTP 503 status code.
 */
export function middleware(req: any, res: any, next: () => void): void;

/**
 * Checks whether the server is currently operating in critical (overloaded) mode.
 * @returns true if critical mode is engaged, false otherwise.
 */
export function isCritical(): boolean;

/**
 * Default export containing all core module methods.
 */
declare const _default: {
    init: typeof init;
    middleware: typeof middleware;
    isCritical: typeof isCritical;
};

export default _default;
