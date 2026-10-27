package objectstore

import "context"

// Putter is the common interface for object storage backends.
type Putter interface {
	Put(ctx context.Context, name string, data []byte, contentType string) (string, error)
}
