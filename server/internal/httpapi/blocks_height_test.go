package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
)

// Both block write endpoints decode the same model.Block payload. Height is a
// client-controlled resize property, so an unknown-field regression must fail
// here rather than surfacing as a generic "invalid request body" in the UI.
func TestBlockWriteRequestsPreserveHeight(t *testing.T) {
	t.Run("blocks", func(t *testing.T) {
		req := httptest.NewRequest("PUT", "/api/pages/000000000000000000000000/blocks",
			strings.NewReader(`{"blocks":[{"id":"b1","type":"paragraph","text":"hello","height":240}]}`))
		var body saveBlocksRequest
		if err := decodeJSON(req, &body); err != nil {
			t.Fatalf("decode blocks request: %v", err)
		}
		if len(body.Blocks) != 1 || body.Blocks[0].Height != 240 {
			t.Fatalf("height was not decoded: %#v", body.Blocks)
		}
	})

	t.Run("ops", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/pages/000000000000000000000000/ops",
			strings.NewReader(`{"baseRev":1,"order":["b1"],"upserts":[{"id":"b1","type":"paragraph","text":"hello","height":320}],"deletes":[]}`))
		var body blockSyncRequest
		if err := decodeJSON(req, &body); err != nil {
			t.Fatalf("decode ops request: %v", err)
		}
		if len(body.Upserts) != 1 || body.Upserts[0].Height != 320 {
			t.Fatalf("height was not decoded: %#v", body.Upserts)
		}
	})
}
