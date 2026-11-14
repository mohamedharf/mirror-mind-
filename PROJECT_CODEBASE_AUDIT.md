# Comprehensive Codebase Audit & Engineering Review: Maraya (المرايا)
**Date:** November 2026  
**Auditor:** DeepMind Antigravity Engineering Review Engine  
**Project:** Maraya — AI-Powered Behavioral Reflection & Knowledge Base Platform  
**Target:** Global Open-Source & Showcase Standards (GitHub Ready)

---

## Executive Summary & System Philosophy

**Maraya (المرايا — "The Mirrors")** is an asynchronous, privacy-first personal journaling platform designed to act as a behavioral reflection mirror. Unlike traditional diary apps or judgmental habit trackers, Maraya decouples low-friction freeform narrative journaling from deep structured behavioral extraction and periodic insight synthesis.

### Key Architectural Pillars:
1. **Zero-Friction Cognitive Ingestion:** A single focused text box or voice input (powered by on-device Whisper STT) captures thoughts without manual tagging, forms, or rating sliders.
2. **Asynchronous Dual-Layer AI Ingestion:** Background Celery workers process entries using Gemini Flash models to extract mood (1.0–5.0), semantic tags, extracted entities (people, projects, locations), and quantitative metrics without blocking user latency.
3. **Event-Duration & Open-Event Tracking:** State machine capturing ongoing activities (e.g., "going to sleep", "starting deep work") and calculating elapsed duration upon closing statements (e.g., "woke up", "finished work session").
4. **Metric Definition Hybrids & Community Promotion:** System seed metrics seamlessly blend with user-defined custom metrics. Repeated organic adoption by multiple users promotes custom metrics into canonical global definitions.
5. **Periodic Behavioral Synthesis (Celery Beat):** Daily reflections, weekly behavioral patterns, and monthly trend comparisons synthesized automatically through scheduled cron orchestrations.
6. **Data Sovereignty & Privacy First:** Zero third-party audio transmission (local STT), tenant-isolated ORM queries (`UserScopedViewSet`), comprehensive multi-format data export (JSON, Markdown, CSV), and GDPR-compliant complete data deletion.

---

## Comprehensive File-by-File Audit & Architectural Analysis

### 1. Root Orchestration & DevOps Layer

#### `requirements.txt`
* **Role:** Backend Python dependencies specification.
* **Analysis:** Includes modern, production-grade libraries:
  * Django 4.2 LTS, DRF 3.15.2, `dj-rest-auth` with `django-allauth` and `djangorestframework-simplejwt`.
  * Celery 5.4.0 with `redis`, `django-celery-beat`, and `django-celery-results`.
  * `faster-whisper` 1.1.0 (local CTranslate2-accelerated STT).
  * `google-generativeai` 0.8.3 (Gemini API integration).
  * `drf-spectacular` 0.27.1 for OpenAPI 3.0 schema generation, and `sentry-sdk` for APM/error monitoring.
* **Findings:** Well-scoped, pinned dependencies. Ensure `psycopg2-binary` is swapped or documented for production compilation if needed.

#### `Dockerfile.backend`
* **Role:** Containerization specification for the Django API and Celery workers.
* **Analysis:**
  * Base image: `python:3.11-slim`.
  * Installs system dependencies: `ffmpeg` (required for audio decoding), `libpq-dev`, and `gcc`.
  * Runs as non-root user `appuser` (security best practice).
  * Entry command binds Gunicorn with 3 workers.
* **Findings & Critical Vulnerability:** Missing `.dockerignore` file! Because `COPY . .` is executed, without a `.dockerignore`, the Docker build context copies `.git`, local virtual environments (`env/`), SQLite databases, `.env` with credentials, and `frontend/node_modules/` directly into the container image.
* **Remediation:** Create a strict `.dockerignore` immediately.

#### `docker-compose.yml` (Production & Service Blueprint)
* **Role:** Multi-service container orchestration (PostgreSQL 16, Redis 7, Django Gunicorn, Celery Worker, Celery Beat, Frontend placeholder).
* **Analysis:**
  * Defines network dependencies and internal service communication.
  * Healthchecks and volume persistence for Postgres and Celery beat database scheduler.
* **Findings:** Environment variables are properly parameterized using `${...}`. Redis password protection is present.

#### `docker-compose.dev.yml`
* **Role:** Local development support stack (Postgres + Redis + Celery worker + Celery beat with volume mounting).
* **Analysis:**
  * Allows developers to run Python and Vite natively on the host machine while offloading Postgres, Redis, and workers to isolated containers.
  * Includes healthchecks on Redis and Postgres before starting Celery workers.
  * Mounts `./whisper_models` to prevent re-downloading model weights across container restarts.

#### `Makefile`
* **Role:** Task automation and developer workflow shortcuts.
* **Analysis:**
  * Provides shortcuts: `make dev-up`, `make backend`, `make frontend`, `make migrate`, `make shell`, `make reprocess`, `make regen-daily`, `make regen-weekly`.
  * Enhances DX (Developer Experience) significantly.

#### `manage.py`
* **Role:** Standard Django command-line execution entry point.
* **Analysis:** Points to `config.settings.dev` by default for local development.

#### `.env` and `.env.example`
* **Role:** Environment variable configuration.
* **Critical Finding:** Real production API keys (`GEMINI_API_KEY`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`) and secrets were stored in `.env` and previously committed into the git tracking index!
* **Remediation:**
  1. Remove `.env` from git tracking index via `git rm --cached .env`.
  2. Create a standardized, clean `.env.example` with clear placeholder documentation.
  3. Update `.gitignore` to prevent any future commit of `.env`.

#### `.gitignore`
* **Critical Finding:** The existing `.gitignore` was corrupted (14 bytes with improper character encoding), resulting in tracking virtualenvs (`env/`), SQLite databases (`db.sqlite3`), and secrets.
* **Remediation:** Replace with an enterprise-grade `.gitignore` covering Python, Django, Frontend, Node, SQLite, Redis dumps, Whisper weights, and OS files.

---

### 2. Configuration & Core Architecture (`config/`)

#### `config/settings/base.py`
* **Role:** Core Django settings shared across environments.
* **Analysis:**
  * **Security & Auth:** Configured with SimpleJWT, `dj-rest-auth`, `django-cors-headers`, and `django-allauth`. Throttling is enabled (Anon: 20/min, User: 100/min).
  * **Asynchronous Stack:** Celery broker with Redis, `django-db` results backend, `DatabaseScheduler` for beat tasks. Redis cache configured for inter-process caching between Django and Celery.
  * **OpenAPI / Swagger:** `drf-spectacular` integrated for live interactive API documentation.
  * **Sentry SDK:** Integrated for performance and error tracking if `SENTRY_DSN` is provided.

#### `config/settings/dev.py` & `config/settings/prod.py` & `config/settings/test.py`
* **Role:** Environment-specific settings overrides.
* **Analysis:**
  * `dev.py`: Sets `DEBUG=True`, console email backend, and `DEV_LOGIN_ENABLED = True` (allowing mock authentication for rapid testing without active Google OAuth).
  * `prod.py`: Enforces `DEBUG=False`.

#### `config/urls.py`
* **Role:** Master URL routing table.
* **Analysis:**
  * Clean route namespacing:
    * `/admin/` -> Django admin
    * `/accounts/` -> Allauth OAuth handlers
    * `/api/v1/auth/` -> Authentication & registration
    * `/api/v1/auth/accounts/` -> Custom OAuth redirect & dev-login
    * `/api/v1/account/delete-data/` -> GDPR user data purge
    * `/api/docs/` -> Swagger UI documentation
    * `/api/schema/` -> OpenAPI schema endpoint
    * `/api/v1/` -> Entries and habits endpoints
    * `/api/v1/insights/` -> Behavioral insights endpoints
    * `/api/v1/audio/` -> On-device STT transcription endpoint
    * `/api/v1/export/` -> Markdown/JSON/CSV export endpoints

#### `config/celery.py`
* **Role:** Celery application initialization and cron beat scheduling.
* **Analysis:**
  * Configures automatic task discovery across all apps.
  * Schedules automated periodic jobs:
    * `daily-reflections` at 23:50 daily.
    * `weekly-insights` every Sunday at 00:30.
    * `monthly-insights` on the 1st of every month at 01:00.
    * `update-baselines` every Sunday at 01:30 (pure SQL baseline recalculation).
    * `reprocess-stuck` every hour to auto-recover stalled or rate-limited entries.

---

### 3. Identity & Authentication (`apps/accounts/`)

#### `apps/accounts/views.py`
* **Role:** OAuth callback processing, dev authentication, and GDPR data deletion.
* **Analysis:**
  * `GoogleOAuthSuccessView`: Generates JWT tokens upon successful OAuth authentication and transmits them via **URL Fragment (`#access=...&refresh=...`)** instead of query parameters. URL fragments are never sent to HTTP servers or recorded in web server logs, mitigating credential leakage.
  * `DevLoginView`: Generates a mock authenticated user (`test_user`) and redirects via the same URL fragment pattern when `DEV_LOGIN_ENABLED` is active.
  * `DeleteAllUserDataView`: Atomic transaction (`transaction.atomic()`) purging all entries, metrics, baselines, and daily/weekly/monthly insights for the authenticated user, honoring the "right to be forgotten".

#### `apps/accounts/urls.py` & `apps/accounts/admin.py`
* **Role:** URL patterns and administrative registrations for the accounts app.

---

### 4. Entries, Metrics & AI Extraction Engine (`apps/entries/`)

#### `apps/entries/models.py`
* **Role:** Core database entities: `MetricDefinition`, `MetricDefinitionContributor`, `Entry`, `Metric`, and `MetricBaseline`.
* **Analysis & Highlights:**
  * `Entry`:
    * Multi-tenant security tied directly to `AUTH_USER_MODEL`.
    * Self-referencing `parent` key with strict depth-1 constraint enforcing flat reply hierarchies.
    * Tracks `mood_score` (1.0–5.0), `tags` (JSON), `entities` (JSON dict for persons, projects, locations), `ai_reflection`, and `processing_status` (`pending`, `processing`, `done`, `failed`, `rate_limited`).
    * Indexes on `['user', 'created_at']`, `['user', 'created_at', 'processing_status']`, and `['user', 'parent']` optimizing time-series lookups.
    * Automatic event closure hooks on save when a child references an open event.
  * `MetricDefinition`:
    * Categorized metrics (`health`, `habit`, `activity`, `nutrition`) with alias arrays and duration-based flags (`is_duration_based`).
    * Hybrid promotion mechanism: system seed metrics vs. community promoted metrics based on unique contributor counts.
  * `Metric`:
    * Atomic measurement row linking an entry, definition, recorded value, and timestamp.
  * `MetricBaseline`:
    * Pre-aggregated 30-day statistical baseline (average, min, max, sample size) for instant deviation comparison with zero LLM query overhead.

#### `apps/entries/ai.py`
* **Role:** Gemini Flash LLM integration and prompt orchestration.
* **Analysis:**
  * Encapsulates `safe_gemini_call` with structured JSON parsing, Markdown fence stripping, and graceful fallback to defaults upon unexpected responses.
  * Specifically catches `google_exceptions.ResourceExhausted` and re-throws it so Celery tasks can execute exponential backoff retries.
  * Dynamic prompt builder (`build_extraction_prompt`) injects current canonical metric definitions and the user's recent 14-day tags into the LLM context for tag consistency.

#### `apps/entries/tasks.py`
* **Role:** Asynchronous Celery workers for extraction and background math.
* **Analysis:**
  * `extract_entry_data`: Orchestrates entry extraction, updates status, saves metrics, detects open event intent, and coordinates duration tracking.
  * `detect_closing_intent` and `find_matching_open_event`: Sophisticated heuristic matching closing terms (e.g., "صحيت", "وقفت", "خلصت") with preceding unclosed events (within an 18-hour window).
  * Caches a close suggestion in Redis (`close_suggestion:{user_id}:{entry_id}`) for 10 minutes to offer immediate one-tap duration logging to the user.
  * `update_metric_baselines`: Efficient weekly SQL aggregation computing 30-day rolling averages per user per metric with zero LLM API costs.
  * `reprocess_stuck_entries`: Periodic watchdog recovering entries stuck in pending or rate-limited states older than 10 minutes.

#### `apps/entries/views.py` & `apps/entries/metrics_views.py`
* **Role:** DRF ViewSets and custom API views.
* **Analysis:**
  * `UserScopedViewSet`: Robust base ViewSet automatically filtering querysets by `request.user` and injecting `request.user` on write, eliminating object-level tenancy leak vulnerabilities.
  * `EntryViewSet`:
    * Comprehensive filtering by date, year/month, and full-text search.
    * Only returns root entries in list queries while nesting child replies, preventing duplicate card renders.
    * Custom actions: `/today/`, `/open_events/`, `/close/`, and `/retry_analysis/`.
  * `TodayMetricsView` & `MetricHistoryView`:
    * Computes today's totals against precomputed baselines and calculates deviation percentages (`deviation_pct`), directional indicators (`up`, `down`, `normal`), and color-coded polarity (`lower_is_better`).

#### `apps/entries/serializers.py`
* **Role:** Serialization and schema validation.
* **Analysis:**
  * `EntrySerializer`: Prevents thread depth exceeding 1 (`parent.parent_id is not None`) and prevents associating entries with another user's parent entry.

#### `apps/entries/management/commands/`
* **`seed_metrics.py`:** Seeds foundational system metrics (Sleep, Work, Gym, Coffee, Water, Cigarettes, Reading) with aliases and duration flags.
* **`reprocess_pending.py`:** CLI utility to manually trigger re-queueing of pending or stalled entries.

---

### 5. Behavioral Intelligence & Analytics (`apps/insights/`)

#### `apps/insights/models.py`
* **Role:** Daily reflection, weekly behavioral pattern, and monthly comparative insight models.
* **Analysis:**
  * `DailyReflection`: Daily summary, average mood, top tags, and tag alerts (notifying user when a tag spikes in frequency).
  * `WeeklyInsight`: Mood trend array, weekly mood average, extracted behavioral patterns, and metric summaries.
  * `MonthlyInsight`: Longitudinal monthly synthesis, suggestions ("Notice X — would you like to try Y?"), and month-over-month comparisons.

#### `apps/insights/tasks.py`
* **Role:** Celery tasks synthesizing insights at daily, weekly, and monthly intervals.
* **Analysis:**
  * Uses focused system prompts enforcing descriptive, non-judgmental observations.
  * Groups entries chronologically with day separators to give the LLM structured context.
  * `_compute_tag_alerts`: Identifies tags appearing $\ge 3$ times within a 14-day window.
* **Minor Code Finding:** Line 281 in `apps/insights/tasks.py` had a redundant formatting test call prior to the actual user prompt invocation. This is safely caught by `safe_gemini_call` but can be cleaned.

#### `apps/insights/views.py` & `serializers.py`
* **Role:** Read-only endpoints for daily, weekly, and monthly insights.
* **Bug Fix Identified:** `DailyReflectionSerializer` included `entry_count` in its `fields` list, which is not a column on `DailyReflection`. DRF will raise a schema error if requested unless dynamically computed or removed.

---

### 6. Local Speech-to-Text Engine (`apps/audio/`)

#### `apps/audio/stt.py`
* **Role:** On-device automated speech recognition using `faster-whisper`.
* **Analysis:**
  * **Privacy Guarantee:** Audio files are processed synchronously on the local CPU/GPU using CTranslate2; zero audio bytes are transmitted to any external cloud provider.
  * Implements a Singleton pattern (`get_whisper_model()`) loading `small` or `large-v3` weights in `int8` quantization to conserve RAM.
  * Pre-configured with Voice Activity Detection (`vad_filter=True`) to automatically strip non-speech silence.
  * Returns transcribed Arabic text, detected language, and normalized confidence scores.

#### `apps/audio/views.py`
* **Role:** Multipart audio upload endpoint (`/api/v1/audio/transcribe/`).
* **Analysis:**
  * Uses temporary file handling with guaranteed cleanup in a `finally` block (`os.remove(tmp_path)`).
  * Intentionally executed synchronously in Django rather than through Celery to avoid thread/fork deadlocks with CTranslate2 runtime.

---

### 7. Data Portability & Sovereignty (`apps/export_app/`)

#### `apps/export_app/views.py` & `urls.py`
* **Role:** Comprehensive user data export endpoints.
* **Analysis:**
  * `ExportMarkdownView`: Generates structured Markdown journals formatted with timestamps, mood indicators, tags, and AI reflections.
  * `ExportJSONView`: Exports the complete raw structured database records for custom data science or offline archiving.
  * `ExportCSVView`: Streams a standard CSV file with headers suitable for Excel or data analysis tools.

---

### 8. Frontend Architecture & State Management (`frontend/`)

#### `frontend/package.json` & `vite.config.js`
* **Role:** Frontend tooling, dependencies, and PWA configuration.
* **Analysis:**
  * React 18 with Vite 5, Tailwind CSS, Recharts, Axios, and Zustand.
  * `vite-plugin-pwa`: ServiceWorker configuration with offline caching for `/api/v1/` GET endpoints using `NetworkFirst` strategy and standalone mobile manifest.

#### `frontend/src/store/authStore.js` & `entryStore.js`
* **Role:** Centralized reactive state via Zustand.
* **Analysis:**
  * `authStore`: Synchronizes access tokens, refresh tokens, and user profiles with `localStorage`.
  * `entryStore`: Manages live daily entries, selected parent threads, active reflections, metric lists, and recording states.

#### `frontend/src/lib/api.js`
* **Role:** Axios client with token injection and automatic token refresh interceptor.
* **Analysis:**
  * Intercepts 401 Unauthorized responses, attempts a refresh token rotation via `/auth/token/refresh/`, and replays failed requests seamlessly.

#### `frontend/src/lib/offlineQueue.js`
* **Role:** Offline resilience layer.
* **Analysis:**
  * Stores entries created without an internet connection into `localStorage` queue.
  * Flushes pending items sequentially when connectivity is restored.

#### `frontend/src/lib/utils.js`
* **Role:** Core UI helpers, exponential backoff status poller, date formatters, and streak calculators.
* **Analysis:**
  * `pollEntryStatus`: Polls entry processing status with exponential backoff up to 10 attempts, notifying UI when AI processing completes.

---

### 9. Frontend Components & Views (`frontend/src/components/`, `pages/`)

#### Components Overview:
* `EntryCard.jsx`: Interactive card displaying time, type badges, open event badges, mood score pills, reflection text, and thread reply linkages.
* `MetricCard.jsx` & `DurationMetricCard.jsx`: Cards featuring animated progress bars, target comparisons, and sparkline trends.
* `OpenEventsBanner.jsx`: Persistent banner surfacing active unclosed events (e.g., sleep, work) with one-click closure.
* `CloseSuggestionBanner.jsx`: Floating banner offering instant confirmation when the backend detects an entry concludes an ongoing event.
* `VoiceButton.jsx`: Integrated mic button supporting in-browser audio capture and streaming to faster-whisper.
* `ReflectionCard.jsx`: Elegant gradient banner displaying AI reflections and extracted entity tags (people, projects, places).
* `BottomNav.jsx`: Mobile-first navigation bar with Material Symbols and subtle active indicators.

#### Pages Overview:
* `Home.jsx`: The central journaling canvas with autofocus textarea, voice input, live metrics carousel, and open-event banners.
* `History.jsx`: Chronological infinite-scroll timeline with monthly filters and search capabilities.
* `Habits.jsx`: Dedicated metrics cockpit with interactive Recharts trends, baseline comparisons, and definition registries.
* `Insights.jsx`: Long-range analytics dashboard presenting weekly and monthly behavioral trends and AI reflections.
* `Settings.jsx`: Account control panel, theme toggle, export generators (Markdown, JSON, CSV), and GDPR data wipe action.
* `Login.jsx` & `AuthCallback.jsx`: Google OAuth integration and one-click dev login handler.

---

## Technical Debt, Security Risks & Action Plan

| Category | Finding | Impact | Status / Solution |
| :--- | :--- | :--- | :--- |
| **Security** | `.env` tracked in git with active API keys | Critical leak risk | Remove from git cache, add to `.gitignore`, provide `.env.example` |
| **Git Cleanliness** | `env/` (Python virtualenv) committed in git | Hundreds of megabytes of binary junk in git | Remove `env/` from git cache, update `.gitignore` |
| **Git Cleanliness** | `db.sqlite3` & `token.txt` tracked in git | Leaking local data and tokens | Untrack from git, ignore in `.gitignore` |
| **Docker** | Missing `.dockerignore` | Slow builds, huge images, leaked secrets | Add `.dockerignore` covering `env`, `.git`, `node_modules` |
| **Code Quality** | `DailyReflectionSerializer` references missing field | Potential runtime exception | Fix serializer fields list |
| **CI/CD** | Missing GitHub Actions workflow | No automated testing or verification | Create `.github/workflows/ci.yml` |
| **GitHub Presentation**| Empty `README.md` (22 bytes) | Repository lacks documentation or showcase | Build a world-class README with diagrams, badges, and screenshots |

---
*End of Codebase Audit Report.*

