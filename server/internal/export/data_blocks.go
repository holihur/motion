package export

import (
	"fmt"
	"image/color"
	"math"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/signintech/gopdf"

	"github.com/motion/server/internal/model"
)

var chartPalette = []string{
	"#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#14b8a6", "#6366f1",
}

func (r *pdfRenderer) database(block model.Block) {
	db := block.Database
	if db == nil || len(db.Columns) == 0 {
		return
	}
	if strings.TrimSpace(block.Text) != "" {
		r.heading(block.Text, 12)
	}
	if strings.EqualFold(db.ViewMode, "board") && db.GroupBy != "" {
		r.databaseBoard(db)
		return
	}
	table := &model.TableData{
		Columns: make([]string, 0, len(db.Columns)),
		Rows:    make([][]string, 0, len(db.Rows)),
		Header:  true,
		Widths:  make([]float64, 0, len(db.Columns)),
	}
	for _, column := range db.Columns {
		table.Columns = append(table.Columns, column.Name)
		table.Widths = append(table.Widths, float64(column.Width))
	}
	for _, row := range db.Rows {
		cells := make([]string, 0, len(db.Columns))
		for _, column := range db.Columns {
			cells = append(cells, row[column.ID])
		}
		table.Rows = append(table.Rows, cells)
	}
	r.table(model.Block{Table: table})
}

func (r *pdfRenderer) databaseBoard(db *model.DatabaseData) {
	groupIndex := -1
	primaryIndex := 0
	for index, column := range db.Columns {
		if column.ID == db.GroupBy || column.Name == db.GroupBy {
			groupIndex = index
			break
		}
	}
	if groupIndex == 0 && len(db.Columns) > 1 {
		primaryIndex = 1
	}
	groups := map[string][]map[string]string{}
	order := make([]string, 0)
	for _, row := range db.Rows {
		key := ""
		if groupIndex >= 0 {
			key = strings.TrimSpace(row[db.Columns[groupIndex].ID])
		}
		if key == "" {
			key = "No value"
		}
		if _, ok := groups[key]; !ok {
			order = append(order, key)
		}
		groups[key] = append(groups[key], row)
	}
	sort.Strings(order)
	for _, group := range order {
		rows := groups[group]
		r.ensure(56)
		r.setFont(10.5)
		r.pdf.SetTextColor(70, 70, 80)
		r.pdf.SetXY(r.x, r.y)
		_ = r.pdf.Text(fmt.Sprintf("%s  (%d)", group, len(rows)))
		r.y += 18
		for _, row := range rows {
			title := strings.TrimSpace(row[db.Columns[primaryIndex].ID])
			if title == "" {
				title = "Untitled"
			}
			details := make([]string, 0, 2)
			for index, column := range db.Columns {
				if index == groupIndex || index == primaryIndex {
					continue
				}
				value := strings.TrimSpace(row[column.ID])
				if value != "" {
					details = append(details, value)
				}
				if len(details) >= 2 {
					break
				}
			}
			r.ensure(40)
			start := r.y
			r.pdf.SetFillColor(248, 248, 251)
			r.pdf.RectFromUpperLeftWithStyle(r.x+8, start, r.width-8, 34, "F")
			r.pdf.SetFillColor(124, 92, 255)
			r.pdf.RectFromUpperLeftWithStyle(r.x+8, start, 2, 34, "F")
			r.setFont(10)
			r.pdf.SetTextColor(35, 35, 45)
			r.pdf.SetXY(r.x+16, start+5)
			_ = r.pdf.Text(r.truncateToWidth(title, r.width-32))
			r.setFont(8.5)
			r.pdf.SetTextColor(120, 120, 130)
			r.pdf.SetXY(r.x+16, start+19)
			_ = r.pdf.Text(r.truncateToWidth(strings.Join(details, " · "), r.width-32))
			r.y = start + 40
		}
		r.y += 4
	}
	r.pdf.SetTextColor(0, 0, 0)
}

type chartSeries struct {
	name   string
	values []float64
}

func chartData(block model.Block) ([]string, []chartSeries, bool) {
	table := block.Table
	if table == nil || len(table.Columns) < 2 || len(table.Rows) == 0 {
		return nil, nil, false
	}
	labels := make([]string, 0, len(table.Rows))
	series := make([]chartSeries, 0, len(table.Columns)-1)
	for index := 1; index < len(table.Columns); index++ {
		series = append(series, chartSeries{name: table.Columns[index], values: make([]float64, 0, len(table.Rows))})
	}
	for _, row := range table.Rows {
		label := ""
		if len(row) > 0 {
			label = row[0]
		}
		labels = append(labels, label)
		for index := 1; index < len(table.Columns); index++ {
			value := 0.0
			if index < len(row) {
				value = parseNumber(row[index])
			}
			series[index-1].values = append(series[index-1].values, value)
		}
	}
	return labels, series, true
}

func parseNumber(value string) float64 {
	value = strings.ReplaceAll(strings.TrimSpace(value), ",", "")
	number := 0.0
	_, err := fmt.Sscanf(value, "%f", &number)
	if err != nil {
		return 0
	}
	return number
}

func niceMax(value float64) float64 {
	if value <= 0 {
		return 1
	}
	power := math.Pow(10, math.Floor(math.Log10(value)))
	normalized := value / power
	step := 10.0
	switch {
	case normalized <= 1:
		step = 1
	case normalized <= 2:
		step = 2
	case normalized <= 5:
		step = 5
	}
	return step * power
}

func (r *pdfRenderer) chart(block model.Block) bool {
	labels, series, ok := chartData(block)
	if !ok || len(series) == 0 {
		return false
	}
	kind := "bar"
	if block.Language == "line" || block.Language == "pie" {
		kind = block.Language
	}
	chartHeight := 210.0
	titleHeight := 0.0
	if strings.TrimSpace(block.Text) != "" {
		titleHeight = 20
	}
	r.ensure(chartHeight + titleHeight + 34)
	if titleHeight > 0 {
		r.setFont(10.5)
		r.pdf.SetTextColor(35, 35, 45)
		r.pdf.SetXY(r.x, r.y)
		_ = r.pdf.Text(block.Text)
		r.y += titleHeight
	}
	start := r.y
	left := 42.0
	right := 12.0
	top := 8.0
	bottom := 38.0
	plotWidth := r.width - left - right
	plotHeight := chartHeight - top - bottom
	baseline := start + top + plotHeight
	maxValue := 1.0
	for _, item := range series {
		for _, value := range item.values {
			if value > maxValue {
				maxValue = value
			}
		}
	}
	maxValue = niceMax(maxValue)
	switch kind {
	case "pie":
		r.drawPie(start, labels, series)
	case "line":
		r.drawLineChart(start, left, top, plotWidth, plotHeight, maxValue, labels, series)
	default:
		r.drawBarChart(start, left, top, plotWidth, plotHeight, baseline, maxValue, labels, series)
	}
	r.y = start + chartHeight + 8
	r.drawChartLegend(start+chartHeight-4, series)
	r.y += 12
	r.pdf.SetTextColor(0, 0, 0)
	return true
}

func (r *pdfRenderer) drawGrid(start, left, top, plotWidth, plotHeight, maxValue float64) {
	r.pdf.SetStrokeColor(225, 225, 232)
	r.pdf.SetLineWidth(0.5)
	for step := 0; step <= 4; step++ {
		ratio := float64(step) / 4
		y := start + top + plotHeight*(1-ratio)
		r.pdf.Line(r.x+left, y, r.x+left+plotWidth, y)
		r.setFont(7.5)
		r.pdf.SetTextColor(140, 140, 150)
		label := fmt.Sprintf("%d", int(math.Round(maxValue*ratio)))
		r.pdf.SetXY(r.x+left-r.textWidth(label)-4, y-3)
		_ = r.pdf.Text(label)
	}
	r.pdf.SetTextColor(0, 0, 0)
}

func (r *pdfRenderer) drawBarChart(start, left, top, plotWidth, plotHeight, baseline, maxValue float64, labels []string, series []chartSeries) {
	r.drawGrid(start, left, top, plotWidth, plotHeight, maxValue)
	group := plotWidth / float64(len(labels))
	barWidth := group * 0.7 / float64(len(series))
	for seriesIndex, item := range series {
		r.pdf.SetFillColor(colorRGB(chartPalette[seriesIndex%len(chartPalette)]))
		for index, value := range item.values {
			if index >= len(labels) {
				break
			}
			height := math.Max(0, value/maxValue*plotHeight)
			x := r.x + left + group*float64(index) + group*0.15 + barWidth*float64(seriesIndex)
			r.pdf.RectFromUpperLeftWithStyle(x, baseline-height, math.Max(1, barWidth-2), height, "F")
		}
	}
	r.drawCategoryLabels(start, left, top, plotWidth, plotHeight, labels)
}

func (r *pdfRenderer) drawLineChart(start, left, top, plotWidth, plotHeight, maxValue float64, labels []string, series []chartSeries) {
	r.drawGrid(start, left, top, plotWidth, plotHeight, maxValue)
	group := plotWidth / float64(len(labels))
	for seriesIndex, item := range series {
		r.pdf.SetStrokeColor(colorRGB(chartPalette[seriesIndex%len(chartPalette)]))
		r.pdf.SetFillColor(colorRGB(chartPalette[seriesIndex%len(chartPalette)]))
		r.pdf.SetLineWidth(1.8)
		var previousX, previousY float64
		for index, value := range item.values {
			if index >= len(labels) {
				break
			}
			x := r.x + left + group*float64(index) + group/2
			y := start + top + plotHeight - math.Max(0, value)/maxValue*plotHeight
			if index > 0 {
				r.pdf.Line(previousX, previousY, x, y)
			}
			r.pdf.Oval(x-1.6, y-1.6, x+1.6, y+1.6)
			previousX, previousY = x, y
		}
	}
	r.drawCategoryLabels(start, left, top, plotWidth, plotHeight, labels)
}

func (r *pdfRenderer) drawCategoryLabels(start, left, top, plotWidth, plotHeight float64, labels []string) {
	if len(labels) == 0 {
		return
	}
	group := plotWidth / float64(len(labels))
	r.setFont(7.5)
	r.pdf.SetTextColor(130, 130, 140)
	for index, label := range labels {
		if index > 24 {
			break
		}
		text := label
		if len([]rune(text)) > 10 {
			text = string([]rune(text)[:9]) + "…"
		}
		x := r.x + left + group*float64(index) + group/2 - r.textWidth(text)/2
		r.pdf.SetXY(x, start+top+plotHeight+10)
		_ = r.pdf.Text(text)
	}
	r.pdf.SetTextColor(0, 0, 0)
}

func (r *pdfRenderer) drawPie(start float64, labels []string, series []chartSeries) {
	values := series[0].values
	total := 0.0
	for _, value := range values {
		total += math.Max(0, value)
	}
	if total <= 0 {
		r.drawBarChart(start, 42, 8, r.width-54, 164, start+172, niceMax(1), labels, series)
		return
	}
	centerX := r.x + r.width/2
	centerY := start + 105
	radius := 78.0
	angle := -math.Pi / 2
	for index, value := range values {
		if index >= len(labels) {
			break
		}
		slice := math.Max(0, value) / total * math.Pi * 2
		points := []gopdf.Point{{X: centerX, Y: centerY}}
		steps := max(2, int(slice/(math.Pi/24)))
		for step := 0; step <= steps; step++ {
			pointAngle := angle + slice*float64(step)/float64(steps)
			points = append(points, gopdf.Point{X: centerX + radius*math.Cos(pointAngle), Y: centerY + radius*math.Sin(pointAngle)})
		}
		r.pdf.SetFillColor(colorRGB(chartPalette[index%len(chartPalette)]))
		r.pdf.Polygon(points, "F")
		angle += slice
	}
	r.pdf.SetFillColor(255, 255, 255)
	r.pdf.Oval(centerX-32, centerY-32, centerX+32, centerY+32)
	r.setFont(9)
	r.pdf.SetTextColor(40, 40, 50)
	text := fmt.Sprintf("%d", int(math.Round(total)))
	r.pdf.SetXY(centerX-r.textWidth(text)/2, centerY-4)
	_ = r.pdf.Text(text)
	r.pdf.SetTextColor(0, 0, 0)
}

func (r *pdfRenderer) drawChartLegend(start float64, series []chartSeries) {
	r.setFont(8)
	x := r.x
	for index, item := range series {
		color := chartPalette[index%len(chartPalette)]
		r.pdf.SetFillColor(colorRGB(color))
		r.pdf.RectFromUpperLeftWithStyle(x, start, 7, 7, "F")
		r.pdf.SetTextColor(110, 110, 120)
		r.pdf.SetXY(x+10, start-2)
		_ = r.pdf.Text(item.name)
		x += 14 + r.textWidth(item.name)
	}
	r.pdf.SetTextColor(0, 0, 0)
}

type ganttTask struct {
	name     string
	start    time.Time
	end      time.Time
	progress float64
}

func parseDate(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	for _, layout := range []string{"2006-01-02", "2006/01/02", "2006-1-2"} {
		if date, err := time.Parse(layout, value); err == nil {
			return date, true
		}
	}
	return time.Time{}, false
}

func (r *pdfRenderer) gantt(block model.Block) bool {
	table := block.Table
	if table == nil || len(table.Columns) < 3 || len(table.Rows) == 0 {
		return false
	}
	tasks := make([]ganttTask, 0, len(table.Rows))
	minDate, maxDate := time.Time{}, time.Time{}
	for _, row := range table.Rows {
		if len(row) < 3 {
			continue
		}
		start, ok := parseDate(row[1])
		if !ok {
			continue
		}
		end, ok := parseDate(row[2])
		if !ok {
			end = start
		}
		if end.Before(start) {
			end = start
		}
		progress := parseNumber(row[3])
		if progress < 0 {
			progress = 0
		}
		if progress > 100 {
			progress = 100
		}
		if minDate.IsZero() || start.Before(minDate) {
			minDate = start
		}
		if maxDate.IsZero() || end.After(maxDate) {
			maxDate = end
		}
		tasks = append(tasks, ganttTask{name: row[0], start: start, end: end, progress: progress})
	}
	if len(tasks) == 0 {
		return false
	}
	if maxDate.Equal(minDate) {
		maxDate = maxDate.AddDate(0, 0, 1)
	}
	titleHeight := 0.0
	if strings.TrimSpace(block.Text) != "" {
		titleHeight = 18
	}
	r.ensure(titleHeight + 48)
	if titleHeight > 0 {
		r.setFont(10.5)
		r.pdf.SetTextColor(35, 35, 45)
		r.pdf.SetXY(r.x, r.y)
		_ = r.pdf.Text(block.Text)
		r.y += titleHeight
	}
	labelWidth := math.Min(140, r.width*0.3)
	timelineWidth := r.width - labelWidth - 12
	days := max(1, int(maxDate.Sub(minDate).Hours()/24)+1)
	r.setFont(7.5)
	r.pdf.SetTextColor(130, 130, 140)
	r.pdf.SetXY(r.x, r.y)
	_ = r.pdf.Text(minDate.Format("Jan 2"))
	endLabel := maxDate.Format("Jan 2")
	r.pdf.SetXY(r.x+r.width-r.textWidth(endLabel), r.y)
	_ = r.pdf.Text(endLabel)
	r.y += 14
	for _, task := range tasks {
		if r.y+20 > r.bottom {
			r.newPage()
			r.y += 14
		}
		start := r.y
		r.setFont(8.5)
		r.pdf.SetTextColor(55, 55, 65)
		r.pdf.SetXY(r.x, start+5)
		_ = r.pdf.Text(r.truncateToWidth(task.name, labelWidth-6))
		offset := task.start.Sub(minDate).Hours() / 24 / float64(days)
		duration := (task.end.Sub(task.start).Hours()/24 + 1) / float64(days)
		x := r.x + labelWidth + offset*timelineWidth
		width := math.Max(5, duration*timelineWidth)
		r.pdf.SetFillColor(239, 237, 248)
		r.pdf.RectFromUpperLeftWithStyle(r.x+labelWidth, start+2, timelineWidth, 14, "F")
		r.pdf.SetFillColor(colorRGB(chartPalette[3]))
		r.pdf.RectFromUpperLeftWithStyle(x, start+2, width, 14, "F")
		if task.progress > 0 {
			r.pdf.SetFillColor(colorRGB(chartPalette[1]))
			r.pdf.RectFromUpperLeftWithStyle(x, start+2, width*task.progress/100, 14, "F")
		}
		r.y = start + 20
	}
	r.y += 8
	r.pdf.SetTextColor(0, 0, 0)
	return true
}

type calendarEvent struct {
	title string
	start time.Time
	end   time.Time
	color string
}

func (r *pdfRenderer) calendar(block model.Block) bool {
	table := block.Table
	if table == nil || len(table.Rows) == 0 {
		return false
	}
	events := make([]calendarEvent, 0, len(table.Rows))
	for _, row := range table.Rows {
		if len(row) < 2 {
			continue
		}
		start, ok := parseDate(row[1])
		if !ok {
			continue
		}
		end, ok := parseDate(row[2])
		if !ok || end.Before(start) {
			end = start
		}
		events = append(events, calendarEvent{title: row[0], start: start, end: end, color: row[3]})
	}
	if len(events) == 0 {
		return false
	}
	if block.Language == "list" {
		r.calendarList(events)
		return true
	}
	month := time.Date(events[0].start.Year(), events[0].start.Month(), 1, 0, 0, 0, 0, time.Local)
	r.ensure(270)
	r.setFont(11)
	r.pdf.SetTextColor(35, 35, 45)
	r.pdf.SetXY(r.x, r.y)
	_ = r.pdf.Text(month.Format("January 2006"))
	r.y += 22
	cellWidth := r.width / 7
	cellHeight := 34.0
	weekdays := []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
	r.setFont(7.5)
	r.pdf.SetTextColor(130, 130, 140)
	for index, day := range weekdays {
		r.pdf.SetXY(r.x+cellWidth*float64(index)+2, r.y)
		_ = r.pdf.Text(day)
	}
	r.y += 12
	start := month
	for start.Weekday() != time.Monday {
		start = start.AddDate(0, 0, -1)
	}
	for week := 0; week < 6; week++ {
		for day := 0; day < 7; day++ {
			date := start.AddDate(0, 0, week*7+day)
			x := r.x + cellWidth*float64(day)
			y := r.y + cellHeight*float64(week)
			r.pdf.SetStrokeColor(230, 230, 236)
			r.pdf.SetLineWidth(0.4)
			r.pdf.Line(x, y, x, y+cellHeight)
			r.pdf.Line(x, y+cellHeight, x+cellWidth, y+cellHeight)
			r.setFont(7.5)
			if date.Month() == month.Month() {
				r.pdf.SetTextColor(60, 60, 70)
			} else {
				r.pdf.SetTextColor(175, 175, 185)
			}
			r.pdf.SetXY(x+3, y+3)
			_ = r.pdf.Text(fmt.Sprintf("%d", date.Day()))
			row := 0
			for _, event := range events {
				if row >= 2 || date.Before(event.start) || date.After(event.end) {
					continue
				}
				r.pdf.SetFillColor(colorRGB(eventColor(event.color)))
				r.pdf.RectFromUpperLeftWithStyle(x+2, y+13+float64(row)*8, cellWidth-4, 6, "F")
				r.setFont(5.5)
				r.pdf.SetTextColor(255, 255, 255)
				r.pdf.SetXY(x+3, y+13.5+float64(row)*8)
				_ = r.pdf.Text(r.truncateToWidth(event.title, cellWidth-6))
				row++
			}
		}
	}
	r.y += cellHeight*6 + 10
	r.pdf.SetTextColor(0, 0, 0)
	return true
}

func (r *pdfRenderer) calendarList(events []calendarEvent) {
	for _, event := range events {
		r.ensure(30)
		r.setFont(9)
		r.pdf.SetTextColor(35, 35, 45)
		r.pdf.SetXY(r.x, r.y)
		_ = r.pdf.Text(event.start.Format("Jan 2"))
		r.pdf.SetXY(r.x+56, r.y)
		_ = r.pdf.Text(r.truncateToWidth(event.title, r.width-56))
		r.y += 16
	}
	r.y += 6
}

func eventColor(value string) string {
	switch value {
	case "violet":
		return chartPalette[1]
	case "emerald":
		return chartPalette[3]
	case "amber":
		return chartPalette[2]
	case "rose":
		return chartPalette[4]
	case "slate":
		return "#64748b"
	default:
		return chartPalette[0]
	}
}

func (r *pdfRenderer) formBlock(block model.Block) bool {
	form := block.Form
	if form == nil {
		return false
	}
	r.ensure(50)
	if title := strings.TrimSpace(form.Title); title != "" {
		r.setFont(13)
		r.pdf.SetTextColor(35, 35, 45)
		r.pdf.SetXY(r.x, r.y)
		_ = r.pdf.Text(title)
		r.y += 20
	}
	if description := strings.TrimSpace(form.Description); description != "" {
		for _, line := range r.wrapLines(description, 9.5, r.width) {
			r.ensure(15)
			r.setFont(9.5)
			r.pdf.SetTextColor(110, 110, 120)
			r.pdf.SetXY(r.x, r.y)
			_ = r.pdf.Text(line)
			r.y += 15
		}
		r.y += 4
	}
	for _, field := range form.Fields {
		label := field.Label
		if field.Required {
			label += " *"
		}
		r.ensure(24)
		r.setFont(9.5)
		r.pdf.SetTextColor(55, 55, 65)
		r.pdf.SetXY(r.x, r.y)
		_ = r.pdf.Text(label)
		r.y += 14
		switch field.Type {
		case "textarea":
			r.pdf.SetFillColor(248, 248, 251)
			r.pdf.RectFromUpperLeftWithStyle(r.x, r.y, r.width*0.72, 30, "F")
			r.y += 34
		case "checkbox":
			r.pdf.SetXY(r.x+6, r.y-14)
			_ = r.pdf.Text("[ ]")
		case "select":
			for _, option := range field.Options {
				r.ensure(14)
				r.setFont(8.5)
				r.pdf.SetTextColor(90, 90, 100)
				r.pdf.SetXY(r.x+10, r.y)
				_ = r.pdf.Text("○ " + option)
				r.y += 13
			}
		default:
			r.pdf.SetFillColor(248, 248, 251)
			r.pdf.RectFromUpperLeftWithStyle(r.x, r.y, r.width*0.72, 18, "F")
			r.y += 22
		}
		r.y += 3
	}
	r.y += 6
	r.pdf.SetTextColor(0, 0, 0)
	return true
}

func (r *pdfRenderer) layoutColumns(block model.Block) bool {
	columns := block.Layout.Columns
	if len(columns) < 2 {
		return false
	}
	count := min(4, len(columns))
	gap := 12.0
	columnWidth := (r.width - gap*float64(count-1)) / float64(count)
	heights := make([]float64, 0, count)
	maxHeight := 0.0
	for index := 0; index < count; index++ {
		height, ok := r.measureColumn(columns[index].Blocks, columnWidth)
		if !ok {
			return false
		}
		heights = append(heights, height)
		if height > maxHeight {
			maxHeight = height
		}
	}
	if r.y+maxHeight > r.bottom {
		return false
	}
	x := r.x
	maxY := r.y
	for index := 0; index < count; index++ {
		child := *r
		child.x = x
		child.width = columnWidth
		child.top = r.y
		child.bottom = r.bottom
		child.y = r.y
		child.coverPages = 0
		child.tocPages = 0
		child.bookmarks = false
		child.collectEntries = false
		child.entries = nil
		for _, item := range columns[index].Blocks {
			child.block(item)
		}
		if child.y > maxY {
			maxY = child.y
		}
		x += columnWidth + gap
	}
	r.y = maxY + 8
	return true
}

func (r *pdfRenderer) measureColumn(blocks []model.Block, columnWidth float64) (float64, bool) {
	temp, err := newPDFRenderer(model.Page{}, r.options, r.diagrams)
	if err != nil {
		return 0, false
	}
	temp.width = columnWidth
	temp.y = temp.top
	temp.numbered = r.numbered
	for _, block := range blocks {
		temp.block(block)
		if temp.pdf.GetNumberOfPages() > 1 {
			return temp.y - temp.top + float64(temp.pdf.GetNumberOfPages()-1)*temp.pageH, false
		}
	}
	return temp.y - temp.top, true
}

func (r *pdfRenderer) poll(block model.Block) bool {
	poll := block.Poll
	if poll == nil || len(poll.Options) == 0 {
		return false
	}
	total := 0
	for _, option := range poll.Options {
		total += len(option.Votes)
	}
	r.ensure(30 + float64(len(poll.Options))*32)
	r.setFont(11)
	r.pdf.SetTextColor(35, 35, 45)
	r.pdf.SetXY(r.x, r.y)
	_ = r.pdf.Text(poll.Question)
	r.y += 20
	barWidth := r.width - 110
	for _, option := range poll.Options {
		count := len(option.Votes)
		percent := 0.0
		if total > 0 {
			percent = float64(count) / float64(total)
		}
		r.pdf.SetFillColor(239, 237, 248)
		r.pdf.RectFromUpperLeftWithStyle(r.x, r.y+3, barWidth, 12, "F")
		r.pdf.SetFillColor(colorRGB(chartPalette[1]))
		r.pdf.RectFromUpperLeftWithStyle(r.x, r.y+3, barWidth*percent, 12, "F")
		r.setFont(9)
		r.pdf.SetTextColor(45, 45, 55)
		r.pdf.SetXY(r.x+5, r.y+5)
		_ = r.pdf.Text(r.truncateToWidth(option.Text, barWidth-10))
		r.pdf.SetXY(r.x+barWidth+8, r.y+5)
		_ = r.pdf.Text(fmt.Sprintf("%d · %d%%", count, int(math.Round(percent*100))))
		r.y += 24
	}
	if poll.Closed {
		r.setFont(8)
		r.pdf.SetTextColor(130, 130, 140)
		r.pdf.SetXY(r.x, r.y)
		_ = r.pdf.Text("Poll closed")
		r.y += 14
	}
	r.y += 6
	r.pdf.SetTextColor(0, 0, 0)
	return true
}

func (r *pdfRenderer) mapBlock(block model.Block) bool {
	if block.Map == nil {
		return false
	}
	point := block.Map
	if asset, ok := r.diagrams[block.ID]; ok && len(asset.PNG) > 0 {
		withCaption := block
		if strings.TrimSpace(withCaption.Caption) == "" {
			withCaption.Caption = point.Label
		}
		if r.embedAsset(withCaption, 300) {
			r.centeredText("© OpenStreetMap contributors", 7.5, 10)
			r.y += 6
			return true
		}
	}
	r.ensure(52)
	start := r.y
	r.pdf.SetFillColor(248, 248, 251)
	r.pdf.RectFromUpperLeftWithStyle(r.x, start, r.width, 48, "F")
	r.setFont(10)
	r.pdf.SetTextColor(35, 35, 45)
	r.pdf.SetXY(r.x+10, start+7)
	label := block.Caption
	if label == "" {
		label = point.Label
	}
	if label == "" {
		label = "Map"
	}
	_ = r.pdf.Text(label)
	r.setFont(8.5)
	r.pdf.SetTextColor(120, 120, 130)
	r.pdf.SetXY(r.x+10, start+23)
	_ = r.pdf.Text(fmt.Sprintf("%.5f, %.5f · zoom %d · %s", point.Lat, point.Lng, point.Zoom, point.Provider))
	r.pdf.SetXY(r.x+10, start+35)
	_ = r.pdf.Text(fmt.Sprintf("https://www.openstreetmap.org/?mlat=%.5f&mlon=%.5f", point.Lat, point.Lng))
	r.y = start + 56
	r.pdf.SetTextColor(0, 0, 0)
	return true
}

func (r *pdfRenderer) linkCard(block model.Block) bool {
	link := strings.TrimSpace(block.URL)
	if link == "" {
		return false
	}
	title := strings.TrimSpace(block.Text)
	if title == "" {
		title = link
	}
	domain := link
	if parsed, err := url.Parse(link); err == nil && parsed.Host != "" {
		domain = parsed.Host
	}
	r.ensure(48)
	start := r.y
	r.pdf.SetFillColor(248, 248, 251)
	r.pdf.RectFromUpperLeftWithStyle(r.x, start, r.width, 42, "F")
	r.pdf.SetFillColor(124, 92, 255)
	r.pdf.RectFromUpperLeftWithStyle(r.x, start, 3, 42, "F")
	r.setFont(10)
	r.pdf.SetTextColor(35, 35, 45)
	r.pdf.SetXY(r.x+12, start+6)
	_ = r.pdf.Text(r.truncateToWidth(title, r.width-24))
	r.setFont(8.5)
	r.pdf.SetTextColor(120, 120, 130)
	r.pdf.SetXY(r.x+12, start+21)
	_ = r.pdf.Text(r.truncateToWidth(domain+"  "+link, r.width-24))
	r.y = start + 48
	if caption := strings.TrimSpace(block.Caption); caption != "" {
		r.centeredText(caption, 8.5, 12)
	}
	r.pdf.SetTextColor(0, 0, 0)
	return true
}

func colorRGB(value string) (uint8, uint8, uint8) {
	parsed := parseHexColor(value)
	if rgba, ok := parsed.(color.RGBA); ok {
		return rgba.R, rgba.G, rgba.B
	}
	return 15, 23, 42
}
