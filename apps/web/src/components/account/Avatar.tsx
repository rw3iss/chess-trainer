// Round avatar: the account's image (cached data URL → works offline; else the server URL), else initials.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { activeAccount } from '@/state/account';
import { authUser, avatarSrc, sessionServerUrl } from '@/state/auth';
import './account.scss';

export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const s = parts.length > 1 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : (parts[0] ?? '?').slice(0, 2);
	return s.toUpperCase();
}

/** Image source for the active account: the cached copy when it matches the current avatar, else the server URL. */
export function activeAvatarSrc(): string | null {
	const user = authUser.value;
	const acc = activeAccount.value;
	if (user && !user.avatarUrl && user.avatarUrl !== undefined) return null;
	if (acc?.avatar && (!user?.avatarUrl || acc.avatarSrc === user.avatarUrl)) return acc.avatar;
	return avatarSrc(user, sessionServerUrl.value);
}

export function Avatar({ name, src, size = 40, class: className }: { name: string; src?: string | null; size?: number; class?: string }): JSX.Element {
	const [failed, setFailed] = useState<string | null>(null);
	const show = src && failed !== src;
	return (
		<span class={cx('avatar', className)} style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` }} aria-hidden="true">
			{show ? <img class="avatar__img" src={src} alt="" width={size} height={size} onError={() => setFailed(src)} /> : initials(name || '?')}
		</span>
	);
}
