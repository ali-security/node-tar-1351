// unix absolute paths are also absolute on win32, so we use this for both
var pathWin32 = require('path').win32
var isAbsolute = pathWin32.isAbsolute
var parse = pathWin32.parse

// returns [root, stripped]
module.exports = function stripAbsolutePath(path) {
  var r = ''
  while (isAbsolute(path)) {
    // windows will think that //x/y/z has a "root" of //x/y/
    var root = path.charAt(0) === '/' ? '/' : parse(path).root
    path = path.substr(root.length)
    r += root
  }
  return [r, path]
}

