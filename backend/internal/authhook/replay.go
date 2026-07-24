package authhook

import (
	"sync"
	"time"
)

type ReplayGuard struct {
	mu      sync.Mutex
	entries map[string]time.Time
	ttl     time.Duration
	now     func() time.Time
}

func NewReplayGuard(ttl time.Duration) *ReplayGuard {
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	return &ReplayGuard{
		entries: make(map[string]time.Time),
		ttl:     ttl,
		now:     time.Now,
	}
}

func (g *ReplayGuard) Claim(id string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := g.now()
	for key, expiresAt := range g.entries {
		if !expiresAt.After(now) {
			delete(g.entries, key)
		}
	}

	if _, exists := g.entries[id]; exists {
		return false
	}
	g.entries[id] = now.Add(g.ttl)
	return true
}

func (g *ReplayGuard) Release(id string) {
	g.mu.Lock()
	delete(g.entries, id)
	g.mu.Unlock()
}
