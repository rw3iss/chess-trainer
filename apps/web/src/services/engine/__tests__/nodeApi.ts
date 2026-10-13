/**
 * Node built-ins for the real-engine tests. Loaded through a non-literal
 * specifier because the app tsconfig has no @types/node; these tests run in
 * vitest's node environment only.
 */
const load = <T>(id: string): Promise<T> => import(/* @vite-ignore */ id) as Promise<T>;

export interface NodeFs {
	readFileSync(path: string, enc?: 'utf8'): Uint8Array & string;
	existsSync(path: string): boolean;
}
export interface NodeModule {
	createRequire(from: string | URL): (id: string) => unknown;
}

export const nodeFs = (): Promise<NodeFs> => load<NodeFs>('node:fs');
export const nodeModule = (): Promise<NodeModule> => load<NodeModule>('node:module');
export const nodeHttp = (): Promise<{ createServer(): NodeHttpServer }> => load('node:http');

export interface NodeHttpServer {
	listen(port: number, host: string, cb: () => void): void;
	address(): { port: number } | string | null;
	close(): void;
}

export const env = (name: string): string | undefined =>
	(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[name];

/** Absolute filesystem path of a URL relative to the calling module. */
export const fsPath = (rel: string, base: string): string => decodeURIComponent(new URL(rel, base).pathname);
