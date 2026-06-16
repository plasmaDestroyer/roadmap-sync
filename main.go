package main

import (
	"log"
	"net/http"
	"encoding/json"
)

func main() {
	log.Println("Starting Server...")

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
