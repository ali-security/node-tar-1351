var t = require('tap')
var stripAbsolutePath = require('../lib/strip-absolute-path.js')

var cases = {
    '/': ['/', ''],
    '////': ['////', ''],
    'c:///a/b/c': ['c:///', 'a/b/c'],
    '\\\\foo\\bar\\baz': ['\\\\foo\\bar\\', 'baz'],
    '//foo//bar//baz': ['//', 'foo//bar//baz'],
    'c:\\c:\\c:\\c:\\\\d:\\e/f/g': ['c:\\c:\\c:\\c:\\\\d:\\', 'e/f/g'],
}

for (var input in cases) {
    var expected = cases[input]
    var result = stripAbsolutePath(input)
    t.equal(result[0], expected[0], input + ' root')
    t.equal(result[1], expected[1], input + ' stripped')
}

