// Shared placeholder for pages another feature will build (keeps routes live meanwhile).
import type { JSX } from 'preact';
import { EmptyState } from '@/components/common/EmptyState';
import './PagePlaceholder.scss';

export function PagePlaceholder({ title, description }: { title: string; description: string }): JSX.Element {
	return (
		<div class="page-placeholder">
			<h1 class="page-placeholder__title">{title}</h1>
			<EmptyState icon="info" title="Coming soon" description={description} compact />
		</div>
	);
}
