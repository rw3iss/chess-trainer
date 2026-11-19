// Profile → avatar: pick an image → center square, 256 px WebP (prepareAvatar) → upload; remove.
// The uploaded image is cached in the known-accounts list so the header shows it offline.
import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { Button } from '@/components/common';
import { toast } from '@/services/toast';
import { accountActions } from '@/state/account';
import { authActions, authUser } from '@/state/auth';
import { AVATAR_ACCEPT, prepareAvatar } from './avatarImage';
import { Avatar, activeAvatarSrc } from './Avatar';
import './account.scss';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AvatarEditor(): JSX.Element | null {
	const user = authUser.value;
	const input = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
	const [error, setError] = useState<string | null>(null);
	if (!user) return null;

	const upload = async (file: File) => {
		setBusy('upload');
		setError(null);
		try {
			const blob = await prepareAvatar(file);
			const next = await authActions.uploadAvatar(blob);
			await accountActions.cacheAvatar(next, blob);
			toast.success('Picture saved');
		} catch (e) {
			setError(message(e));
		} finally {
			setBusy(null);
			if (input.current) input.current.value = '';
		}
	};

	return (
		<div class="avatar-editor">
			<Avatar name={user.displayName || user.username} src={activeAvatarSrc()} size={72} />
			<div class="avatar-editor__side">
				<div class="account-form__actions">
					<Button variant="secondary" size="sm" icon="upload" loading={busy === 'upload'} disabled={!!busy} onClick={() => input.current?.click()}>
						{user.avatarUrl ? 'Change picture' : 'Add picture'}
					</Button>
					{user.avatarUrl && (
						<Button
							variant="ghost"
							size="sm"
							loading={busy === 'remove'}
							disabled={!!busy}
							onClick={() => {
								setBusy('remove');
								setError(null);
								authActions
									.deleteAvatar()
									.then(async (u) => {
										await accountActions.cacheAvatar({ id: u.id, avatarUrl: null });
										toast.success('Picture removed');
									}, (e: unknown) => setError(message(e)))
									.finally(() => setBusy(null));
							}}
						>
							Remove
						</Button>
					)}
				</div>
				<span class="account-text account-text--subtle">PNG, JPEG or WebP. Cropped to a square.</span>
				{error && (
					<p class="account-error" role="alert">
						{error}
					</p>
				)}
			</div>
			<input
				ref={input}
				type="file"
				accept={AVATAR_ACCEPT}
				hidden
				aria-label="Picture file"
				onChange={(e) => {
					const f = e.currentTarget.files?.[0];
					if (f) void upload(f);
				}}
			/>
		</div>
	);
}
