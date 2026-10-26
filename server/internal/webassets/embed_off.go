//go:build !embedweb

package webassets

import "io/fs"

func embeddedDir() (fs.FS, bool) { return nil, false }
