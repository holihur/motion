package secret

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
)

func key(secret string) []byte {
	sum := sha256.Sum256([]byte(secret))
	return sum[:]
}

func Encrypt(secret, plaintext string) (string, error) {
	block, err := aes.NewCipher(key(secret))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return "v1:" + base64.RawURLEncoding.EncodeToString(sealed), nil
}

func Decrypt(secret, payload string) (string, error) {
	if !strings.HasPrefix(payload, "v1:") {
		return "", errors.New("unsupported secret format")
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(payload, "v1:"))
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key(secret))
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("invalid secret")
	}
	nonce, ciphertext := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
