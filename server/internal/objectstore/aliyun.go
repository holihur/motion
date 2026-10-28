package objectstore

import (
	"bytes"
	"context"
	"fmt"
	"path"
	"strings"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
)

type AliyunOSSConfig struct {
	Endpoint   string
	Bucket     string
	AccessKey  string
	SecretKey  string
	Prefix     string
	PublicBase string
}

type AliyunOSS struct {
	client *oss.Client
	bucket *oss.Bucket
	cfg    AliyunOSSConfig
}

func NewAliyunOSS(cfg AliyunOSSConfig) (*AliyunOSS, error) {
	if err := validatePublicBase(cfg.PublicBase); err != nil {
		return nil, err
	}
	if strings.TrimSpace(cfg.Endpoint) == "" || strings.TrimSpace(cfg.Bucket) == "" {
		return nil, fmt.Errorf("Aliyun OSS endpoint and bucket are required")
	}
	client, err := oss.New(cfg.Endpoint, cfg.AccessKey, cfg.SecretKey)
	if err != nil {
		return nil, err
	}
	bucket, err := client.Bucket(cfg.Bucket)
	if err != nil {
		return nil, err
	}
	return &AliyunOSS{client: client, bucket: bucket, cfg: cfg}, nil
}

func (a *AliyunOSS) Put(ctx context.Context, name string, data []byte, contentType string) (string, error) {
	key := path.Join(strings.Trim(a.cfg.Prefix, "/"), name)
	options := []oss.Option{}
	if contentType != "" {
		options = append(options, oss.ContentType(contentType))
	}
	if err := a.bucket.PutObject(key, bytes.NewReader(data), options...); err != nil {
		return "", err
	}
	if a.cfg.PublicBase != "" {
		return strings.TrimRight(a.cfg.PublicBase, "/") + "/" + key, nil
	}
	return "https://" + a.cfg.Bucket + "." + strings.TrimPrefix(strings.TrimPrefix(a.cfg.Endpoint, "https://"), "http://") + "/" + key, nil
}

func TestAliyunOSS(ctx context.Context, cfg AliyunOSSConfig) error {
	store, err := NewAliyunOSS(cfg)
	if err != nil {
		return err
	}
	_, err = store.client.GetBucketInfo(store.cfg.Bucket)
	return err
}
