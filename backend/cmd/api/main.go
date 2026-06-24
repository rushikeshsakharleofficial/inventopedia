package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type App struct {
	db *pgxpool.Pool
}

type HealthResponse struct {
	Status string `json:"status"`
	Time   string `json:"time"`
}

type DashboardResponse struct {
	TotalLiveBirds int64 `json:"total_live_birds"`
	ActiveBatches  int64 `json:"active_batches"`
	TodayDeaths    int64 `json:"today_deaths"`
	TodayLost      int64 `json:"today_lost"`
}

func main() {
	ctx := context.Background()
	databaseURL := getenv("DATABASE_URL", "postgres://inventopedia:change_me_dev_only@localhost:5432/inventopedia?sslmode=disable")
	port := getenv("APP_PORT", "8080")

	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("database pool error: %v", err)
	}
	defer db.Close()

	app := &App{db: db}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", app.health)
	mux.HandleFunc("GET /ready", app.ready)
	mux.HandleFunc("GET /api/reports/dashboard", app.dashboard)
	mux.HandleFunc("GET /api/batches/{id}/stock", app.batchStock)

	log.Printf("Inventopedia API listening on :%s", port)
	if err := http.ListenAndServe(":"+port, cors(mux)); err != nil {
		log.Fatal(err)
	}
}

func (a *App) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, HealthResponse{Status: "ok", Time: time.Now().UTC().Format(time.RFC3339)})
}

func (a *App) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := a.db.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready", "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (a *App) dashboard(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	var res DashboardResponse

	err := a.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(
			CASE
				WHEN event_type IN ('opening_stock', 'purchase', 'transfer_in', 'return') THEN quantity
				WHEN event_type IN ('death', 'lost', 'sold', 'transfer_out', 'damage') THEN -quantity
				WHEN event_type = 'correction' THEN quantity
				ELSE 0
			END
		), 0)
		FROM inventory_events
	`).Scan(&res.TotalLiveBirds)
	if err != nil {
		writeError(w, err)
		return
	}

	_ = a.db.QueryRow(ctx, `SELECT COUNT(*) FROM batches WHERE status = 'active'`).Scan(&res.ActiveBatches)
	_ = a.db.QueryRow(ctx, `SELECT COALESCE(SUM(dead_count), 0) FROM daily_entries WHERE entry_date = CURRENT_DATE`).Scan(&res.TodayDeaths)
	_ = a.db.QueryRow(ctx, `SELECT COALESCE(SUM(lost_count), 0) FROM daily_entries WHERE entry_date = CURRENT_DATE`).Scan(&res.TodayLost)

	writeJSON(w, http.StatusOK, res)
}

func (a *App) batchStock(w http.ResponseWriter, r *http.Request) {
	batchID := strings.TrimSpace(r.PathValue("id"))
	if batchID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "batch id is required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	var stock int64
	err := a.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(
			CASE
				WHEN event_type IN ('opening_stock', 'purchase', 'transfer_in', 'return') THEN quantity
				WHEN event_type IN ('death', 'lost', 'sold', 'transfer_out', 'damage') THEN -quantity
				WHEN event_type = 'correction' THEN quantity
				ELSE 0
			END
		), 0)
		FROM inventory_events
		WHERE batch_id = $1
	`, batchID).Scan(&stock)
	if err != nil {
		writeError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"batch_id": batchID, "current_stock": stock})
}

func cors(next http.Handler) http.Handler {
	allowed := getenv("FRONTEND_URL", "http://localhost:5173")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowed)
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	if errors.Is(err, context.DeadlineExceeded) {
		status = http.StatusGatewayTimeout
	}
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
