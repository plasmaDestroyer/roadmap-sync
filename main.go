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
		w.Header().Set("Content-Type", "application/json")

		checks := map[string]bool{"pp5": true, "ppfx1": true}
		if err := json.NewEncoder(w).Encode(checks); err != nil {
			log.Println("encode progress: ", err)
		}
	})

	log.Fatal(http.ListenAndServe(":8080", nil))
}
