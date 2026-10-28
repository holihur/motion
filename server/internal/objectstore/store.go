package objectstore

import (
	"context"
	"errors"
	"net/url"
	"strings"
)

// Putter is the common interface for object storage backends.
type Putter interface {
	Put(ctx context.Context, name string, data []byte, contentType string) (string, error)
}

func validatePublicBase(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return errors.New("public base URL must be an http(s) URL")
	}
	if parsed.User != nil {
		return errors.New("public base URL must not contain credentials")
	}
	return nil
}
