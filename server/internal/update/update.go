package update

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/motion/server/internal/version"
)

type Asset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
}

type Release struct {
	Tag         string  `json:"tag_name"`
	Name        string  `json:"name"`
	URL         string  `json:"html_url"`
	PublishedAt string  `json:"published_at"`
	Assets      []Asset `json:"assets"`
}

type Check struct {
	Version     string `json:"version"`
	Commit      string `json:"commit"`
	Date        string `json:"date"`
	Repo        string `json:"repo"`
	Latest      string `json:"latest,omitempty"`
	Available   bool   `json:"available"`
	ReleaseURL  string `json:"releaseUrl,omitempty"`
	PublishedAt string `json:"publishedAt,omitempty"`
	Error       string `json:"error,omitempty"`
}

type Client struct {
	Repo  string
	Token string
	HTTP  *http.Client
}

func New(repo, token string) *Client {
	return &Client{Repo: repo, Token: token, HTTP: &http.Client{Timeout: 60 * time.Second}}
}

func (c *Client) request(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "motion-self-update/"+version.Version)
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	return c.HTTP.Do(req)
}

func (c *Client) Latest(ctx context.Context) (Release, error) {
	if c.Repo == "" || !strings.Contains(c.Repo, "/") {
		return Release{}, errors.New("update repository is not configured")
	}
	resp, err := c.request(ctx, "https://api.github.com/repos/"+c.Repo+"/releases/latest")
	if err != nil {
		return Release{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return Release{}, fmt.Errorf("GitHub release request failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var release Release
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return Release{}, err
	}
	return release, nil
}

func (c *Client) Check(ctx context.Context) Check {
	out := Check{Version: version.Version, Commit: version.Commit, Date: version.Date, Repo: c.Repo}
	release, err := c.Latest(ctx)
	if err != nil {
		out.Error = err.Error()
		return out
	}
	out.Latest = release.Tag
	out.ReleaseURL = release.URL
	out.PublishedAt = release.PublishedAt
	if Newer(version.Version, release.Tag) {
		out.Available = true
	}
	return out
}

func assetName(versionTag string) string {
	versionValue := strings.TrimPrefix(versionTag, "v")
	return fmt.Sprintf("motion_%s_%s_%s.tar.gz", versionValue, runtime.GOOS, runtime.GOARCH)
}

func (c *Client) Apply(ctx context.Context) (string, error) {
	if runtime.GOOS == "windows" {
		return "", errors.New("self-update is not supported on Windows; install the new release manually")
	}
	release, err := c.Latest(ctx)
	if err != nil {
		return "", err
	}
	if !Newer(version.Version, release.Tag) {
		return "", errors.New("already up to date")
	}
	name := assetName(release.Tag)
	var asset *Asset
	var checksums *Asset
	for i := range release.Assets {
		if release.Assets[i].Name == name {
			asset = &release.Assets[i]
		}
		if release.Assets[i].Name == "checksums.txt" {
			checksums = &release.Assets[i]
		}
	}
	if asset == nil {
		return "", fmt.Errorf("release %s has no asset for %s/%s", release.Tag, runtime.GOOS, runtime.GOARCH)
	}
	if checksums == nil {
		return "", errors.New("release is missing checksums.txt")
	}
	expected, err := c.checksum(ctx, checksums.URL, name)
	if err != nil {
		return "", err
	}
	archivePath := filepath.Join(os.TempDir(), "motion-update-"+strconv.FormatInt(time.Now().UnixNano(), 36)+".tar.gz")
	defer os.Remove(archivePath)
	if err := c.download(ctx, asset.URL, archivePath, expected); err != nil {
		return "", err
	}
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	tmpPath := exe + ".new"
	_ = os.Remove(tmpPath)
	if err := extractBinary(archivePath, tmpPath); err != nil {
		return "", err
	}
	if err := os.Chmod(tmpPath, 0o755); err != nil {
		return "", err
	}
	if err := os.Rename(tmpPath, exe); err != nil {
		_ = os.Remove(tmpPath)
		return "", err
	}
	return release.Tag, nil
}

func (c *Client) checksum(ctx context.Context, url, asset string) (string, error) {
	resp, err := c.request(ctx, url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("checksum download failed: %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && strings.TrimPrefix(fields[1], "*") == asset {
			return strings.ToLower(fields[0]), nil
		}
	}
	return "", errors.New("checksum not found for " + asset)
}

func (c *Client) download(ctx context.Context, url, dest, expected string) error {
	resp, err := c.request(ctx, url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: %d", resp.StatusCode)
	}
	file, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(io.MultiWriter(file, hash), resp.Body); err != nil {
		return err
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if !strings.EqualFold(actual, expected) {
		return fmt.Errorf("checksum mismatch (expected %s, got %s)", expected, actual)
	}
	return nil
}

func extractBinary(archive, dest string) error {
	file, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer file.Close()
	gz, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gz.Close()
	reader := tar.NewReader(gz)
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if header.Typeflag != tar.TypeReg {
			continue
		}
		name := filepath.Base(header.Name)
		if name != "motion" && name != "motion.exe" {
			continue
		}
		out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(out, reader)
		closeErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	}
	return errors.New("motion binary not found in archive")
}

// Newer reports whether latest is a newer semantic version than current.
func Newer(current, latest string) bool {
	current = strings.TrimPrefix(strings.TrimSpace(current), "v")
	latest = strings.TrimPrefix(strings.TrimSpace(latest), "v")
	if current == "" || current == "dev" {
		return false
	}
	if latest == "" || latest == current {
		return false
	}
	a, aPre := splitVersion(current)
	b, bPre := splitVersion(latest)
	for i := 0; i < 3; i++ {
		if b[i] != a[i] {
			return b[i] > a[i]
		}
	}
	if aPre == "" && bPre != "" {
		return false
	}
	if aPre != "" && bPre == "" {
		return true
	}
	return bPre > aPre
}

func splitVersion(value string) ([3]int, string) {
	var parts [3]int
	core := value
	pre := ""
	if index := strings.IndexAny(core, "-+"); index >= 0 {
		pre = core[index+1:]
		core = core[:index]
	}
	for i, part := range strings.Split(core, ".") {
		if i >= 3 {
			break
		}
		parts[i], _ = strconv.Atoi(part)
	}
	return parts, pre
}
