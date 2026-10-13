// Settings section registry: order, labels, icons and components.
// Add a section: create sections/<Name>Section.tsx and add an entry here.
import type { ComponentType } from 'preact';
import type { IconName } from '@/components/common/Icon';
import { AppSection } from './sections/AppSection';
import { BoardSection } from './sections/BoardSection';
import { ClockSection } from './sections/ClockSection';
import { DataSection } from './sections/DataSection';
import { EnginesSection } from './sections/EnginesSection';
import { PiecesSection } from './sections/PiecesSection';
import { ServerSection } from './sections/ServerSection';
import { ThemeEditorSection } from './sections/ThemeEditorSection';

export interface SettingsSectionDef {
	id: string;
	label: string;
	icon: IconName;
	/** One-line summary for the mobile section list. */
	summary: string;
	component: ComponentType;
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
	{ id: 'app', label: 'App', icon: 'settings', summary: 'Theme, accent, text size, sound, motion', component: AppSection },
	{ id: 'board', label: 'Board', icon: 'board', summary: 'Board theme, coordinates, highlights, input', component: BoardSection },
	{ id: 'pieces', label: 'Pieces', icon: 'knight', summary: 'Piece set and colours', component: PiecesSection },
	{ id: 'theme-editor', label: 'Theme editor', icon: 'edit', summary: 'Create custom board and piece themes', component: ThemeEditorSection },
	{ id: 'engines', label: 'Engines', icon: 'bot', summary: 'Analysis engine and bot defaults', component: EnginesSection },
	{ id: 'clock', label: 'Clock', icon: 'clock', summary: 'Time controls and clock display', component: ClockSection },
	{ id: 'server', label: 'Server', icon: 'server', summary: 'Sign in, sync and online play', component: ServerSection },
	{ id: 'data', label: 'Data', icon: 'download', summary: 'Backup, import, caches, storage', component: DataSection },
];

export const DEFAULT_SECTION = 'app';

export function findSection(id: string | undefined): SettingsSectionDef | undefined {
	return SETTINGS_SECTIONS.find((s) => s.id === id);
}
