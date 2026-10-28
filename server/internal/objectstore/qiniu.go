package objectstore

import (
	"bytes"
	"context"
	"fmt"
	"path"
	"strings"

	"github.com/qiniu/go-sdk/v7/auth"
	"github.com/qiniu/go-sdk/v7/storage"
)

type QiniuConfig struct {
	Bucket     string
	AccessKey  string
	SecretKey  string
	Prefix     string
	PublicBase string
	UseHTTPS   bool
}

type Qiniu struct {
	mac    *auth.Credentials
	cfg    storage.Config
	name   string
	base   string
	prefix string
}

func NewQiniu(cfg QiniuConfig) (*Qiniu, error) {
	if err := validatePublicBase(cfg.PublicBase); err != nil {
		return nil, err
	}
	if strings.TrimSpace(cfg.Bucket) == "" || cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, fmt.Errorf("Qiniu bucket, access key and secret key are required")
	}
	conf := storage.Config{UseHTTPS: cfg.UseHTTPS}
	return &Qiniu{mac: auth.New(cfg.AccessKey, cfg.SecretKey), cfg: conf, name: cfg.Bucket, base: cfg.PublicBase, prefix: cfg.Prefix}, nil
}

func (q *Qiniu) Put(ctx context.Context, name string, data []byte, contentType string) (string, error) {
	key := path.Join(strings.Trim(q.prefix, "/"), name)
	policy := storage.PutPolicy{Scope: q.name + ":" + key}
	token := policy.UploadToken(q.mac)
	uploader := storage.NewFormUploader(&q.cfg)
	ret := storage.PutRet{}
	extra := &storage.PutExtra{}
	if contentType != "" {
		extra.MimeType = contentType
	}
	if err := uploader.Put(ctx, &ret, token, key, bytes.NewReader(data), int64(len(data)), extra); err != nil {
		return "", err
	}
	if q.base != "" {
		return strings.TrimRight(q.base, "/") + "/" + key, nil
	}
	return "https://" + q.name + ".qiniucdn.com/" + key, nil
}

func TestQiniu(ctx context.Context, cfg QiniuConfig) error {
	store, err := NewQiniu(cfg)
	if err != nil {
		return err
	}
	manager := storage.NewBucketManager(store.mac, &store.cfg)
	buckets, err := manager.Buckets(true)
	if err != nil {
		return err
	}
	for _, bucket := range buckets {
		if bucket == store.name {
			return nil
		}
	}
	return fmt.Errorf("bucket %q is not accessible", store.name)
}
