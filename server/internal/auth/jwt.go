package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Claims struct {
	UserID string `json:"uid"`
	jwt.RegisteredClaims
}

type Manager struct {
	secret []byte
	ttl    time.Duration
}

func NewManager(secret string, ttl time.Duration) *Manager {
	return &Manager{secret: []byte(secret), ttl: ttl}
}

func (m *Manager) Issue(userID primitive.ObjectID) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID.Hex(),
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "motion",
			Subject:   userID.Hex(),
			Audience:  jwt.ClaimStrings{"motion"},
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now.Add(-60 * time.Second)),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

func (m *Manager) Parse(token string) (primitive.ObjectID, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	}, jwt.WithIssuer("motion"), jwt.WithAudience("motion"), jwt.WithLeeway(60*time.Second))
	if err != nil {
		return primitive.NilObjectID, err
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return primitive.NilObjectID, errors.New("invalid token")
	}
	return primitive.ObjectIDFromHex(claims.UserID)
}
