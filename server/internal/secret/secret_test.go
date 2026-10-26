package secret

import "testing"

func TestEncryptRoundTrip(t *testing.T) {
	cipherText, err := Encrypt("test-secret", "sk-my-api-key")
	if err != nil {
		t.Fatal(err)
	}
	if cipherText == "sk-my-api-key" || cipherText[:3] != "v1:" {
		t.Fatalf("unexpected ciphertext %q", cipherText)
	}
	plain, err := Decrypt("test-secret", cipherText)
	if err != nil {
		t.Fatal(err)
	}
	if plain != "sk-my-api-key" {
		t.Fatalf("got %q", plain)
	}
	if _, err := Decrypt("wrong-secret", cipherText); err == nil {
		t.Fatal("expected wrong key to fail")
	}
}
