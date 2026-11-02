package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

func TestPublicPasswordHashing(t *testing.T) {
	hashed, err := hashPublicPassword("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hashed, "$2") {
		t.Fatalf("expected bcrypt hash, got %q", hashed)
	}
	if !publicPasswordMatches(hashed, "correct horse") {
		t.Fatal("correct password did not match")
	}
	if publicPasswordMatches(hashed, "wrong horse") {
		t.Fatal("wrong password matched")
	}
}

func TestPublicPasswordLegacyHash(t *testing.T) {
	sum := sha256.Sum256([]byte("legacy"))
	legacy := hex.EncodeToString(sum[:])
	if !publicPasswordMatches(legacy, "legacy") {
		t.Fatal("legacy hash did not match")
	}
	if publicPasswordMatches(legacy, "nope") {
		t.Fatal("legacy wrong password matched")
	}
}
