package main

import (
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"

	_ "modernc.org/sqlite"
)

// noCache forces browsers to revalidate static assets each load instead of
// serving stale copies from heuristic cache (FileServer sends Last-Modified
// but no Cache-Control). Revalidation still returns a cheap 304 when unchanged.
func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		h.ServeHTTP(w, r)
	})
}

func main() {
	log.Println("Starting Server...")

	// Placeholder userID
	userID := "me"

	db, err := sql.Open("sqlite", "roadmap.db")
	if err != nil {
		log.Fatal(err)
	}
	if err := db.Ping(); err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS checks (
    user_id    TEXT NOT NULL,
    problem_id TEXT NOT NULL,
    PRIMARY KEY (user_id, problem_id)
)`)
	if err != nil {
		log.Fatal(err)
	}

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS layout (
    user_id TEXT PRIMARY KEY,
    json    TEXT NOT NULL
)`)
	if err != nil {
		log.Fatal(err)
	}

	http.Handle("/", noCache(http.FileServer(http.Dir("static"))))

	http.HandleFunc("/progress", func(w http.ResponseWriter, r *http.Request) {
		// Write a json response to w for progress
		switch r.Method {
		case http.MethodGet:
			checks, err := getChecks(db, userID)
			if err != nil {
				http.Error(w, "could not load progress", http.StatusInternalServerError)
				log.Println("getChecks:", err)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			if err := json.NewEncoder(w).Encode(checks); err != nil {
				log.Println("encode progress:", err)
			}

		case http.MethodPost:
			var checks map[string]bool
			if err := json.NewDecoder(r.Body).Decode(&checks); err != nil {
				http.Error(w, "bad request body", http.StatusBadRequest)
				return
			}

			if err := saveChecks(db, userID, checks); err != nil {
				log.Println("saving progress: ", err)
			}

		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/layout", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			raw, err := getLayout(db, userID)
			if err != nil {
				http.Error(w, "could not load layout", http.StatusInternalServerError)
				log.Println("getLayout:", err)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			if _, err := w.Write(raw); err != nil {
				log.Println("write layout:", err)
			}

		case http.MethodPost:
			raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
			if err != nil || !json.Valid(raw) {
				http.Error(w, "bad request body", http.StatusBadRequest)
				return
			}
			if err := saveLayout(db, userID, raw); err != nil {
				log.Println("saving layout:", err)
			}

		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	log.Fatal(http.ListenAndServe(":8069", nil))
}

func getChecks(db *sql.DB, userID string) (map[string]bool, error) {
	rows, err := db.Query("SELECT problem_id FROM checks WHERE user_id = ?", userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	checks := make(map[string]bool)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		checks[id] = true
	}
	return checks, rows.Err()
}

func saveChecks(db *sql.DB, userID string, checks map[string]bool) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM checks WHERE user_id = ?`, userID); err != nil {
		return err
	}
	for id := range checks {
		if _, err := tx.Exec(`INSERT INTO checks(user_id, problem_id) VALUES (?, ?)`, userID, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func getLayout(db *sql.DB, userID string) ([]byte, error) {
	var raw string
	switch err := db.QueryRow("SELECT json FROM layout WHERE user_id = ?", userID).Scan(&raw); err {
	case nil:
		return []byte(raw), nil
	case sql.ErrNoRows:
		return []byte("{}"), nil
	default:
		return nil, err
	}
}

func saveLayout(db *sql.DB, userID string, raw []byte) error {
	_, err := db.Exec(
		`INSERT INTO layout(user_id, json) VALUES (?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET json = excluded.json`,
		userID, string(raw))
	return err
}
