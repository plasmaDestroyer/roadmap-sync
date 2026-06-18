package main

import (
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"

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

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS events (
    user_id    TEXT NOT NULL,
    problem_id TEXT NOT NULL,
    ts         INTEGER NOT NULL
)`)
	if err != nil {
		log.Fatal(err)
	}

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS companies (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT,
    oa_format TEXT,
    rounds    TEXT,
    notes     TEXT
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

	http.HandleFunc("/streak", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		current, today, err := getStreak(db, userID)
		if err != nil {
			http.Error(w, "could not load streak", http.StatusInternalServerError)
			log.Println("getStreak:", err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]int{"current": current, "today": today})
	})

	http.HandleFunc("/companies", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			list, err := getCompanies(db)
			if err != nil {
				http.Error(w, "could not load companies", http.StatusInternalServerError)
				log.Println("getCompanies:", err)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(list)

		case http.MethodPost:
			var c Company
			if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
				http.Error(w, "bad request body", http.StatusBadRequest)
				return
			}
			if err := upsertCompany(db, c); err != nil {
				log.Println("upsertCompany:", err)
			}

		case http.MethodDelete:
			if _, err := db.Exec(`DELETE FROM companies WHERE id = ?`, r.URL.Query().Get("id")); err != nil {
				log.Println("deleteCompany:", err)
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

	// append an event for each newly-checked problem (id present now but not stored before)
	existing := map[string]bool{}
	rows, err := tx.Query(`SELECT problem_id FROM checks WHERE user_id = ?`, userID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		existing[id] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	now := time.Now().Unix()
	for id := range checks {
		if !existing[id] {
			if _, err := tx.Exec(`INSERT INTO events(user_id, problem_id, ts) VALUES (?, ?, ?)`, userID, id, now); err != nil {
				return err
			}
		}
	}

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

// getStreak returns the run of consecutive days up to today with >=1 event, and
// today's event count. Dates use the server's local timezone.
func getStreak(db *sql.DB, userID string) (int, int, error) {
	rows, err := db.Query(`SELECT ts FROM events WHERE user_id = ?`, userID)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()

	days := map[string]bool{}
	todayStr := time.Now().Format("2006-01-02")
	today := 0
	for rows.Next() {
		var ts int64
		if err := rows.Scan(&ts); err != nil {
			return 0, 0, err
		}
		d := time.Unix(ts, 0).Format("2006-01-02")
		days[d] = true
		if d == todayStr {
			today++
		}
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}

	current := 0
	for day := time.Now(); days[day.Format("2006-01-02")]; day = day.AddDate(0, 0, -1) {
		current++
	}
	return current, today, nil
}

type Company struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	OAFormat string `json:"oa_format"`
	Rounds   string `json:"rounds"`
	Notes    string `json:"notes"`
}

func getCompanies(db *sql.DB) ([]Company, error) {
	rows, err := db.Query(`SELECT id, COALESCE(name,''), COALESCE(oa_format,''), COALESCE(rounds,''), COALESCE(notes,'') FROM companies ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Company{}
	for rows.Next() {
		var c Company
		if err := rows.Scan(&c.ID, &c.Name, &c.OAFormat, &c.Rounds, &c.Notes); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

// upsertCompany inserts when ID == 0, otherwise updates by id.
func upsertCompany(db *sql.DB, c Company) error {
	if c.ID == 0 {
		_, err := db.Exec(`INSERT INTO companies(name, oa_format, rounds, notes) VALUES (?, ?, ?, ?)`,
			c.Name, c.OAFormat, c.Rounds, c.Notes)
		return err
	}
	_, err := db.Exec(`UPDATE companies SET name = ?, oa_format = ?, rounds = ?, notes = ? WHERE id = ?`,
		c.Name, c.OAFormat, c.Rounds, c.Notes, c.ID)
	return err
}
