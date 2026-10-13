import type { ComponentChildren, InputHTMLAttributes, JSX, Ref, TextareaHTMLAttributes } from 'preact';
import { useId } from 'preact/hooks';
import { cx } from '@/lib/classNames';
import { Icon, type IconName } from '../Icon';
import './Input.scss';

interface FieldChromeProps {
	label?: string;
	hint?: string;
	error?: string;
}

export interface InputProps extends FieldChromeProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'icon' | 'label' | 'ref'> {
	/** Leading icon. */
	icon?: IconName;
	/** Trailing slot (clear button, unit label, …). */
	trailing?: ComponentChildren;
	inputRef?: Ref<HTMLInputElement>;
	class?: string;
}

export interface TextareaProps extends FieldChromeProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'label' | 'ref'> {
	textareaRef?: Ref<HTMLTextAreaElement>;
	class?: string;
}

function describedBy(id: string, hint?: string, error?: string, extra?: string): string | undefined {
	const ids = [extra, error ? `${id}-error` : hint ? `${id}-hint` : undefined].filter(Boolean);
	return ids.length ? ids.join(' ') : undefined;
}

function FieldMessages({ id, hint, error }: { id: string; hint?: string; error?: string }): JSX.Element | null {
	if (error)
		return (
			<p class="field__error" id={`${id}-error`}>
				{error}
			</p>
		);
	if (hint)
		return (
			<p class="field__hint" id={`${id}-hint`}>
				{hint}
			</p>
		);
	return null;
}

export function Input({ label, hint, error, icon, trailing, inputRef, class: className, id: idProp, disabled, type = 'text', ...rest }: InputProps): JSX.Element {
	const autoId = useId();
	const id = (idProp as string | undefined) ?? `in-${autoId}`;
	return (
		<div class={cx('field', { 'field--error': !!error, 'field--disabled': !!disabled }, className)}>
			{label && (
				<label class="field__label" for={id}>
					{label}
				</label>
			)}
			<div class={cx('field__control', { 'field__control--icon': !!icon, 'field__control--trailing': trailing != null })}>
				{icon && <Icon name={icon} size={18} class="field__icon" />}
				<input
					{...rest}
					ref={inputRef}
					id={id}
					type={type}
					disabled={disabled}
					class="field__input"
					aria-invalid={error ? true : undefined}
					aria-describedby={describedBy(id, hint, error, rest['aria-describedby'] as string | undefined)}
				/>
				{trailing != null && <div class="field__trailing">{trailing}</div>}
			</div>
			<FieldMessages id={id} hint={hint} error={error} />
		</div>
	);
}

export function Textarea({ label, hint, error, textareaRef, class: className, id: idProp, disabled, rows = 4, ...rest }: TextareaProps): JSX.Element {
	const autoId = useId();
	const id = (idProp as string | undefined) ?? `ta-${autoId}`;
	return (
		<div class={cx('field', { 'field--error': !!error, 'field--disabled': !!disabled }, className)}>
			{label && (
				<label class="field__label" for={id}>
					{label}
				</label>
			)}
			<div class="field__control field__control--multiline">
				<textarea
					{...rest}
					ref={textareaRef}
					id={id}
					rows={rows}
					disabled={disabled}
					class="field__input field__input--textarea"
					aria-invalid={error ? true : undefined}
					aria-describedby={describedBy(id, hint, error, rest['aria-describedby'] as string | undefined)}
				/>
			</div>
			<FieldMessages id={id} hint={hint} error={error} />
		</div>
	);
}
