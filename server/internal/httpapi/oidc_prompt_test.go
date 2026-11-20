package httpapi

import (
	"testing"

	"github.com/motion/server/internal/model"
)

func TestNeedsPasswordModeChoice(t *testing.T) {
	linked := "https://id.example.com/t/acme"
	cases := []struct {
		name string
		user model.User
		want bool
	}{
		{
			name: "local password linked to SSO asks",
			user: model.User{Password: "$2a$10$hash", OIDCIssuer: linked},
			want: true,
		},
		{
			name: "user already decided",
			user: model.User{Password: "$2a$10$hash", OIDCIssuer: linked, PasswordLoginAsked: true},
			want: false,
		},
		{
			name: "password already disabled",
			user: model.User{Password: "!oidc", OIDCIssuer: linked},
			want: false,
		},
		{
			name: "SSO-only account created by OIDC",
			user: model.User{Password: "!oidc", OIDCIssuer: linked},
			want: false,
		},
		{
			name: "not linked yet",
			user: model.User{Password: "$2a$10$hash"},
			want: false,
		},
		{
			name: "empty password",
			user: model.User{OIDCIssuer: linked},
			want: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := needsPasswordModeChoice(tc.user); got != tc.want {
				t.Fatalf("needsPasswordModeChoice() = %v, want %v", got, tc.want)
			}
		})
	}
}
