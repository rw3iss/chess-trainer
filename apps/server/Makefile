# ──────────────────────────────────────────────────────────────────────────
#  Makefile — native + docker administration for this NestJS service
#  Run `make help` to list every target.
# ──────────────────────────────────────────────────────────────────────────

SHELL := /bin/bash
PM ?= pnpm

COMPOSE_SERVICES := docker compose -f config/docker-compose.yml
COMPOSE_FULL     := docker compose -f config/docker-compose.full.yml
# Optional services to include: `make docker-services profiles="postgres redis"`
profiles ?= postgres redis
PROFILE_FLAGS    := $(foreach p,$(profiles),--profile $(p))

.DEFAULT_GOAL := help

# ── Native ────────────────────────────────────────────────────────────────
.PHONY: dev
dev: ## Run the app in watch mode (native; SQLite + in-memory cache by default)
	$(PM) --filter @chess/core build
	$(PM) start:dev

.PHONY: start
start: ## Run the compiled app (requires `make build` first)
	$(PM) start:prod

.PHONY: stop
stop: ## Stop any foreground `make dev` (use Ctrl+C); this is a no-op placeholder
	@echo "Native dev server runs in foreground — use Ctrl+C to stop."

.PHONY: restart
restart: stop dev ## Restart the native dev server

.PHONY: build
build: ## Build @chess/core, then compile the server to dist/
	$(PM) --filter @chess/core build
	$(PM) build

# ── Docker: optional services (app runs native) ───────────────────────────
.PHONY: docker-services
docker-services: ## Start optional postgres/redis (profiles="postgres redis"); set DB_TYPE / REDIS_HOST in .env
	$(COMPOSE_SERVICES) $(PROFILE_FLAGS) up -d

.PHONY: docker-services-stop
docker-services-stop: ## Stop optional services (preserves volumes)
	$(COMPOSE_SERVICES) $(PROFILE_FLAGS) down

.PHONY: docker-services-reset
docker-services-reset: ## Stop + wipe volumes for optional services
	$(COMPOSE_SERVICES) $(PROFILE_FLAGS) down -v

# ── Docker: full stack ────────────────────────────────────────────────────
.PHONY: docker-start
docker-start: ## Start api in docker (SQLite). Add services: make docker-start profiles="postgres redis"
	$(COMPOSE_FULL) $(if $(filter command line,$(origin profiles)),$(PROFILE_FLAGS),) up -d --build

.PHONY: docker-stop
docker-stop: ## Stop full stack (preserves volumes)
	$(COMPOSE_FULL) $(PROFILE_FLAGS) down

.PHONY: docker-restart
docker-restart: docker-stop docker-start ## Restart the full docker stack

.PHONY: docker-logs
docker-logs: ## Tail logs from the full stack
	$(COMPOSE_FULL) logs -f

# ── Tests / lint / typecheck ──────────────────────────────────────────────
.PHONY: test
test: ## Run the full test suite (jest)
	$(PM) test

.PHONY: test-smoke
test-smoke: ## Run smoke tests only
	$(PM) test:smoke

.PHONY: lint
lint: ## Run oxlint on src/
	$(PM) lint

.PHONY: typecheck
typecheck: ## Run tsc --noEmit
	$(PM) typecheck

# ── Migrations (TypeORM) ──────────────────────────────────────────────────
.PHONY: migration-run
migration-run: ## Apply pending migrations
	$(PM) migration:run

.PHONY: migration-revert
migration-revert: ## Revert the last migration
	$(PM) migration:revert

.PHONY: migration-generate
migration-generate: ## Generate a new migration from entity diffs. Usage: make migration-generate name=<Name>
	@test -n "$(name)" || (echo "usage: make migration-generate name=<Name>" && exit 1)
	$(PM) migration:generate src/database/migrations/$(name)

# ── Housekeeping ──────────────────────────────────────────────────────────
.PHONY: db-reset
db-reset: ## Delete the local SQLite database (data/)
	rm -rf data

.PHONY: clean
clean: ## Remove dist/ and node_modules
	rm -rf dist node_modules

.PHONY: install
install: ## Install dependencies
	$(PM) install

# ── Help ──────────────────────────────────────────────────────────────────
.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
