// Single injection point for server-only data (build-skill mock-layer rule).
// `api` delegates per call: HttpApiAdapter while ServerConnector is 'online',
// MockApiAdapter otherwise — callers never pick an adapter themselves.
import { computed } from '@preact/signals';
import { serverConnector } from '@/services/server';
import type { ApiClient } from './ApiClient';
import { HttpApiAdapter } from './HttpApiAdapter';
import { MockApiAdapter } from './MockApiAdapter';

export type { AccountApi, ApiClient, RoomSummary, UpdateAccountRequest } from './ApiClient';
export { ApiRequestError, AVATAR_FIELD } from './ApiClient';
export { HttpApiAdapter, type HttpApiOptions } from './HttpApiAdapter';

let tokenProvider: () => string | null = () => null;
let unauthorizedHandler: (() => Promise<string | null>) | null = null;
const mock: ApiClient = new MockApiAdapter();
let http: HttpApiAdapter | null = null;
let httpUrl: string | null = null;

/** Auth layer registers how to read the current access token. */
export function setAuthTokenProvider(fn: () => string | null): void {
	tokenProvider = fn;
}

/** Auth layer registers how to get a fresh token after a 401 (refresh flow). */
export function setUnauthorizedHandler(fn: (() => Promise<string | null>) | null): void {
	unauthorizedHandler = fn;
}

function httpFor(url: string): HttpApiAdapter {
	if (!http || httpUrl !== url) {
		http = new HttpApiAdapter({ baseUrl: url, getToken: () => tokenProvider(), onUnauthorized: () => unauthorizedHandler?.() ?? Promise.resolve(null) });
		httpUrl = url;
	}
	return http;
}

/** The adapter that should serve a request right now. */
export function currentApi(): ApiClient {
	const url = serverConnector.url.value;
	return serverConnector.status.value === 'online' && url ? httpFor(url) : mock;
}

export const apiKind = computed<ApiClient['kind']>(() => (serverConnector.status.value === 'online' ? 'http' : 'mock'));

export const api: ApiClient = {
	get kind() {
		return currentApi().kind;
	},
	health: () => currentApi().health(),
	login: (req) => currentApi().login(req),
	refresh: (t) => currentApi().refresh(t),
	guest: (req) => currentApi().guest(req),
	me: () => currentApi().me(),
	forgotPassword: (req) => currentApi().forgotPassword(req),
	resetPassword: (req) => currentApi().resetPassword(req),
	changePassword: (req) => currentApi().changePassword(req),
	account: () => currentApi().account(),
	updateAccount: (req) => currentApi().updateAccount(req),
	register: (req) => currentApi().register(req),
	oauthStart: (provider, req) => currentApi().oauthStart(provider, req),
	oauthExchange: (code) => currentApi().oauthExchange(code),
	identities: () => currentApi().identities(),
	unlinkIdentity: (provider) => currentApi().unlinkIdentity(provider),
	createInvite: (req) => currentApi().createInvite(req),
	invites: () => currentApi().invites(),
	invitePreview: (code) => currentApi().invitePreview(code),
	verifyEmail: (token) => currentApi().verifyEmail(token),
	resendVerification: () => currentApi().resendVerification(),
	sessions: () => currentApi().sessions(),
	revokeSession: (id) => currentApi().revokeSession(id),
	logout: (t) => currentApi().logout(t),
	createRecoveryCodes: (p) => currentApi().createRecoveryCodes(p),
	recoveryCodesLeft: () => currentApi().recoveryCodesLeft(),
	recoverPassword: (req) => currentApi().recoverPassword(req),
	uploadAvatar: (f) => currentApi().uploadAvatar(f),
	deleteAvatar: () => currentApi().deleteAvatar(),
	deleteAccount: (req) => currentApi().deleteAccount(req),
	ownerResetLink: (u) => currentApi().ownerResetLink(u),
	explorer: (fen, source) => currentApi().explorer(fen, source),
	engines: () => currentApi().engines(),
	sync: (req) => currentApi().sync(req),
	rooms: () => currentApi().rooms(),
};
