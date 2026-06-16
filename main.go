package main

import (
	"fmt"
	"net/http"
)

func main() {
	fmt.Println("Starting Server...")

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Write a response to w on every request to "/"
		http.ServeFile(w, r, "roadmap.html")
	})
	http.ListenAndServe(":8080", nil)
}
