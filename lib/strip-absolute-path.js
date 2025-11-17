// unix absolute paths are also absolute on win32, so we use this for both
var path = require('path')
var pathWin32 = path.win32

// Handle older Node.js versions where path.win32 doesn't exist (Node < 0.11.15)
if (!pathWin32) {
    pathWin32 = {
        isAbsolute: function (p) {
            // Windows absolute path patterns: C:\ or \\server\share or /
            var normalized = p.replace(/\\/g, '/')
            return /^([a-zA-Z]:\/|[\/]{2})/.test(normalized) || normalized.charAt(0) === '/'
        },
        parse: function (p) {
            var result = { root: '', dir: '', base: '', ext: '', name: '' }
            // Windows drive letter (C:)
            if (/^[a-zA-Z]:/.test(p)) {
                result.root = p.charAt(0).toUpperCase() + ':\\'
                p = p.substr(2)
            }
            // UNC path (\\server\share)
            else if (/^[\\\/]{2}/.test(p)) {
                var match = p.match(/^([\\\/]{2}[^\\\/]+[\\\/][^\\\/]+)/)
                if (match) {
                    result.root = match[1] + (p.charAt(match[1].length) === '\\' ? '\\' : '/')
                } else {
                    // Just // or \\ - single slash
                    result.root = p.charAt(0) === '/' ? '/' : '\\'
                }
            }
            // Unix absolute (/)
            else if (p.charAt(0) === '/') {
                result.root = '/'
            }
            return result
        }
    }
}

var isAbsolute = pathWin32.isAbsolute
var parse = pathWin32.parse

// returns [root, stripped]
module.exports = function stripAbsolutePath(pathStr) {
    var r = ''
    while (isAbsolute(pathStr)) {
        // windows will think that //x/y/z has a "root" of //x/y/
        var root = pathStr.charAt(0) === '/' ? '/' : parse(pathStr).root
        pathStr = pathStr.substr(root.length)
        r += root
    }
    return [r, pathStr]
}

