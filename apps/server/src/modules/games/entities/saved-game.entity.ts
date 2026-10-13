import { Entity } from 'typeorm';
import type { SavedGame } from '@chess/core';
import { SyncedRow } from './synced-row';

@Entity('saved_games')
export class SavedGameEntity extends SyncedRow<SavedGame> {}
