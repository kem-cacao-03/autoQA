# AutoQA Gen — Project Overview

## What is this?

AutoQA Gen is an AI-powered test case generation platform. You describe a software requirement in plain language, and the system uses multiple LLMs (OpenAI GPT-4o, Google Gemini, Anthropic Claude) to automatically generate a structured test suite for you.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Python + FastAPI |
| Database | MongoDB (main data) + Elasticsearch (full-text search) |
| AI Providers | OpenAI GPT-4o, Google Gemini, Anthropic Claude |
| Auth | JWT (access token + refresh token) |
| Infrastructure | Docker Compose (MongoDB + Elasticsearch) |

---

## Architecture: Modular Monolith + Async Task-Based

The backend is a single deployable unit (monolith) but internally divided into fully independent modules. Each module owns its own router, schema, and service. No module imports from another module directly.

Heavy AI work (LLM calls) runs as async background tasks so the HTTP request returns immediately and the frontend polls for results.

```
backend/app/
├── core/          ← Shared utilities (config, security, schemas, dependencies)
├── db/            ← Database connections (MongoDB, Elasticsearch)
└── modules/
    ├── auth/      ← User registration, login, profile
    ├── generator/ ← AI test case generation (core feature)
    └── history/   ← Storing and searching past results
```

---

## Project Directory Structure

```
autoqa-gen/
├── backend/
│   ├── .env                          ← API keys, DB URLs, JWT secrets
│   ├── requirements.txt              ← Python dependencies
│   └── app/
│       ├── main.py                   ← App factory, lifespan, route registration
│       ├── core/
│       │   ├── config.py             ← Reads .env via Pydantic Settings
│       │   ├── schemas.py            ← Shared GenerationResult contract
│       │   ├── security.py           ← bcrypt hashing, JWT create/decode
│       │   └── dependencies.py       ← FastAPI DI: get_db, get_current_user
│       ├── db/
│       │   ├── database.py           ← MongoDB Motor client, index creation
│       │   └── elastic.py            ← Elasticsearch client, index mapping
│       └── modules/
│           ├── auth/
│           │   ├── router.py         ← /auth/* HTTP endpoints
│           │   ├── schema.py         ← Request/response models
│           │   └── service.py        ← Registration, login, profile logic
│           ├── generator/
│           │   ├── router.py         ← /generate/* HTTP endpoints
│           │   ├── schema.py         ← GenerateRequest, JobStatusResponse, enums
│           │   ├── service.py        ← Validate keys, create job, dispatch
│           │   ├── tasks.py          ← Async job orchestration (pipeline/research)
│           │   ├── llm_caller.py     ← LLM provider dispatch + retry logic
│           │   └── prompts.py        ← Role-based prompt templates
│           └── history/
│               ├── router.py         ← /history/* HTTP endpoints
│               ├── schema.py         ← HistoryItem, HistoryDetail models
│               ├── service.py        ← CRUD, favorite toggle
│               └── indexer.py        ← Elasticsearch index/search/delete
├── frontend/
│   ├── .env                          ← VITE_API_URL
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx                  ← React root, wraps all Context Providers
│       ├── App.tsx                   ← Route definitions
│       ├── contexts/
│       │   ├── AuthContext.tsx       ← User session state
│       │   ├── GeneratorContext.tsx  ← Multi-job queue, polling
│       │   └── ThemeContext.tsx      ← Dark/light mode
│       ├── pages/
│       │   ├── GeneratorPage.tsx     ← Main generation UI
│       │   ├── HistoryPage.tsx       ← History list + detail drawer
│       │   ├── LoginPage.tsx
│       │   ├── RegisterPage.tsx
│       │   └── ProfilePage.tsx
│       ├── components/
│       │   ├── Navbar.tsx            ← Top nav with active job indicator
│       │   ├── ProtectedRoute.tsx    ← Auth guard for routes
│       │   ├── TestCaseCard.tsx      ← Collapsible test case display
│       │   ├── SortBar.tsx           ← Sort and filter test cases
│       │   ├── ProviderLogo.tsx      ← LLM provider visual badge
│       │   └── FilenameDialog.tsx    ← Export filename input
│       └── lib/
│           ├── api.ts                ← HTTP client with auto token refresh
│           └── export.ts             ← Export to JSON and styled Excel
├── docker-compose.yml                ← MongoDB + Elasticsearch services
└── docs/
    ├── project-overview.md           ← This file
    ├── database-design.md            ← MongoDB collection schemas
    ├── class-diagram.drawio
    ├── system-flow.drawio
    └── swimlane-flow.drawio
```

---

## Core Concept: Two Generation Modes

### Pipeline Mode
Three LLMs work **sequentially**, each playing a specialized role:

```
User Requirement
      ↓
[Stage 1] Gemini — Senior Business Analyst
  Analyzes requirement, extracts features and test scenarios
      ↓
[Stage 2] GPT-4o — Expert QA Engineer
  Takes Gemini's analysis, generates detailed test cases
      ↓
[Stage 3] Claude — Senior QA Lead (Reviewer)
  Reviews and validates GPT-4o's test cases, produces final output
      ↓
Single GenerationResult saved to history
```

The output of each stage becomes the input of the next. This mimics a real QA team workflow.

### Research Mode
Selected LLMs run **in parallel**, each independently generating test cases:

```
User Requirement
      ↓
┌─────────────┬─────────────┬─────────────┐
│   OpenAI    │   Gemini    │   Claude    │  (concurrent)
└─────────────┴─────────────┴─────────────┘
      ↓             ↓             ↓
   Result 1      Result 2      Result 3
      └─────────────┴─────────────┘
            Grouped by session_id
            Saved as separate history entries
```

Useful when you want to compare how different models approach the same requirement.

---

## Request Lifecycle (Async Job Pattern)

Because LLM calls can take 10–30 seconds, the API never blocks:

```
1. POST /generate
   └── Validates API keys
   └── Creates job in memory (UUID job_id, status: "pending")
   └── Dispatches background async task
   └── Returns { job_id, status: "pending" } immediately (HTTP 202)

2. Background task runs
   └── Calls LLMs (pipeline or research)
   └── Updates job progress (0 → 100)
   └── On success: saves to MongoDB + Elasticsearch, sets status: "success"
   └── On failure: sets status: "failure" with error message

3. Frontend polls GET /generate/jobs/{job_id} every 2 seconds
   └── Shows progress bar
   └── On success: renders test cases, stops polling
   └── On failure: shows error, stops polling

4. Cleanup: jobs older than 1 hour are removed from memory every 5 minutes
```

---

## Authentication Flow

```
Register/Login
      ↓
Backend returns { access_token, refresh_token }
      ↓
Frontend stores both in localStorage
      ↓
Every request sends: Authorization: Bearer <access_token>
      ↓
If 401 received:
   └── Try POST /auth/refresh with refresh_token
   └── If OK: store new tokens, retry original request
   └── If fail: clear session, redirect to /login
```

Passwords are hashed with bcrypt. JWTs are signed with a secret from `.env`.

---

## History & Search

After every successful generation:
1. Result is saved to MongoDB (`history` collection)
2. Key fields are indexed in Elasticsearch (`autoqa_history` index)

When searching:
- Elasticsearch handles full-text search with **fuzzy matching** across: requirement, test_suite_name, description, test_case_titles
- If Elasticsearch is unavailable, falls back to MongoDB regex search automatically

---

## Database Schema

### Collection: `users`
```
_id           UUID string
email         unique, indexed
full_name     string
hashed_password  bcrypt hash
img_url       optional
is_active     boolean
created_at    datetime
```

### Collection: `history`
```
_id           UUID string
user_id       ref → users._id (indexed)
requirement   original user input
provider      "pipeline" | "openai" | "gemini" | "claude"
mode          "pipeline" | "research"
language      output language
is_favorite   boolean (indexed)
session_id    UUID — groups research mode results
result        embedded GenerationResult
  test_suite_name   string
  description       string
  test_cases[]
    test_case_id    string
    title           string
    priority        "High" | "Medium" | "Low"
    category        string
    preconditions   string[]
    steps           string[]
    expected_result string
    test_data       object
  total_count       number
input_tokens  number
output_tokens number
total_tokens  number
elapsed_seconds  float
created_at    datetime (indexed)
```

### Collection: `ai_log`
Raw LLM call logs for debugging and auditing (indexed by user_id + created_at, history_id).

---

## Frontend State Management

The app uses **React Context** (no Redux) with three providers:

| Context | Manages |
|---------|---------|
| `AuthContext` | Current user, login/logout, token refresh |
| `GeneratorContext` | Job queue, polling loop, localStorage persistence |
| `ThemeContext` | Dark/light mode, system preference detection |

Provider wrapping order in `main.tsx`:
```
BrowserRouter
  └── ThemeProvider
        └── AuthProvider
              └── GeneratorProvider
                    └── App (routes)
```

### GeneratorContext — Multi-Job Queue
- Multiple jobs can run simultaneously
- Each job has: queueId, jobId, status, progress, result, error
- All running jobs are polled concurrently every 2 seconds
- Queue is persisted to localStorage — survives page refresh
- On refresh: restores queue state and resumes polling for incomplete jobs

---

## Shared Data Contract

`backend/app/core/schemas.py` defines `GenerationResult` — the single output format used across all modules:

```python
class GenerationResult(BaseModel):
    test_suite_name: str
    description: str
    test_cases: list[TestCase]
    total_count: int
    provider: str   # which LLM produced this
    mode: str       # pipeline | research
```

This is the canonical shape that:
- `generator/tasks.py` produces
- `history/service.py` stores
- `history/router.py` returns
- Frontend renders in `TestCaseCard`

One contract, used everywhere. No transformation needed between modules.

---

## Key Files to Read (in order)

If you want to understand the codebase deeply, read these files in this sequence:

| # | File | Why |
|---|------|-----|
| 1 | `backend/app/main.py` | How the app boots and wires together |
| 2 | `backend/app/core/schemas.py` | The central data contract |
| 3 | `backend/app/core/config.py` | What configuration exists |
| 4 | `backend/app/modules/generator/tasks.py` | Core orchestration logic |
| 5 | `backend/app/modules/generator/prompts.py` | How prompts are structured |
| 6 | `backend/app/modules/generator/llm_caller.py` | How LLMs are called and retried |
| 7 | `backend/app/modules/history/indexer.py` | How search is implemented |
| 8 | `frontend/src/contexts/GeneratorContext.tsx` | Frontend job queue |
| 9 | `frontend/src/lib/api.ts` | HTTP client with auth |
| 10 | `frontend/src/pages/GeneratorPage.tsx` | Main UI entry point |

---

## Running the Project

```bash
# Start infrastructure
docker-compose up -d

# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`, backend on `http://localhost:8000`.
