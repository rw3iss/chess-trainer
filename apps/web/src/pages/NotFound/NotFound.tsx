import type { JSX } from 'preact';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';

export default function NotFound(): JSX.Element {
	return (
		<div>
			<EmptyState icon="search" title="Page not found" description="That address doesn't match anything here.">
				<Button variant="secondary" onClick={() => history.back()}>
					Go back
				</Button>
			</EmptyState>
		</div>
	);
}
