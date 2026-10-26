package webassets

import "io/fs"

// Dir returns the embedded production frontend, if this binary was built with
// the embedweb build tag and the dist directory was populated.
func Dir() (fs.FS, bool) {
	return embeddedDir()
}
