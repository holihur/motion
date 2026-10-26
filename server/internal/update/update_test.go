package update

import "testing"

func TestNewer(t *testing.T) {
	cases := []struct {
		current, latest string
		want            bool
	}{
		{"v1.0.0", "v1.0.1", true},
		{"1.0.0", "v1.0.0", false},
		{"v1.2.0", "v1.1.9", false},
		{"dev", "v9.9.9", false},
		{"v1.0.0-beta", "v1.0.0", true},
		{"v1.0.0", "v1.0.0-rc1", false},
	}
	for _, test := range cases {
		if got := Newer(test.current, test.latest); got != test.want {
			t.Errorf("Newer(%q, %q) = %v, want %v", test.current, test.latest, got, test.want)
		}
	}
}
