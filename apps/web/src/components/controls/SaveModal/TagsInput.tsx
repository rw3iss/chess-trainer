// TagsInput — chips + text field. Enter / comma adds a tag, Backspace on an
// empty field removes the last one, blur commits pending text.
import type { JSX } from 'preact';
import { useId, useState } from 'preact/hooks';
import { Chip } from '@/components/common/Chip';
import './TagsInput.scss';

export interface TagsInputProps {
	label?: string;
	value: string[];
	onChange: (tags: string[]) => void;
	placeholder?: string;
	/** Existing tags offered as suggestions (datalist). */
	suggestions?: string[];
	maxLength?: number;
}

/** Normalise and merge tags (trim, collapse spaces, case-insensitive dedupe). */
export function mergeTags(current: readonly string[], raw: string, maxLength = 32): string[] {
	const out = [...current];
	const seen = new Set(current.map((t) => t.toLowerCase()));
	for (const part of raw.split(',')) {
		const t = part.trim().replace(/\s+/g, ' ').slice(0, maxLength);
		if (!t || seen.has(t.toLowerCase())) continue;
		seen.add(t.toLowerCase());
		out.push(t);
	}
	return out;
}

export function TagsInput({ label = 'Tags', value, onChange, placeholder = 'Add a tag…', suggestions = [], maxLength = 32 }: TagsInputProps): JSX.Element {
	const [text, setText] = useState('');
	const id = `tags-${useId()}`;
	const commit = () => {
		if (!text.trim()) return;
		onChange(mergeTags(value, text, maxLength));
		setText('');
	};
	const available = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));

	return (
		<div class="field tags-input">
			<label class="field__label" for={id}>
				{label}
			</label>
			<div class="tags-input__box" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
				{value.map((t) => (
					<Chip key={t} size="sm" label={t} onRemove={() => onChange(value.filter((x) => x !== t))} />
				))}
				<input
					id={id}
					class="tags-input__field"
					value={text}
					placeholder={value.length ? '' : placeholder}
					list={available.length ? `${id}-list` : undefined}
					maxLength={maxLength * 4}
					onInput={(e) => {
						const v = e.currentTarget.value;
						if (v.includes(',')) {
							onChange(mergeTags(value, v, maxLength));
							setText('');
						} else setText(v);
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							if (text.trim()) {
								e.preventDefault();
								commit();
							}
						} else if (e.key === 'Backspace' && !text && value.length) {
							onChange(value.slice(0, -1));
						}
					}}
					onBlur={commit}
				/>
				{available.length > 0 && (
					<datalist id={`${id}-list`}>
						{available.map((s) => (
							<option key={s} value={s} />
						))}
					</datalist>
				)}
			</div>
			<p class="field__hint">Enter or comma to add · Backspace removes the last</p>
		</div>
	);
}
