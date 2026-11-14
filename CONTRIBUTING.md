# Contributing to Maraya (المرايا)

Thank you for your interest in contributing to **Maraya**! We welcome contributions that help improve performance, developer experience, privacy guarantees, and behavioral intelligence models.

---

## Code of Conduct

All contributors are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md). Please be respectful and constructive in all interactions.

---

## Development Setup

### 1. Prerequisites
- Docker & Docker Compose
- Python 3.11+
- Node.js 20+ & npm

### 2. Quick Start
1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/maraya.git
   cd maraya
   ```
2. Copy the environment configuration template:
   ```bash
   cp .env.example .env
   ```
3. Start the support services (Postgres, Redis, Celery workers):
   ```bash
   make dev-up
   ```
4. Run backend migrations and start the Django server:
   ```bash
   python manage.py migrate
   python manage.py seed_metrics
   python manage.py runserver
   ```
5. In another terminal, start the frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

---

## Submitting Pull Requests

1. **Create a Topic Branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Follow Coding Standards:**
   - **Backend:** Adhere to PEP 8. Maintain tenant isolation by extending `UserScopedViewSet` for new models.
   - **Frontend:** Follow idiomatic React functional component practices, clean Zustand store patterns, and Tailwind utility standards.
   - **Privacy First:** Never log sensitive user journal entries or raw credentials.
3. **Commit Messages:**
   Use Conventional Commits (e.g., `feat:`, `fix:`, `docs:`, `refactor:`, `perf:`).
4. **Push & Open PR:**
   Push your branch and open a Pull Request using our [PR Template](.github/PULL_REQUEST_TEMPLATE.md).

---

## Reporting Issues

If you find a bug or have a feature idea, please open an issue using the corresponding GitHub issue template:
- [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md)
- [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md)

For security-related issues, please refer to our [Security Policy](SECURITY.md).

