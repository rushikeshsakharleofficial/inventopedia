up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

db:
	docker compose exec postgres psql -U inventopedia -d inventopedia

backend-test:
	cd backend && go test ./...

frontend-build:
	cd frontend && npm install && npm run build
