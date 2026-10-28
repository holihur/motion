package objectstore

import (
	"bytes"
	"context"
	"fmt"
	"path"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type S3Config struct {
	Endpoint   string
	AccessKey  string
	SecretKey  string
	Bucket     string
	Region     string
	Prefix     string
	PublicBase string
	UseSSL     bool
}

type S3 struct {
	client *minio.Client
	cfg    S3Config
}

func NewS3(ctx context.Context, cfg S3Config) (*S3, error) {
	if err := validatePublicBase(cfg.PublicBase); err != nil {
		return nil, err
	}
	endpoint := strings.TrimSpace(cfg.Endpoint)
	endpoint = strings.TrimPrefix(strings.TrimPrefix(endpoint, "https://"), "http://")
	if endpoint == "" || cfg.Bucket == "" {
		return nil, fmt.Errorf("S3 endpoint and bucket are required")
	}
	if strings.HasPrefix(cfg.Endpoint, "http://") {
		cfg.UseSSL = false
	}
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return nil, err
	}
	exists, err := client.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("could not check bucket: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{Region: cfg.Region}); err != nil {
			return nil, fmt.Errorf("could not create bucket: %w", err)
		}
	}
	return &S3{client: client, cfg: cfg}, nil
}

func (s *S3) Put(ctx context.Context, name string, data []byte, contentType string) (string, error) {
	key := path.Join(strings.Trim(s.cfg.Prefix, "/"), name)
	_, err := s.client.PutObject(ctx, s.cfg.Bucket, key, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", err
	}
	if s.cfg.PublicBase != "" {
		return strings.TrimRight(s.cfg.PublicBase, "/") + "/" + key, nil
	}
	scheme := "https"
	if !s.cfg.UseSSL {
		scheme = "http"
	}
	return scheme + "://" + strings.TrimRight(strings.TrimPrefix(strings.TrimPrefix(s.cfg.Endpoint, "https://"), "http://"), "/") + "/" + s.cfg.Bucket + "/" + key, nil
}

// Test verifies credentials and bucket access.
func Test(ctx context.Context, cfg S3Config) error {
	_, err := NewS3(ctx, cfg)
	return err
}
