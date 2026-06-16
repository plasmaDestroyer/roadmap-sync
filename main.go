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
		// Write a response to w on every request to "/"
		http.ServeFile(w, r, "roadmap.html")
	})

	http.HandleFunc("/progress", func(w http.ResponseWriter, r *http.Request) {
		// Write a json response to w for progress
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
