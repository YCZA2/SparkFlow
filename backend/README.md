# SparkFlow Backend

FastAPI backend for SparkFlow.

## Quick Start

1. Create venv and install dependencies.
2. Configure `.env` (see `.env.example`).
3. Start server:

```bash
uvicorn main:app --reload
```

Default local address: `http://127.0.0.1:8000`

## Project Structure

- `main.py`: app entry, middleware, exception handlers, route registration
- `modules/*/presentation.py`: FastAPI route layer and request/response DTOs
- `modules/*/application.py`: use cases and orchestration
- `modules/shared/`: container, ports, shared adapters
- `domains/*/repository.py`: SQLAlchemy data access
- `services/`: external provider implementations and factories
- `models/`: SQLAlchemy models and database session
- `prompts/`: script generation prompt templates
- `utils/`: shared utility helpers
- `constants/`: shared constants

## Tests

Current tests are runnable with `unittest`:

```bash
cd backend
.venv/bin/python -m unittest discover -s tests -p 'test*.py'
```

## API Docs

When `DEBUG=true`:

- Swagger UI: `/docs`
- ReDoc: `/redoc`
