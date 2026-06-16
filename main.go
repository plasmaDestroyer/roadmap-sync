package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	_ "modernc.org/sqlite"
)

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

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Serve to w on every request to "/"
		http.ServeFile(w, r, "roadmap.html")
	})

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

	log.Fatal(http.ListenAndServe(":8080", nil))
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
