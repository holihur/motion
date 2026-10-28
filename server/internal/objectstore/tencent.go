package objectstore

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"

	"github.com/tencentyun/cos-go-sdk-v5"
)

type TencentCOSConfig struct {
	Bucket     string
	Region     string
	SecretID   string
	SecretKey  string
	Endpoint   string
	Prefix     string
	PublicBase string
}

type TencentCOS struct {
	client *cos.Client
	cfg    TencentCOSConfig
	base   string
}

func NewTencentCOS(cfg TencentCOSConfig) (*TencentCOS, error) {
	if err := validatePublicBase(cfg.PublicBase); err != nil {
		return nil, err
	}
	if strings.TrimSpace(cfg.Bucket) == "" || strings.TrimSpace(cfg.Region) == "" {
		return nil, fmt.Errorf("Tencent COS bucket and region are required")
	}
	endpoint := strings.TrimRight(strings.TrimSpace(cfg.Endpoint), "/")
	if endpoint == "" {
		endpoint = fmt.Sprintf("https://%s.cos.%s.myqcloud.com", cfg.Bucket, cfg.Region)
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}
	client := cos.NewClient(&cos.BaseURL{BucketURL: parsed}, &http.Client{
		Transport: &cos.AuthorizationTransport{SecretID: cfg.SecretID, SecretKey: cfg.SecretKey},
	})
	return &TencentCOS{client: client, cfg: cfg, base: endpoint}, nil
}

func (t *TencentCOS) Put(ctx context.Context, name string, data []byte, contentType string) (string, error) {
	key := path.Join(strings.Trim(t.cfg.Prefix, "/"), name)
	_, err := t.client.Object.Put(ctx, key, bytes.NewReader(data), &cos.ObjectPutOptions{
		ObjectPutHeaderOptions: &cos.ObjectPutHeaderOptions{ContentType: contentType},
	})
	if err != nil {
		return "", err
	}
	if t.cfg.PublicBase != "" {
		return strings.TrimRight(t.cfg.PublicBase, "/") + "/" + key, nil
	}
	return t.base + "/" + key, nil
}

func TestTencentCOS(ctx context.Context, cfg TencentCOSConfig) error {
	store, err := NewTencentCOS(cfg)
	if err != nil {
		return err
	}
	_, _, err = store.client.Bucket.Get(ctx, &cos.BucketGetOptions{MaxKeys: 1})
	return err
}
