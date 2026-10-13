// Bot game status for a session: engine · Elo · your colour, thinking state,
// Takeback (when allowed), Bot settings and Detach (back to analysis).
import type { JSX } from 'preact';
import { activeResult, type Session } from '@chess/core/game';
import { Badge, Button, Spinner } from '@/components/common';
import { commands } from '@/services/commands';
import { botActions, botError, engineEntry, isAtBotTip, isBotThinking } from '@/state';
import { cx } from '@/lib/classNames';
import './BotStatusCard.scss';

export interface BotStatusCardProps {
	session: Session;
	class?: string;
}

export function BotStatusCard({ session, class: className }: BotStatusCardProps): JSX.Element | null {
	const bot = session.bot;
	if (session.mode !== 'bot' || !bot) return null;
	const name = engineEntry(bot.engineId)?.meta.name ?? bot.engineId;
	const you = bot.color === 'white' ? 'Black' : 'White';
	const thinking = isBotThinking(session.id);
	const err = botError(session.id);
	const atTip = isAtBotTip(session);
	const canTakeback = botActions.takebackPlies(session) > 0;
	let status: JSX.Element;
	if (err) status = <span class="bot-status__state bot-status__state--error">{err}</span>;
	else if (activeResult(session)) status = <span class="bot-status__state">Game over</span>;
	else if (thinking)
		status = (
			<span class="bot-status__state bot-status__state--thinking">
				<Spinner size={14} label="Bot is thinking" /> Thinking…
			</span>
		);
	else if (!atTip) status = <span class="bot-status__state">Browsing history — go to the latest move to continue</span>;
	else status = <span class="bot-status__state">Your move</span>;

	return (
		<section class={cx('bot-status', className)} aria-label="Bot game">
			<header class="bot-status__head">
				<Badge tone="accent">vs Bot</Badge>
				<span class="bot-status__name">{name}</span>
				<span class="bot-status__elo">{bot.targetElo}</span>
			</header>
			<p class="bot-status__meta">
				You play <strong>{you}</strong>
				{session.clock && <> · clock {Math.round(session.clock.config.initialMs / 60000)}+{Math.round(session.clock.config.incrementMs / 1000)}</>}
				{bot.allowTakebacks ? ' · takebacks on' : ''}
			</p>
			{status}
			<div class="bot-status__actions">
				{bot.allowTakebacks && (
					<Button size="sm" variant="secondary" icon="undo" disabled={!canTakeback} onClick={() => botActions.takeback(session.id)}>
						Takeback
					</Button>
				)}
				<Button size="sm" variant="ghost" icon="settings" onClick={() => commands.dispatch('openBot')}>
					Bot settings
				</Button>
				<Button size="sm" variant="secondary" icon="close" onClick={() => botActions.detach(session.id)}>
					Detach
				</Button>
			</div>
		</section>
	);
}
