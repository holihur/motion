package export

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"strings"
	"strconv"
	"time"
	"unicode"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/code128"
	"github.com/boombuler/barcode/code39"
	"github.com/boombuler/barcode/ean"
	"github.com/boombuler/barcode/twooffive"
	qrcode "github.com/skip2/go-qrcode"
	"github.com/signintech/gopdf"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/richtext"
	"github.com/motion/server/internal/staticpublish"
)

//go:embed NotoSansSC-Regular.ttf
var pdfFont []byte

//go:embed LiberationMono-Regular.ttf
var pdfMonoFont []byte

//go:embed LiberationSans-Italic.ttf
var pdfItalicFont []byte

const (
	defaultPDFMargin = 54.0
	pdfHeaderY       = 34.0
	pdfFooterY       = 28.0
	pdfBodySize      = 10.5
	pdfLineHeight    = 17.0
)

func HTML(page model.Page) ([]byte, error) {
	files, err := staticpublish.Render(page.ID, []model.Page{page}, "")
	if err != nil {
		return nil, err
	}
	return files["index.html"], nil
}

// PDFOptions controls page geometry and optional front matter.
type PDFOptions struct {
	Paper     string
	Landscape bool
	Margin    float64
	Cover     bool
	Contents  bool
}

type outlineEntry struct {
	Level int
	Title string
	Page  int
	Y     float64
}

func PDF(page model.Page, diagrams ...map[string]Diagram) ([]byte, error) {
	return PDFWithOptions(page, PDFOptions{}, diagrams...)
}

func PDFWithOptions(page model.Page, options PDFOptions, diagrams ...map[string]Diagram) ([]byte, error) {
	opts := normalizePDFOptions(options)
	assets := firstDiagramMap(diagrams)
	entries := []outlineEntry(nil)
	tocPages := 0

	if opts.Contents {
		trial, err := newPDFRenderer(page, opts, assets)
		if err != nil {
			return nil, err
		}
		trial.collectEntries = true
		trial.renderBody(page, opts.Cover)
		entries = trial.entries
		if len(entries) > 0 {
			tocPages = measureTOCPages(entries, opts)
		}
	}

	r, err := newPDFRenderer(page, opts, assets)
	if err != nil {
		return nil, err
	}
	if opts.Cover {
		r.coverPages = 1
	}
	r.tocPages = tocPages
	r.bookmarks = true

	if opts.Cover {
		r.drawCover(page)
	}
	if r.tocPages > 0 {
		if opts.Cover {
			r.newPage()
		}
		r.drawTOC(entries, r.coverPages+r.tocPages)
		r.newPage()
	} else if opts.Cover {
		r.newPage()
	}
	r.renderBody(page, opts.Cover)
	r.drawChrome()

	var out bytes.Buffer
	if err := r.pdf.Write(&out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func normalizePDFOptions(options PDFOptions) PDFOptions {
	if strings.EqualFold(options.Paper, "letter") {
		options.Paper = "letter"
	} else {
		options.Paper = "a4"
	}
	if options.Margin <= 0 {
		options.Margin = defaultPDFMargin
	}
	if options.Margin < 24 {
		options.Margin = 24
	}
	if options.Margin > 120 {
		options.Margin = 120
	}
	return options
}

func pdfPageSize(options PDFOptions) (float64, float64) {
	width, height := 595.28, 841.89
	if options.Paper == "letter" {
		width, height = 612, 792
	}
	if options.Landscape {
		width, height = height, width
	}
	return width, height
}

func newPDFRenderer(page model.Page, options PDFOptions, diagrams map[string]Diagram) (*pdfRenderer, error) {
	width, height := pdfPageSize(options)
	pdf := gopdf.GoPdf{}
	pdf.Start(gopdf.Config{PageSize: gopdf.Rect{W: width, H: height}})
	pdf.AddPage()
	if err := pdf.AddTTFFontData("noto", pdfFont); err != nil {
		return nil, fmt.Errorf("could not load PDF font: %w", err)
	}
	if err := pdf.AddTTFFontData("mono", pdfMonoFont); err != nil {
		return nil, fmt.Errorf("could not load PDF mono font: %w", err)
	}
	if err := pdf.AddTTFFontData("italic", pdfItalicFont); err != nil {
		return nil, fmt.Errorf("could not load PDF italic font: %w", err)
	}
	if err := pdf.SetFont("noto", "", pdfBodySize); err != nil {
		return nil, err
	}
	pdf.SetInfo(gopdf.PdfInfo{
		Title:        page.Title,
		Author:       "Motion",
		Creator:      "Motion",
		Producer:     "Motion",
		CreationDate: time.Now(),
	})
	margin := options.Margin
	return &pdfRenderer{
		pdf:      &pdf,
		x:        margin,
		y:        margin + 18,
		width:    width - margin*2,
		top:      margin + 18,
		bottom:   height - margin - 10,
		pageW:    width,
		pageH:    height,
		title:    page.Title,
		diagrams: diagrams,
		numbered: numberedMarkers(page.Blocks),
		headings: headingEntries(page.Blocks),
		options:  options,
	}, nil
}

type pdfRenderer struct {
	pdf      *gopdf.GoPdf
	x, y     float64
	width    float64
	top      float64
	bottom   float64
	pageW    float64
	pageH    float64
	title    string
	diagrams map[string]Diagram
	numbered map[string]string
	headings []outlineEntry
	options  PDFOptions

	coverPages     int
	tocPages       int
	bookmarks      bool
	collectEntries bool
	entries        []outlineEntry
}

func (r *pdfRenderer) renderBody(page model.Page, cover bool) {
	if !cover {
		r.documentTitle(page.Title)
	}
	for _, block := range page.Blocks {
		r.block(block)
	}
}

func (r *pdfRenderer) drawCover(page model.Page) {
	r.pdf.SetFillColor(250, 248, 255)
	r.pdf.RectFromUpperLeftWithStyle(0, 0, r.pageW, r.pageH, "F")
	r.pdf.SetFillColor(118, 92, 232)
	r.pdf.RectFromUpperLeftWithStyle(r.x, r.pageH*0.2, 3, r.pageH*0.42, "F")

	r.y = r.pageH * 0.27
	r.setFont(32)
	r.pdf.SetTextColor(24, 24, 32)
	title := strings.TrimSpace(page.Title)
	if title == "" {
		title = "Untitled"
	}
	for _, line := range r.wrapLines(title, 32, r.width-24) {
		r.pdf.SetXY(r.x+16, r.y)
		_ = r.pdf.Text(line)
		r.y += 40
	}
	r.y += 14
	r.setFont(10.5)
	r.pdf.SetTextColor(120, 120, 132)
	r.pdf.SetXY(r.x+16, r.y)
	_ = r.pdf.Text(time.Now().Format("January 2, 2006"))
	r.y += 18
	r.pdf.SetXY(r.x+16, r.y)
	_ = r.pdf.Text("Motion")
	r.pdf.SetTextColor(0, 0, 0)
}

func (r *pdfRenderer) drawTOC(entries []outlineEntry, offset int) {
	r.y = r.top
	r.setFont(22)
	r.pdf.SetTextColor(24, 24, 32)
	r.pdf.SetXY(r.x, r.y)
	_ = r.pdf.Text("Contents")
	r.y += 36
	for _, entry := range entries {
		indent := float64(max(0, entry.Level-1)) * 14
		label := fmt.Sprintf("%d", entry.Page+offset)
		labelWidth := r.textWidth(label)
		title := strings.TrimSpace(entry.Title)
		if title == "" {
			title = "Untitled"
		}
		lines := r.wrapLines(title, 10.5, r.width-indent-labelWidth-18)
		need := float64(len(lines))*17 + 8
		if r.y+need > r.bottom {
			r.newPage()
			r.y = r.top
		}
		r.setFont(10.5)
		r.pdf.SetTextColor(45, 45, 55)
		for index, line := range lines {
			r.pdf.SetXY(r.x+indent, r.y)
			_ = r.pdf.Text(line)
			if entry.Level == 1 {
				r.pdf.SetXY(r.x+indent+0.2, r.y)
				_ = r.pdf.Text(line)
			}
			if index == 0 {
				r.pdf.SetXY(r.x+r.width-labelWidth, r.y)
				_ = r.pdf.Text(label)
			}
			r.y += 17
		}
		r.y += 6
	}
	r.pdf.SetTextColor(0, 0, 0)
	r.y += 8
}

func measureTOCPages(entries []outlineEntry, options PDFOptions) int {
	r, err := newPDFRenderer(model.Page{}, options, nil)
	if err != nil {
		return 1
	}
	r.drawTOC(entries, 1)
	return r.pdf.GetNumberOfPages()
}

func (r *pdfRenderer) documentTitle(title string) {
	if strings.TrimSpace(title) == "" {
		return
	}
	r.y += 4
	r.richText(title, 24, 32, 0, true)
	r.y += 8
}

func (r *pdfRenderer) diagram(block model.Block) bool {
	return r.embedAsset(block, 460)
}

func (r *pdfRenderer) image(block model.Block) bool {
	return r.embedAsset(block, 620)
}

func (r *pdfRenderer) embedAsset(block model.Block, maxHeight float64) bool {
	asset, ok := r.diagrams[block.ID]
	if !ok || len(asset.PNG) == 0 {
		return false
	}
	holder, err := gopdf.ImageHolderByBytes(asset.PNG)
	if err != nil {
		return false
	}
	width, height := float64(asset.Width), float64(asset.Height)
	if width <= 0 || height <= 0 {
		width, height = 800, 600
	}
	scale := math.Min(r.width/width, maxHeight/height)
	if scale <= 0 {
		return false
	}
	w, h := width*scale, height*scale
	r.ensure(h + 16)
	if err := r.pdf.ImageByHolder(holder, r.x+(r.width-w)/2, r.y, &gopdf.Rect{W: w, H: h}); err != nil {
		return false
	}
	r.y += h + 8
	if caption := strings.TrimSpace(block.Caption); caption != "" {
		r.centeredText(caption, 9.5, 14)
	}
	r.y += 8
	return true
}

func (r *pdfRenderer) centeredText(text string, size, lineHeight float64) {
	lines := r.wrapLines(text, size, r.width)
	for _, line := range lines {
		r.ensure(lineHeight)
		width := r.textWidth(line)
		r.pdf.SetXY(r.x+(r.width-width)/2, r.y)
		_ = r.pdf.Text(line)
		r.y += lineHeight
	}
}

func (r *pdfRenderer) ensure(height float64) {
	if r.y+height <= r.bottom {
		return
	}
	r.newPage()
}

func (r *pdfRenderer) newPage() {
	r.pdf.AddPage()
	r.y = r.top
}

func (r *pdfRenderer) setFont(size float64) {
	r.setFontFamily("noto", size)
}

func (r *pdfRenderer) setFontFamily(family string, size float64) {
	_ = r.pdf.SetFont(family, "", size)
}

func (r *pdfRenderer) drawChrome() {
	total := r.pdf.GetNumberOfPages()
	date := time.Now().Format("2006-01-02")
	headerStart := r.coverPages + r.tocPages + 1
	for page := 1; page <= total; page++ {
		if err := r.pdf.SetPage(page); err != nil {
			continue
		}
		r.setFont(8)
		r.pdf.SetTextColor(135, 135, 145)
		if page >= headerStart && page > 1 {
			title := r.truncateToWidth(r.title, r.width-80)
			r.pdf.SetXY(r.x, pdfHeaderY)
			_ = r.pdf.Text(title)
			r.pdf.SetXY(r.x+r.width-r.textWidth("Motion"), pdfHeaderY)
			_ = r.pdf.Text("Motion")
		}
		if page > r.coverPages {
			r.pdf.SetXY(r.x, r.pageH-pdfFooterY)
			_ = r.pdf.Text(date)
			label := fmt.Sprintf("%d / %d", page, total)
			r.pdf.SetXY(r.x+r.width-r.textWidth(label), r.pageH-pdfFooterY)
			_ = r.pdf.Text(label)
		}
		r.pdf.SetTextColor(0, 0, 0)
	}
	r.setFont(pdfBodySize)
}

func (r *pdfRenderer) textWidth(text string) float64 {
	width, err := r.pdf.MeasureTextWidth(text)
	if err != nil {
		return float64(len([]rune(text))) * 5
	}
	return width
}

func (r *pdfRenderer) truncateToWidth(text string, maxWidth float64) string {
	text = strings.TrimSpace(text)
	if text == "" || r.textWidth(text) <= maxWidth {
		return text
	}
	runes := []rune(text)
	for len(runes) > 1 {
		runes = runes[:len(runes)-1]
		candidate := string(runes) + "…"
		if r.textWidth(candidate) <= maxWidth {
			return candidate
		}
	}
	return string(runes)
}

func tokenizeForWrap(text string) []string {
	var tokens []string
	var word strings.Builder
	flush := func() {
		if word.Len() > 0 {
			tokens = append(tokens, word.String())
			word.Reset()
		}
	}
	for _, char := range text {
		switch {
		case char == '\n':
			flush()
			tokens = append(tokens, "\n")
		case unicode.IsSpace(char):
			flush()
			tokens = append(tokens, string(char))
		case breakableCJK(char):
			flush()
			tokens = append(tokens, string(char))
		default:
			word.WriteRune(char)
		}
	}
	flush()
	return tokens
}

func breakableCJK(char rune) bool {
	return unicode.Is(unicode.Han, char) ||
		unicode.Is(unicode.Hiragana, char) ||
		unicode.Is(unicode.Katakana, char) ||
		unicode.Is(unicode.Hangul, char) ||
		(char >= 0x3000 && char <= 0x303F) ||
		(char >= 0xFF00 && char <= 0xFFEF)
}

func (r *pdfRenderer) splitLongToken(token string, maxWidth float64) []string {
	if maxWidth <= 0 {
		return []string{token}
	}
	var chunks []string
	var current strings.Builder
	width := 0.0
	for _, char := range token {
		part := string(char)
		partWidth := r.textWidth(part)
		if current.Len() > 0 && width+partWidth > maxWidth {
			chunks = append(chunks, current.String())
			current.Reset()
			width = 0
		}
		current.WriteString(part)
		width += partWidth
	}
	if current.Len() > 0 {
		chunks = append(chunks, current.String())
	}
	return chunks
}

func (r *pdfRenderer) wrapLines(text string, size, maxWidth float64) []string {
	return r.wrapLinesFont(text, size, maxWidth, "noto")
}

func (r *pdfRenderer) wrapLinesFont(text string, size, maxWidth float64, family string) []string {
	r.setFontFamily(family, size)
	if maxWidth <= 0 {
		return []string{text}
	}
	var lines []string
	var line strings.Builder
	lineWidth := 0.0
	flush := func() {
		lines = append(lines, strings.TrimRight(line.String(), " \t"))
		line.Reset()
		lineWidth = 0
	}
	for _, token := range tokenizeForWrap(text) {
		if token == "\n" {
			flush()
			continue
		}
		if token == "" {
			continue
		}
		if strings.TrimSpace(token) == "" {
			if line.Len() == 0 {
				continue
			}
			width := r.textWidth(token)
			if lineWidth+width <= maxWidth {
				line.WriteString(token)
				lineWidth += width
			}
			continue
		}
		width := r.textWidth(token)
		if line.Len() > 0 && lineWidth+width > maxWidth {
			flush()
		}
		if width <= maxWidth-lineWidth {
			line.WriteString(token)
			lineWidth += width
			continue
		}
		chunks := r.splitLongToken(token, maxWidth)
		for index, chunk := range chunks {
			if index > 0 {
				flush()
			}
			line.WriteString(chunk)
			lineWidth = r.textWidth(chunk)
		}
	}
	if line.Len() > 0 || len(lines) == 0 {
		flush()
	}
	return lines
}

func (r *pdfRenderer) text(text string, size, lineHeight, indent float64) {
	for _, line := range r.wrapLines(text, size, r.width-indent) {
		r.ensure(lineHeight)
		r.pdf.SetXY(r.x+indent, r.y)
		_ = r.pdf.Text(line)
		r.y += lineHeight
	}
}

func (r *pdfRenderer) richText(text string, size, lineHeight, indent float64, bold bool) {
	block := model.Block{Text: text}
	r.richBlock(block, "", size, lineHeight, indent, bold)
}

func (r *pdfRenderer) heading(text string, size float64) {
	if strings.TrimSpace(text) == "" {
		return
	}
	lineHeight := size * 1.35
	if size >= 20 {
		r.y += 12
	} else if size >= 16 {
		r.y += 9
	} else {
		r.y += 7
	}
	r.ensure(lineHeight + 42)
	r.richText(text, size, lineHeight, 0, true)
	r.y += 3
}

func parseHexColor(value string) color.Color {
	value = strings.TrimSpace(value)
	if len(value) != 7 || value[0] != '#' {
		return color.RGBA{R: 15, G: 23, B: 42, A: 255}
	}
	rgb, err := strconv.ParseUint(value[1:], 16, 32)
	if err != nil {
		return color.RGBA{R: 15, G: 23, B: 42, A: 255}
	}
	return color.RGBA{R: uint8(rgb >> 16), G: uint8(rgb >> 8), B: uint8(rgb), A: 255}
}

func (r *pdfRenderer) qrCode(block model.Block) bool {
	values := make([]string, 0)
	for _, line := range strings.Split(block.Text, "\n") {
		if value := strings.TrimSpace(line); value != "" {
			values = append(values, value)
		}
	}
	if len(values) == 0 {
		return false
	}
	columns := 1
	size := 150.0
	if len(values) > 1 {
		columns = 2
		size = 108.0
	}
	gap := 16.0
	cellWidth := (r.width - gap*float64(columns-1)) / float64(columns)
	for index := 0; index < len(values); {
		count := min(columns, len(values)-index)
		rowHeight := size + 24
		r.ensure(rowHeight + 10)
		start := r.y
		for column := 0; column < count; column++ {
			value := values[index+column]
			qr, err := qrcode.New(value, qrcode.Medium)
			if err != nil {
				continue
			}
			qr.ForegroundColor = parseHexColor(block.Color)
			qr.BackgroundColor = color.White
			img := qr.Image(-6)
			cellX := r.x + float64(column)*(cellWidth+gap)
			_ = r.pdf.ImageFrom(img, cellX+(cellWidth-size)/2, start, &gopdf.Rect{W: size, H: size})
			label := r.truncateToWidth(value, cellWidth)
			r.setFont(8)
			r.pdf.SetTextColor(115, 115, 125)
			r.pdf.SetXY(cellX+(cellWidth-r.textWidth(label))/2, start+size+4)
			_ = r.pdf.Text(label)
		}
		r.pdf.SetTextColor(0, 0, 0)
		r.y = start + rowHeight + 8
		index += count
	}
	if block.Caption != "" {
		r.centeredText(block.Caption, 9.5, 14)
	}
	return true
}

func encodeBarcode(format, value string) (barcode.Barcode, error) {
	switch strings.ToUpper(strings.TrimSpace(format)) {
	case "", "CODE128":
		return code128.Encode(value)
	case "EAN13", "EAN8", "UPC":
		return ean.Encode(value)
	case "CODE39":
		return code39.Encode(value, false, false)
	case "ITF14":
		return twooffive.Encode(value, true)
	default:
		return nil, fmt.Errorf("unsupported barcode format: %s", format)
	}
}

func (r *pdfRenderer) barcodeImage(block model.Block) bool {
	value := strings.TrimSpace(block.Text)
	if value == "" {
		return false
	}
	code, err := encodeBarcode(block.Language, value)
	if err != nil {
		return false
	}
	scaled, err := barcode.Scale(code, 600, 120)
	if err != nil {
		return false
	}
	width := math.Min(r.width, 360)
	height := width * float64(scaled.Bounds().Dy()) / float64(scaled.Bounds().Dx())
	if height > 80 {
		height = 80
		width = height * float64(scaled.Bounds().Dx()) / float64(scaled.Bounds().Dy())
	}
	rgba := image.NewRGBA(image.Rect(0, 0, scaled.Bounds().Dx(), scaled.Bounds().Dy()))
	draw.Draw(rgba, rgba.Bounds(), scaled, scaled.Bounds().Min, draw.Src)
	var buf bytes.Buffer
	if err := png.Encode(&buf, rgba); err != nil {
		return false
	}
	holder, err := gopdf.ImageHolderByBytes(buf.Bytes())
	if err != nil {
		return false
	}
	r.ensure(height + 30)
	start := r.y
	if err := r.pdf.ImageByHolder(holder, r.x+(r.width-width)/2, start, &gopdf.Rect{W: width, H: height}); err != nil {
		return false
	}
	r.y = start + height + 8
	r.centeredText(value, 8, 12)
	if block.Caption != "" {
		r.centeredText(block.Caption, 9.5, 14)
	}
	r.y += 6
	return true
}

func headingEntries(blocks []model.Block) []outlineEntry {
	entries := make([]outlineEntry, 0)
	for _, block := range blocks {
		switch block.Type {
		case "heading1", "heading2", "heading3", "toggleHeading1", "toggleHeading2", "toggleHeading3":
			title := strings.TrimSpace(block.Text)
			if title != "" {
				entries = append(entries, outlineEntry{Level: headingLevel(block), Title: title})
			}
		}
	}
	return entries
}

func (r *pdfRenderer) jsonVisual(block model.Block) {
	var formatted bytes.Buffer
	if err := json.Indent(&formatted, []byte(block.Text), "", "  "); err == nil && formatted.Len() > 0 {
		r.code(formatted.String())
		return
	}
	r.code(block.Text)
}

func (r *pdfRenderer) tocBlock(block model.Block) bool {
	if len(r.headings) == 0 {
		return false
	}
	r.ensure(34)
	title := strings.TrimSpace(block.Text)
	if title == "" {
		title = "Contents"
	}
	r.setFont(12)
	r.pdf.SetTextColor(35, 35, 45)
	r.pdf.SetXY(r.x, r.y)
	_ = r.pdf.Text(title)
	r.y += 22
	for _, entry := range r.headings {
		r.ensure(15)
		r.setFont(9.5)
		r.pdf.SetTextColor(55, 55, 65)
		indent := float64(max(0, entry.Level-1)) * 14
		r.pdf.SetXY(r.x+indent, r.y)
		_ = r.pdf.Text(entry.Title)
		r.y += 15
	}
	r.y += 6
	r.pdf.SetTextColor(0, 0, 0)
	return true
}

func (r *pdfRenderer) block(block model.Block) {
	switch block.Type {
	case "heading1", "toggleHeading1":
		r.richHeading(block, 21)
	case "heading2", "toggleHeading2":
		r.richHeading(block, 16.5)
	case "heading3", "toggleHeading3":
		r.richHeading(block, 13.5)
	case "bulleted":
		mark := "• "
		r.richBlock(block, mark, pdfBodySize, pdfLineHeight, float64(block.Indent)*12, false)
	case "numbered":
		mark := r.numbered[block.ID]
		if mark == "" {
			mark = "1."
		}
		r.richBlock(block, mark+" ", pdfBodySize, pdfLineHeight, float64(block.Indent)*12, false)
	case "todo":
		mark := "[ ]"
		if block.Checked {
			mark = "[x]"
		}
		r.richBlock(block, mark+" ", pdfBodySize, pdfLineHeight, float64(block.Indent)*12, false)
	case "checkbox", "switch":
		mark := "[ ]"
		if block.Checked {
			mark = "[x]"
		}
		r.richBlock(block, mark+" ", pdfBodySize, pdfLineHeight, float64(block.Indent)*12, false)
	case "radio":
		mark := "○"
		if block.Checked {
			mark = "◉"
		}
		r.richBlock(block, mark+" ", pdfBodySize, pdfLineHeight, float64(block.Indent)*12, false)
	case "radioGroup":
		r.richBlock(block, "", 12, 18, 4, false)
		if block.Input != nil {
			for _, option := range block.Input.Options {
				mark := "○"
				if block.Input.Value == option {
					mark = "◉"
				}
				r.text(mark+" "+option, 10, 15, 12)
			}
		}
	case "quote":
		start := r.y
		r.richBlock(block, "", 10.5, 17, 16, false)
		r.pdf.SetFillColor(205, 205, 215)
		r.pdf.RectFromUpperLeftWithStyle(r.x+3, start+1, 2, math.Max(16, r.y-start-5), "F")
	case "callout":
		r.callout(block)
	case "code", "curl":
		r.code(block.Text)
	case "divider":
		r.ensure(16)
		r.y += 6
		r.pdf.SetStrokeColor(210, 210, 218)
		r.pdf.SetLineWidth(0.6)
		r.pdf.Line(r.x, r.y, r.x+r.width, r.y)
		r.y += 12
	case "image":
		if !r.image(block) {
			r.text("[Image] "+strings.TrimSpace(block.Caption+" "+block.URL), 9.5, 15, 10)
		}
	case "table", "columns":
		if block.Table != nil {
			r.table(block)
		}
	case "database":
		r.database(block)
	case "chart":
		if !r.chart(block) && block.Table != nil {
			r.table(block)
		}
	case "gantt":
		if !r.gantt(block) && block.Table != nil {
			r.table(block)
		}
	case "calendar":
		if !r.calendar(block) && block.Table != nil {
			r.table(block)
		}
	case "layout":
		if block.Layout != nil && !r.layoutColumns(block) {
			for index, column := range block.Layout.Columns {
				if index > 0 {
					r.y += 6
					r.text("────────", 9, 15, 0)
				}
				for _, child := range column.Blocks {
					r.block(child)
				}
			}
		}
	case "diagram":
		if !r.diagram(block) {
			r.code(block.Text)
		}
	case "equation":
		if !r.embedAsset(block, 240) {
			r.code(block.Text)
		}
	case "jsonVisual":
		r.jsonVisual(block)
	case "toc":
		if !r.tocBlock(block) {
			r.richBlock(block, "", pdfBodySize, pdfLineHeight, 0, false)
		}
	case "pageLink", "bookmark", "video", "embed", "file", "pdf", "blockRef", "blockSync":
		if !r.linkCard(block) {
			r.text(strings.TrimSpace(block.Text+"  "+block.URL), 10.5, 16, 6)
		}
	case "password":
		r.text("[Locked] "+block.Text, 10.5, 16, 6)
	case "toggle":
		r.richBlock(block, "> ", pdfBodySize, pdfLineHeight, 4, false)
	case "breadcrumb":
		r.richBlock(block, "", 9, 14, 2, false)
	case "form":
		if !r.formBlock(block) {
			r.richBlock(block, "", pdfBodySize, pdfLineHeight, 0, false)
		}
	case "poll":
		if !r.poll(block) {
			r.richBlock(block, "", pdfBodySize, pdfLineHeight, 0, false)
		}
	case "map":
		if !r.mapBlock(block) {
			r.richBlock(block, "", pdfBodySize, pdfLineHeight, 0, false)
		}
	case "qrcode":
		if !r.qrCode(block) && block.Text != "" {
			r.text("[qrcode] "+block.Text, 9.5, 15, 6)
		}
	case "barcode":
		if !r.barcodeImage(block) && block.Text != "" {
			r.text("[barcode] "+block.Text, 9.5, 15, 6)
		}
	default:
		r.richBlock(block, "", pdfBodySize, pdfLineHeight, float64(block.Indent)*12, false)
	}
	r.y += 4
}

func (r *pdfRenderer) richHeading(block model.Block, size float64) {
	lineHeight := size * 1.35
	if size >= 20 {
		r.y += 12
	} else if size >= 15 {
		r.y += 9
	} else {
		r.y += 7
	}
	r.ensure(lineHeight + 42)
	level := headingLevel(block)
	title := strings.TrimSpace(block.Text)
	if r.collectEntries && title != "" {
		r.entries = append(r.entries, outlineEntry{
			Level: level,
			Title: title,
			Page:  r.pdf.GetNumberOfPages(),
			Y:     r.y,
		})
	}
	if r.bookmarks && title != "" {
		r.pdf.AddOutlineWithPosition(strings.Repeat("  ", max(0, level-1)) + title)
	}
	r.richBlock(block, "", size, lineHeight, 0, true)
	r.y += 3
}

func headingLevel(block model.Block) int {
	switch block.Type {
	case "heading1", "toggleHeading1":
		return 1
	case "heading2", "toggleHeading2":
		return 2
	case "heading3", "toggleHeading3":
		return 3
	default:
		return 1
	}
}

func (r *pdfRenderer) drawRun(run richtext.Run, family, text string, x, y, lineHeight, size float64, bold bool) {
	if text == "" {
		return
	}
	r.setFontFamily(family, size)
	width := r.textWidth(text)
	isBold := bold || run.Bold
	if run.Code {
		r.pdf.SetFillColor(244, 244, 247)
		r.pdf.RectFromUpperLeftWithStyle(x-1, y, width+2, lineHeight-2, "F")
	}
	if run.URL != "" {
		r.pdf.SetTextColor(45, 95, 190)
	} else {
		r.pdf.SetTextColor(28, 28, 34)
	}
	r.pdf.SetXY(x, y)
	_ = r.pdf.Text(text)
	if isBold {
		r.pdf.SetXY(x+0.22, y)
		_ = r.pdf.Text(text)
	}
	if run.URL != "" {
		r.pdf.AddExternalLink(run.URL, x, y, width, lineHeight)
	}
	if run.Underline {
		r.pdf.SetStrokeColor(45, 95, 190)
		r.pdf.SetLineWidth(0.5)
		r.pdf.Line(x, y+lineHeight-2, x+width, y+lineHeight-2)
	}
	if run.Strike {
		r.pdf.SetStrokeColor(120, 120, 130)
		r.pdf.SetLineWidth(0.5)
		r.pdf.Line(x, y+lineHeight/2, x+width, y+lineHeight/2)
	}
	r.pdf.SetTextColor(0, 0, 0)
}

func (r *pdfRenderer) richBlock(block model.Block, prefix string, size, lineHeight, indent float64, bold bool) {
	runs := richtext.Runs(block.Rich, block.Text)
	startX := r.x + indent
	hangX := startX
	r.ensure(lineHeight)
	if prefix != "" {
		r.setFont(size)
		r.pdf.SetTextColor(120, 120, 130)
		r.pdf.SetXY(startX, r.y)
		_ = r.pdf.Text(prefix)
		r.pdf.SetTextColor(0, 0, 0)
		hangX += r.textWidth(prefix)
	}
	x := hangX
	right := r.x + r.width
	for _, run := range runs {
		fontSize := size
		if run.Code {
			fontSize = math.Max(8, size-0.5)
		}
		family := "noto"
		if run.Code && !containsWideRune(run.Text) {
			family = "mono"
		} else if run.Italic && !containsWideRune(run.Text) {
			family = "italic"
		}
		r.setFontFamily(family, fontSize)
		for _, token := range tokenizeForWrap(run.Text) {
			if token == "\n" {
				r.y += lineHeight
				r.ensure(lineHeight)
				x = hangX
				continue
			}
			if token == "" {
				continue
			}
			if strings.TrimSpace(token) == "" && x <= hangX {
				continue
			}
			width := r.textWidth(token)
			if x > hangX && x+width > right {
				r.y += lineHeight
				r.ensure(lineHeight)
				x = hangX
				if strings.TrimSpace(token) == "" {
					continue
				}
			}
			if width > right-hangX {
				chunks := r.splitLongToken(token, right-hangX)
				for index, chunk := range chunks {
					if index > 0 {
						r.y += lineHeight
						r.ensure(lineHeight)
						x = hangX
					}
					chunkWidth := r.textWidth(chunk)
					r.drawRun(run, family, chunk, x, r.y, lineHeight, fontSize, bold)
					x += chunkWidth
				}
				continue
			}
			r.drawRun(run, family, token, x, r.y, lineHeight, fontSize, bold)
			x += width
		}
	}
	r.pdf.SetTextColor(0, 0, 0)
	r.y += lineHeight
}

func (r *pdfRenderer) callout(block model.Block) {
	lines := r.wrapLines(block.Text, 10.5, r.width-26)
	height := float64(len(lines))*17 + 16
	r.ensure(height + 8)
	start := r.y
	r.pdf.SetFillColor(253, 248, 225)
	r.pdf.RectFromUpperLeftWithStyle(r.x, start, r.width, height, "F")
	r.pdf.SetFillColor(214, 170, 65)
	r.pdf.RectFromUpperLeftWithStyle(r.x, start, 3, height, "F")
	r.setFont(10.5)
	r.pdf.SetTextColor(75, 62, 28)
	for _, line := range lines {
		r.pdf.SetXY(r.x+12, r.y+8)
		_ = r.pdf.Text(line)
		r.y += 17
	}
	r.pdf.SetTextColor(0, 0, 0)
	r.y = start + height + 8
}

type codeLine struct {
	text   string
	family string
}

func (r *pdfRenderer) code(text string) {
	lines := r.codeLines(text)
	if len(lines) == 0 {
		return
	}
	lineHeight := 12.0
	usable := r.bottom - r.top
	maxLines := int((usable - 16) / lineHeight)
	if maxLines < 1 {
		maxLines = 1
	}
	for len(lines) > 0 {
		count := min(len(lines), maxLines)
		height := float64(count)*lineHeight + 14
		r.ensure(height + 8)
		start := r.y
		r.pdf.SetFillColor(246, 246, 249)
		r.pdf.RectFromUpperLeftWithStyle(r.x, start, r.width, height, "F")
		r.pdf.SetTextColor(45, 45, 55)
		y := start + 7
		for _, line := range lines[:count] {
			r.setFontFamily(line.family, 8.5)
			r.pdf.SetXY(r.x+8, y)
			_ = r.pdf.Text(line.text)
			y += lineHeight
		}
		r.pdf.SetTextColor(0, 0, 0)
		r.y = start + height + 8
		lines = lines[count:]
	}
}

func (r *pdfRenderer) codeLines(text string) []codeLine {
	rawLines := strings.Split(strings.ReplaceAll(text, "\t", "    "), "\n")
	lines := make([]codeLine, 0, len(rawLines))
	for _, raw := range rawLines {
		family := "mono"
		if containsWideRune(raw) {
			family = "noto"
		}
		wrapped := r.wrapLinesFont(raw, 8.5, r.width-16, family)
		if len(wrapped) == 0 {
			wrapped = []string{""}
		}
		for _, line := range wrapped {
			lines = append(lines, codeLine{text: line, family: family})
		}
	}
	return lines
}

func containsWideRune(text string) bool {
	for _, char := range text {
		if char > unicode.MaxASCII {
			return true
		}
	}
	return false
}

func (r *pdfRenderer) table(block model.Block) {
	table := block.Table
	columns := len(table.Columns)
	if columns == 0 {
		return
	}
	widths := tableWidths(table, r.width)
	header := append([]string(nil), table.Columns...)
	bodyRows := make([][]string, 0, len(table.Rows))
	for rowIndex := range table.Rows {
		row := make([]string, columns)
		for columnIndex := range table.Columns {
			row[columnIndex] = table.DisplayCell(rowIndex, columnIndex)
		}
		bodyRows = append(bodyRows, row)
	}
	hasHeader := table.Header
	var drawRow func([]string, bool)
	drawRow = func(row []string, headerRow bool) {
		lines := make([][]string, columns)
		rowLines := 1
		for index := 0; index < columns; index++ {
			cell := ""
			if index < len(row) {
				cell = row[index]
			}
			lines[index] = r.wrapLines(cell, 9, widths[index]-8)
			rowLines = max(rowLines, len(lines[index]))
		}
		height := float64(rowLines)*11.5 + 8
		if r.y+height > r.bottom {
			r.newPage()
			if hasHeader && !headerRow {
				drawRow(header, true)
			}
		}
		start := r.y
		if headerRow {
			r.pdf.SetFillColor(244, 244, 248)
			r.pdf.RectFromUpperLeftWithStyle(r.x, start, r.width, height, "F")
		}
		r.pdf.SetStrokeColor(228, 228, 234)
		r.pdf.SetLineWidth(0.5)
		x := r.x
		for index := 0; index < columns; index++ {
			if index > 0 {
				r.pdf.Line(x, start, x, start+height)
			}
			r.setFont(9)
			if headerRow {
				r.pdf.SetTextColor(55, 55, 65)
			} else {
				r.pdf.SetTextColor(40, 40, 48)
			}
			for lineIndex, line := range lines[index] {
				r.pdf.SetXY(x+4, start+4+float64(lineIndex)*11.5)
				_ = r.pdf.Text(line)
				if headerRow {
					r.pdf.SetXY(x+4.22, start+4+float64(lineIndex)*11.5)
					_ = r.pdf.Text(line)
				}
			}
			x += widths[index]
		}
		r.pdf.Line(r.x, start+height, r.x+r.width, start+height)
		r.pdf.SetTextColor(0, 0, 0)
		r.y = start + height
	}
	if hasHeader {
		drawRow(header, true)
	}
	for _, row := range bodyRows {
		drawRow(row, false)
	}
	r.y += 8
}

func tableWidths(table *model.TableData, total float64) []float64 {
	columns := len(table.Columns)
	widths := make([]float64, columns)
	desired := table.Widths
	sum := 0.0
	for index := 0; index < columns; index++ {
		width := 120.0
		if index < len(desired) && desired[index] > 0 {
			width = desired[index]
		}
		widths[index] = width
		sum += width
	}
	if sum <= 0 {
		for index := range widths {
			widths[index] = total / float64(columns)
		}
		return widths
	}
	scale := total / sum
	for index := range widths {
		widths[index] = math.Max(48, widths[index]*scale)
	}
	actual := 0.0
	for _, width := range widths {
		actual += width
	}
	if actual > 0 {
		scale = total / actual
		for index := range widths {
			widths[index] *= scale
		}
	}
	return widths
}

func numberedMarkers(blocks []model.Block) map[string]string {
	markers := make(map[string]string, len(blocks))
	counters := map[int]int{}
	previousType := ""
	previousIndent := -1
	for _, block := range blocks {
		indent := block.Indent
		if indent < 0 {
			indent = 0
		}
		if block.Type == "numbered" {
			switch {
			case previousType == "numbered" && previousIndent == indent:
				counters[indent]++
			case previousType == "numbered" && previousIndent > indent && counters[indent] > 0:
				// Returning from a nested list: the parent list continues.
				counters[indent]++
			default:
				counters[indent] = 1
			}
			if previousIndent > indent {
				for key := range counters {
					if key > indent {
						delete(counters, key)
					}
				}
			}
			markers[block.ID] = numberedLabel(counters[indent], block.Language)
		} else {
			for key := range counters {
				if key > indent {
					delete(counters, key)
				}
			}
		}
		previousType = block.Type
		previousIndent = indent
	}
	return markers
}

func numberedLabel(number int, style string) string {
	switch style {
	case "alpha":
		return string(rune('a'+(number-1)%26)) + "."
	case "roman":
		return roman(number) + "."
	default:
		return fmt.Sprintf("%d.", number)
	}
}

func roman(number int) string {
	values := []struct {
		value  int
		symbol string
	}{
		{1000, "m"}, {900, "cm"}, {500, "d"}, {400, "cd"}, {100, "c"}, {90, "xc"},
		{50, "l"}, {40, "xl"}, {10, "x"}, {9, "ix"}, {5, "v"}, {4, "iv"}, {1, "i"},
	}
	number = max(1, min(3999, number))
	var out strings.Builder
	for _, item := range values {
		for number >= item.value {
			out.WriteString(item.symbol)
			number -= item.value
		}
	}
	return out.String()
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
