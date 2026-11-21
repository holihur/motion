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

func TestRuns(t *testing.T) {
	runs := Runs(sample, "fallback")
	if len(runs) < 3 {
		t.Fatalf("expected multiple runs: %#v", runs)
	}
	if !runs[1].Code || runs[1].Text != "npm i" {
		t.Fatalf("inline code run missing: %#v", runs)
	}
	var linked *Run
	for index := range runs {
		if runs[index].URL != "" {
			linked = &runs[index]
		}
	}
	if linked == nil || linked.Text != "docs" || !linked.Bold || linked.URL == "" {
		t.Fatalf("link run missing: %#v", runs)
	}
}

const formatted = `{"root":{"children":[{"type":"paragraph","children":[
{"type":"text","text":"hi","format":128},
{"type":"text","text":"2","format":32},
{"type":"text","text":"3","format":64},
{"type":"inlineEquation","version":1,"latex":"a^2+b^2"},
{"type":"text","text":" end","format":0}
]}]}}`

func TestFormattedInlineHTML(t *testing.T) {
	out := HTML(formatted, "", "")
	for _, want := range []string{"<mark>hi</mark>", "<sub>2</sub>", "<sup>3</sup>", `<span class="math">$a^2+b^2$</span>`} {
		if !strings.Contains(out, want) {
			t.Fatalf("HTML missing %q: %s", want, out)
		}
	}
}

func TestFormattedInlineMarkdown(t *testing.T) {
	out := Markdown(formatted, "")
	for _, want := range []string{"==hi==", "<sub>2</sub>", "<sup>3</sup>", "$a^2+b^2$"} {
		if !strings.Contains(out, want) {
			t.Fatalf("Markdown missing %q: %s", want, out)
		}
	}
}

func TestFormattedInlineRuns(t *testing.T) {
	var equation *Run
	for _, run := range Runs(formatted, "") {
		if strings.Contains(run.Text, "$a^2+b^2$") {
			copied := run
			equation = &copied
		}
	}
	if equation == nil {
		t.Fatalf("equation run missing: %#v", Runs(formatted, ""))
	}
}
