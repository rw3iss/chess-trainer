// Profile → Security: sign-in providers linked to this account (link / unlink).
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { IdentityDto } from '@chess/core/protocol';
import { Button } from '@/components/common';
import { toast } from '@/services/toast';
import { authActions, authUser } from '@/state/auth';
import { PROVIDER_NAME, ProviderButtons, availableProviders } from './ProviderButtons';
import './account.scss';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function LinkedSignIns(): JSX.Element | null {
	const userId = authUser.value?.id;
	const [list, setList] = useState<IdentityDto[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const offered = availableProviders();

	useEffect(() => {
		let live = true;
		authActions.identities().then(
			(l) => live && setList(l),
			(e: unknown) => live && setError(message(e)),
		);
		return () => {
			live = false;
		};
	}, [userId]);

	if (!offered.length && !list?.length) return null;
	return (
		<section class="account-block" aria-labelledby="account-linked">
			<h4 class="account-block__title" id="account-linked">
				Sign-in methods
			</h4>
			{list && list.length > 0 && (
				<ul class="account-list">
					{list.map((i) => (
						<li key={i.provider} class="account-list__row">
							<span class="account-list__main">
								<span class="account-list__name">{PROVIDER_NAME[i.provider] ?? i.provider}</span>
								<span class="account-list__sub">{i.label}</span>
							</span>
							<Button
								variant="ghost"
								size="sm"
								loading={busy === i.provider}
								onClick={() => {
									setBusy(i.provider);
									setError(null);
									authActions
										.unlinkIdentity(i.provider)
										.then(() => {
											setList((l) => (l ?? []).filter((x) => x.provider !== i.provider));
											toast.success(`${PROVIDER_NAME[i.provider] ?? i.provider} unlinked`);
										}, (e: unknown) => setError(message(e)))
										.finally(() => setBusy(null));
								}}
							>
								Unlink
							</Button>
						</li>
					))}
				</ul>
			)}
			<ProviderButtons mode="link" returnTo="/profile" exclude={(list ?? []).map((i) => i.provider)} />
			{error && (
				<p class="account-error" role="alert">
					{error}
				</p>
			)}
		</section>
	);
}
