package httpapi

import (
	"sync"
	"time"
)

type windowCounter struct {
	count int
	reset time.Time
}

type windowLimiter struct {
	mu      sync.Mutex
	entries map[string]windowCounter
}

func newWindowLimiter() *windowLimiter {
	return &windowLimiter{entries: map[string]windowCounter{}}
}

func (l *windowLimiter) allow(key string, limit int, window time.Duration) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	entry, ok := l.entries[key]
	if !ok || now.After(entry.reset) {
		l.entries[key] = windowCounter{count: 1, reset: now.Add(window)}
		return true
	}
	if entry.count >= limit {
		return false
	}
	entry.count++
	l.entries[key] = entry
	if len(l.entries) > 10000 {
		for candidate, item := range l.entries {
			if now.After(item.reset) {
				delete(l.entries, candidate)
			}
		}
	}
	return true
}

var (
	aiRunLimiter      = newWindowLimiter()
	uploadRateLimiter = newWindowLimiter()
)
