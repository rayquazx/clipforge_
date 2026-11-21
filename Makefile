# ==============================================================================
# ClipForge — Monorepo Makefile
# ==============================================================================

COMPOSE_BASE = docker compose -f docker-compose.yml
COMPOSE_DEV  = docker compose -f docker-compose.yml -f docker-compose.dev.yml

.PHONY: help up down build logs dev migrate migration shell-api shell-web clean ps restart seed seed-docker

# Default target
help:
	@echo "ClipForge Makefile commands:"
	@echo "  make up          - Start all services in the background"
	@echo "  make down        - Stop all running services"
	@echo "  make build       - Build or rebuild Docker images"
	@echo "  make logs        - Tail logs from all containers"
	@echo "  make dev         - Run services with development overrides & hot reload"
	@echo "  make migrate     - Run Alembic database migrations to head"
	@echo "  make migration   - Generate a new Alembic migration (usage: make migration m=\"message\")"
	@echo "  make seed        - Populate complete demo dataset (Phase 4 user, project, clip, render)"
	@echo "  make shell-api   - Open an interactive shell in the API container"
	@echo "  make shell-web   - Open an interactive shell in the Web container"
	@echo "  make restart     - Restart all containers"
	@echo "  make ps          - List running container status"
	@echo "  make clean       - Stop containers, remove volumes and orphaned networks"

# Start all services in detached mode
up:
	$(COMPOSE_BASE) up -d

# Stop all services
down:
	$(COMPOSE_BASE) down

# Build or rebuild Docker images
build:
	$(COMPOSE_BASE) build

# Tail logs from all running services
logs:
	$(COMPOSE_BASE) logs -f

# Run all services with dev overrides (volume mounts for hot reload)
dev:
	$(COMPOSE_DEV) up

# Apply Alembic database migrations
migrate:
	$(COMPOSE_BASE) exec api alembic upgrade head

# Seed complete Phase 4 demo dataset
seed:
	python scripts/seed_phase4.py

# Seed inside Docker container
seed-docker:
	$(COMPOSE_BASE) exec api python scripts/seed_phase4.py

# Generate a new revision with Alembic
migration:
	@if [ -z "$(m)" ]; then \
		echo "Error: Migration message required. Usage: make migration m=\"add_users_table\""; \
		exit 1; \
	fi
	$(COMPOSE_BASE) exec api alembic revision --autogenerate -m "$(m)"

# Interactive shell in API container
shell-api:
	$(COMPOSE_BASE) exec api /bin/sh

# Interactive shell in Web container
shell-web:
	$(COMPOSE_BASE) exec web /bin/sh

# List running containers
ps:
	$(COMPOSE_BASE) ps

# Restart all containers
restart:
	$(COMPOSE_BASE) restart

# Clean containers, volumes, networks, and orphans
clean:
	$(COMPOSE_BASE) down -v --remove-orphans
