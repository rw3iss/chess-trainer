# services/

Side-effectful modules behind narrow interfaces. Components/stores import a service's `index.ts`, never a concrete adapter.

```
services/
├── api/        ApiClient (server-only data) + HttpApiAdapter + MockApiAdapter; index.ts = injection point (`api`)
├── db/         Dexie schema + repositories (interfaces + Dexie impl); getRepositories()
├── server/     ServerConnector — probes the optional server, status signal
├── cache/      DataCache (TTL) over IndexedDB/memory backends
├── commands/   CommandBus (save, saveAs, focusSearch, …)
├── playback/   PlaybackController (dependency-injected auto-stepper)
├── toast/      toast queue (signals)
├── engine/     engine registry + adapters (engine feature)
└── sw/         service worker (sw.ts) + registration signals (register.ts)
```

See `../../BUILD.md` for the layering rule and extension points.
