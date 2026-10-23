export interface LoadStopperConfig {
    cpuThreshold?: number;
    ramThreshold?: number;
    maxEventLoopDelayMs?: number;
    recoveryDelta?: number;
    cooldownMs?: number;
    intervalMs?: number;
    retryAfterSecs?: number;
    logFilePath?: string;
    multicastAddr?: string;
    multicastPort?: number;
    onOverload?: (req: any, res: any, next: () => void) => void;
}

export function init(userConfig?: LoadStopperConfig): void;
export function middleware(req: any, res: any, next: () => void): void;
export function isCritical(): boolean;
export function destroy(): void;

declare const _default: {
    init: typeof init;
    middleware: typeof middleware;
    isCritical: typeof isCritical;
    destroy: typeof destroy;
};

export default _default;
