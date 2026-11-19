// Profile → Security: devices signed in to this account (sessions). Sign out any device; signing out
// "This device" signs out here (same as the header menu).
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { DeviceSessionDto } from '@chess/core/protocol';
import { Badge, Button } from '@/components/common';
import { formatRelativeTime } from '@/lib/format';
import { toast } from '@/services/toast';
import { authActions, authUser } from '@/state/auth';
import './account.scss';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function DeviceSessions(): JSX.Element | null {
	const userId = authUser.value?.id;
	const [list, setList] = useState<DeviceSessionDto[] | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let live = true;
		authActions.sessions().then(
			(l) => live && setList([...l].sort((a, b) => Number(b.current) - Number(a.current) || b.lastUsedAt - a.lastUsedAt)),
			(e: unknown) => live && setError(message(e)),
		);
		return () => {
			live = false;
		};
	}, [userId]);

	if (!userId) return null;
	const now = Date.now();
	return (
		<section class="account-block" aria-labelledby="account-devices">
			<h4 class="account-block__title" id="account-devices">
				Devices
			</h4>
			{list && list.length === 0 && <p class="account-text">No signed-in devices.</p>}
			{list && list.length > 0 && (
				<ul class="account-list" aria-label="Signed-in devices">
					{list.map((d) => (
						<li key={d.id} class="account-list__row">
							<span class="account-list__main">
								<span class="account-list__name">
									{d.label || 'Unknown device'} {d.current && <Badge tone="accent">This device</Badge>}
								</span>
								<span class="account-list__sub">
									Last active {formatRelativeTime(d.lastUsedAt, now)} · signed in {formatRelativeTime(d.createdAt, now)}
								</span>
							</span>
							<Button
								variant="ghost"
								size="sm"
								loading={busy === d.id}
								aria-label={`Sign out ${d.current ? 'this device' : d.label || 'device'}`}
								onClick={() => {
									if (d.current) {
										void authActions.logout();
										return;
									}
									setBusy(d.id);
									setError(null);
									authActions
										.revokeSession(d.id)
										.then(() => {
											setList((l) => (l ?? []).filter((x) => x.id !== d.id));
											toast.success(`${d.label || 'Device'} signed out`);
										}, (e: unknown) => setError(message(e)))
										.finally(() => setBusy(null));
								}}
							>
								Sign out
							</Button>
						</li>
					))}
				</ul>
			)}
			{error && (
				<p class="account-error" role="alert">
					{error}
				</p>
			)}
		</section>
	);
}
