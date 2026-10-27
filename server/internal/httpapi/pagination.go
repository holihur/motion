package httpapi

import (
	"net/http"
	"strconv"
)

const (
	defaultPageSize = 50
	maxPageSize     = 100
)

// paginationParams returns a 1-based page and a bounded page size. Keeping the
// server-side bound is important for endpoints such as audit logs and form
// submissions that can grow without an upper limit.
func paginationParams(r *http.Request) (page int64, pageSize int64) {
	page = 1
	pageSize = defaultPageSize
	if value, err := strconv.ParseInt(r.URL.Query().Get("page"), 10, 64); err == nil && value > 0 {
		page = value
	}
	if value, err := strconv.ParseInt(r.URL.Query().Get("pageSize"), 10, 64); err == nil && value > 0 {
		pageSize = value
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize
}

type paginated[T any] struct {
	Items    []T   `json:"items"`
	Page     int64 `json:"page"`
	PageSize int64 `json:"pageSize"`
	Total    int64 `json:"total"`
	HasMore  bool  `json:"hasMore"`
}

func paginate[T any](items []T, page, pageSize, total int64) paginated[T] {
	if items == nil {
		items = []T{}
	}
	return paginated[T]{
		Items: items, Page: page, PageSize: pageSize, Total: total,
		HasMore: page*pageSize < total,
	}
}
