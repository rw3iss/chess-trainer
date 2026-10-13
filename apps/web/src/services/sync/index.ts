// Store-agnostic sync engine. The app instance (wired to the stores) lives in '@/state/sync'.
export { SyncService, type SyncStoreAdapter } from './SyncService';
export { mergeSync, type SyncDoc } from './merge';
