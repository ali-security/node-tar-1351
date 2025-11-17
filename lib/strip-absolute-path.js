// unix absolute paths are also absolute on win32, so we use this for both
var path = require('path')

// manually check if path is absolute (for Node 0.10 compatibility)
// Unix absolute: starts with '/'
// Windows absolute: has a root from path.parse() (e.g., 'C:\', '\\server\share\')
// Note: unix absolute paths are also absolute on win32
function isAbsolute(p) {
    if (p.charAt(0) === '/') return true
    var parsed = path.parse(p)
    return parsed.root !== ''
}

// returns [root, stripped]
module.exports = function (p) {
    var r = ''
    while (isAbsolute(p)) {
        // windows will think that //x/y/z has a "root" of //x/y/
        var root = p.charAt(0) === '/' ? '/' : path.parse(p).root
        p = p.substr(root.length)
        r += root
    }
    return [r, p]
}

