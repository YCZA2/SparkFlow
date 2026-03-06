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
- `routers/`: API route layer
- `domains/`: domain services and repositories
- `schemas/`: shared Pydantic request/response models
- `services/`: external provider integrations (LLM/STT/vector)
- `models/`: SQLAlchemy models and database session
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
