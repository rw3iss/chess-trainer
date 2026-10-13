// ChatPanel — room chat: message list (auto-scrolls to the newest) + composer.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { ChatMessage } from '@chess/core/protocol';
import { IconButton } from '@/components/common/IconButton';
import { cx } from '@/lib/classNames';
import './ChatPanel.scss';

export interface ChatPanelProps {
	messages: ChatMessage[];
	/** userId of the local user (own messages align right). */
	selfId: string | null;
	onSend: (text: string) => void;
	disabled?: boolean;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function ChatPanel({ messages, selfId, onSend, disabled }: ChatPanelProps): JSX.Element {
	const [text, setText] = useState('');
	const listRef = useRef<HTMLOListElement>(null);
	useEffect(() => {
		const el = listRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages.length]);

	const submit = (e: Event) => {
		e.preventDefault();
		const t = text.trim();
		if (!t) return;
		onSend(t);
		setText('');
	};

	return (
		<section class="chat-panel" aria-label="Chat">
			<ol class="chat-panel__list" ref={listRef} aria-live="polite">
				{messages.length === 0 && <li class="chat-panel__empty">No messages yet. Say hello!</li>}
				{messages.map((m) => {
					const own = m.from.userId === selfId;
					return (
						<li key={m.id} class={cx('chat-panel__msg', own && 'chat-panel__msg--own')}>
							<span class="chat-panel__meta">
								<span class="chat-panel__from">{own ? 'You' : m.from.displayName}</span>
								<time class="chat-panel__time">{timeFmt.format(m.at)}</time>
							</span>
							<span class="chat-panel__text">{m.text}</span>
						</li>
					);
				})}
			</ol>
			<form class="chat-panel__composer" onSubmit={submit}>
				<input
					class="chat-panel__input"
					value={text}
					maxLength={500}
					placeholder={disabled ? 'Chat unavailable' : 'Message'}
					aria-label="Chat message"
					disabled={disabled}
					onInput={(e) => setText(e.currentTarget.value)}
				/>
				<IconButton icon="chevron-right" label="Send" variant="accent" size="sm" type="submit" disabled={disabled || !text.trim()} />
			</form>
		</section>
	);
}
