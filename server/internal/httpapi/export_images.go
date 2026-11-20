package httpapi

import (
	"bytes"
	"context"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/motion/server/internal/export"
	"github.com/motion/server/internal/model"
)

const (
	maxExportImageBytes = 8 << 20
	maxExportImages     = 12
)

// attachExportImages fills in image blocks that the browser could not
// rasterize, for example cross-origin images without CORS. Relative URLs are
// resolved against the current server; absolute URLs must be public HTTP(S)
// endpoints to avoid turning exports into an SSRF primitive.
func (s *Server) attachExportImages(r *http.Request, page model.Page, diagrams map[string]export.Diagram) map[string]export.Diagram {
	if diagrams == nil {
		diagrams = map[string]export.Diagram{}
	}
	blocks := collectImageBlocks(page.Blocks)
	if len(blocks) == 0 {
		return diagrams
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	client := &http.Client{
		Timeout: 6 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	fetched := 0
	for _, block := range blocks {
		if fetched >= maxExportImages || ctx.Err() != nil {
			break
		}
		if _, ok := diagrams[block.ID]; ok {
			continue
		}
		raw := strings.TrimSpace(block.URL)
		if raw == "" || strings.HasPrefix(raw, "data:") {
			continue
		}
		target, err := exportImageTarget(r, raw)
		if err != nil {
			continue
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Motion export image fetcher")
		req.Header.Set("Accept", "image/png,image/jpeg,image/gif,image/*")
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxExportImageBytes+1))
		resp.Body.Close()
		if readErr != nil || resp.StatusCode < 200 || resp.StatusCode >= 300 || len(body) == 0 || len(body) > maxExportImageBytes {
			continue
		}
		img, _, err := image.Decode(bytes.NewReader(body))
		if err != nil {
			continue
		}
		bounds := img.Bounds()
		if bounds.Dx() <= 0 || bounds.Dy() <= 0 {
			continue
		}
		var encoded bytes.Buffer
		if err := png.Encode(&encoded, img); err != nil {
			continue
		}
		diagrams[block.ID] = export.Diagram{PNG: encoded.Bytes(), Width: bounds.Dx(), Height: bounds.Dy()}
		fetched++
	}
	return diagrams
}

func collectImageBlocks(blocks []model.Block) []model.Block {
	out := make([]model.Block, 0)
	for _, block := range blocks {
		if block.Type == "image" {
			out = append(out, block)
		}
		if block.Layout != nil {
			for _, column := range block.Layout.Columns {
				out = append(out, collectImageBlocks(column.Blocks)...)
			}
		}
	}
	return out
}

func exportImageTarget(r *http.Request, raw string) (*url.URL, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	if !parsed.IsAbs() {
		scheme := "http"
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			scheme = "https"
		}
		base := &url.URL{Scheme: scheme, Host: r.Host}
		return base.ResolveReference(parsed), nil
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("unsupported image scheme")
	}
	host := parsed.Hostname()
	if host == "" || strings.EqualFold(host, "localhost") || strings.HasSuffix(strings.ToLower(host), ".local") {
		return nil, fmt.Errorf("private image host")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
	if err != nil || len(ips) == 0 {
		return nil, fmt.Errorf("could not resolve image host")
	}
	for _, ip := range ips {
		if !publicImageIP(ip) {
			return nil, fmt.Errorf("private image host")
		}
	}
	return parsed, nil
}

func publicImageIP(ip net.IP) bool {
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() || ip.IsMulticast() {
		return false
	}
	if ip4 := ip.To4(); ip4 != nil {
		// Carrier-grade NAT and link-local metadata ranges.
		if ip4[0] == 169 && ip4[1] == 254 {
			return false
		}
		if ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
			return false
		}
	}
	return true
}
