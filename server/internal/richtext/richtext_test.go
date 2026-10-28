package richtext

import (
	"strings"
	"testing"
)

const sample = `{"root":{"children":[{"type":"paragraph","children":[{"type":"text","text":"Use ","format":0},{"type":"text","text":"npm i","format":16},{"type":"text","text":" <script>","format":0},{"type":"link","url":"https://example.com/?a=1&b=2","children":[{"type":"text","text":"docs","format":1}]}]}]}}`

func TestHTML(t *testing.T) {
	out := HTML(sample, "fallback", "")
	for _, want := range []string{"<code>npm i</code>", "&lt;script&gt;", `<a href="https://example.com/?a=1&amp;b=2"><strong>docs</strong></a>`} {
		if !strings.Contains(out, want) {
			t.Fatalf("HTML missing %q: %s", want, out)
		}
	}
}

func TestMarkdown(t *testing.T) {
	out := Markdown(sample, "fallback")
	for _, want := range []string{"`npm i`", `[**docs**](https://example.com/?a=1&b=2)`} {
		if !strings.Contains(out, want) {
			t.Fatalf("Markdown missing %q: %s", want, out)
		}
	}
}

func TestFallback(t *testing.T) {
	if got := HTML("", "<b>", ""); got != "&lt;b&gt;" {
		t.Fatalf("unexpected fallback: %s", got)
	}
	if got := Markdown("", "plain"); got != "plain" {
		t.Fatalf("unexpected markdown fallback: %s", got)
	}
}
