# Makefile — اختصارات تشغيل المشروع
# الاستخدام: make <command>

# ── Dev (الأكثر استخداماً) ──────────────────────
dev-up:
	docker compose -f docker-compose.dev.yml up -d
	@echo "✅ Docker جاهز — شغّل الباك والفرونت:"
	@echo "   Terminal 1: make backend"
	@echo "   Terminal 2: make frontend"

dev-down:
	docker compose -f docker-compose.dev.yml down

backend:
	python manage.py runserver

frontend:
	cd frontend && npm run dev

# ── Shortcuts ───────────────────────────────────
migrate:
	python manage.py migrate

migrations:
	python manage.py makemigrations

shell:
	python manage.py shell

logs-worker:
	docker logs maraya_celery_worker -f

logs-beat:
	docker logs maraya_celery_beat -f

logs-db:
	docker logs maraya_db -f

# ── Maintenance ─────────────────────────────────
reprocess:
	python manage.py reprocess_pending

regen-daily:
	python manage.py regenerate_insights --type daily --days 7

regen-weekly:
	python manage.py regenerate_insights --type weekly --days 14

# ── Full reset (حذف كل بيانات Dev) ─────────────
reset-db:
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.dev.yml up -d
	sleep 5
	python manage.py migrate
	@echo "✅ DB نظيفة — لا تنسى الـ seed"

.PHONY: dev-up dev-down backend frontend migrate migrations \
        shell logs-worker logs-beat logs-db reprocess \
        regen-daily regen-weekly reset-db
