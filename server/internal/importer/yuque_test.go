package importer

import "testing"

func TestYuqueHostAllowed(t *testing.T) {
	for _, host := range []string{"yuque.com", "www.yuque.com", "WWW.YUQUE.COM"} {
		if !yuqueHostAllowed(host) {
			t.Fatalf("%s should be allowed", host)
		}
	}
	for _, host := range []string{"", "evil.com", "yuque.com.evil.com", "evil.yuque.com", "127.0.0.1"} {
		if yuqueHostAllowed(host) {
			t.Fatalf("%s should be rejected", host)
		}
	}
}
