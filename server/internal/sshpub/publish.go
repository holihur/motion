package sshpub

import (
	"context"
	"fmt"
	"net"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type Config struct {
	Host            string
	Port            string
	Username        string
	PrivateKey      string
	RemotePath      string
	HostFingerprint string
}

func hostKeyCallback(fingerprint string) ssh.HostKeyCallback {
	fingerprint = strings.TrimSpace(fingerprint)
	if fingerprint == "" {
		return ssh.InsecureIgnoreHostKey()
	}
	return func(_ string, _ net.Addr, key ssh.PublicKey) error {
		actual := ssh.FingerprintSHA256(key)
		if actual != fingerprint {
			return fmt.Errorf("SSH host key mismatch: got %s", actual)
		}
		return nil
	}
}

// Publish writes the given files into the configured remote directory using SFTP.
func Publish(ctx context.Context, cfg Config, files map[string][]byte) error {
	port := strings.TrimSpace(cfg.Port)
	if port == "" {
		port = "22"
	}
	if _, err := strconv.Atoi(port); err != nil {
		return fmt.Errorf("invalid SSH port")
	}
	signer, err := ssh.ParsePrivateKey([]byte(cfg.PrivateKey))
	if err != nil {
		return fmt.Errorf("invalid SSH private key: %w", err)
	}
	client, err := ssh.Dial("tcp", net.JoinHostPort(cfg.Host, port), &ssh.ClientConfig{
		User:            cfg.Username,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(signer)},
		HostKeyCallback: hostKeyCallback(cfg.HostFingerprint),
		Timeout:         15 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("SSH connection failed: %w", err)
	}
	defer client.Close()
	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return fmt.Errorf("SFTP connection failed: %w", err)
	}
	defer sftpClient.Close()
	remote := path.Clean("/" + cfg.RemotePath)
	if err := sftpClient.MkdirAll(remote); err != nil {
		return fmt.Errorf("could not create remote directory: %w", err)
	}
	for name, content := range files {
		if strings.Contains(name, "..") || strings.Contains(name, "/") {
			continue
		}
		target := path.Join(remote, name)
		if err := sftpClient.MkdirAll(path.Dir(target)); err != nil {
			return err
		}
		file, err := sftpClient.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC)
		if err != nil {
			return fmt.Errorf("could not open %s: %w", target, err)
		}
		if _, err := file.Write(content); err != nil {
			_ = file.Close()
			return fmt.Errorf("could not write %s: %w", target, err)
		}
		if err := file.Close(); err != nil {
			return err
		}
	}
	_ = ctx
	return nil
}
