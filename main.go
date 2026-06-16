package main

import (
	"log"
	"net/http"
)

func main() {
	log.Println("Starting Server...")

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Write a response to w on every request to "/"
		http.ServeFile(w, r, "roadmap.html")
	})

	log.Fatal(http.ListenAndServe(":8080", nil))
}
