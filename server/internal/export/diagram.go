package export

// Diagram is a browser-rendered Mermaid diagram supplied with an export
// request. PNG is used for PDF (gopdf has no SVG support); DOCX embeds both the
// SVG (vector) and the PNG fallback.
type Diagram struct {
	SVG    []byte
	PNG    []byte
	Width  int
	Height int
}

func firstDiagramMap(diagrams []map[string]Diagram) map[string]Diagram {
	if len(diagrams) == 0 {
		return nil
	}
	return diagrams[0]
}
