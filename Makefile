.PHONY: dev test lint train seed api-types api-types-check help

help:
	@echo "Sentinel Flow CLI tasks:"
	@echo "  make dev             - Start development servers (FastAPI backend + Vite frontend)"
	@echo "  make test            - Execute backend and safety invariant tests"
	@echo "  make lint            - Check code quality and style standards"
	@echo "  make train           - Train academic ML detection models"
	@echo "  make seed            - Seed database with replay fixtures"
	@echo "  make api-types       - Generate TypeScript definitions from FastAPI OpenAPI spec"
	@echo "  make api-types-check - Verify src/api/schema.d.ts is not stale (CI check)"

dev:
	python -m uvicorn app.main:app --app-dir backend --port 8000 --reload

test:
	python -m pytest backend/tests -v

lint:
	python -m pytest backend/tests/test_safety_invariants.py -v

train:
	python backend/train_model.py

seed:
	python scripts/seed_demo_data.py

api-types:
	python scripts/generate_openapi_types.py

api-types-check:
	python scripts/generate_openapi_types.py --check
