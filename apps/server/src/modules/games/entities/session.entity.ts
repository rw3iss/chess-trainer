import { Entity } from 'typeorm';
import type { Session } from '@chess/core';
import { SyncedRow } from './synced-row';

@Entity('sessions')
export class SessionEntity extends SyncedRow<Session> {}
