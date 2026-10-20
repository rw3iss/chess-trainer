// socketTarget — turn `${serverUrl}${namespace}` into a socket.io (url, path) pair.
// socket.io reads the URL path as the NAMESPACE, so a server mounted under a
// prefix (e.g. https://chess.ryanweiss.net/api behind a reverse proxy) must
// connect to `${origin}${namespace}` with `path: ${prefix}/socket.io`.
export interface SocketTarget {
	url: string;
	path: string;
}

export function socketTarget(fullUrl: string): SocketTarget {
	const u = new URL(fullUrl);
	const parts = u.pathname.replace(/\/+$/, '').split('/');
	const namespace = `/${parts.pop() ?? ''}`;
	const prefix = parts.join('/');
	return { url: `${u.origin}${namespace}`, path: `${prefix}/socket.io` };
}
