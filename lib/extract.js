// give it a tarball and a path, and it'll dump the contents

module.exports = Extract

var tar = require("../tar.js")
  , fstream = require("fstream")
  , inherits = require("inherits")
  , path = require("path")
  , stripAbsolutePath = require("./strip-absolute-path.js")

function Extract (opts) {
  if (!(this instanceof Extract)) return new Extract(opts)
  tar.Parse.apply(this)

  if (typeof opts !== "object") {
    opts = { path: opts }
  }

  // better to drop in cwd? seems more standard.
  opts.path = opts.path || path.resolve("node-tar-extract")
  opts.type = "Directory"
  opts.Directory = true

  // similar to --strip or --strip-components
  opts.strip = +opts.strip
  if (!opts.strip || opts.strip <= 0) opts.strip = 0

  // CVE-2021-32803: Track directories to prevent symlink attacks
  // when a directory is replaced with a non-directory
  this.dirCache = {}

  this._fst = fstream.Writer(opts)

  this.pause()
  var me = this

  // Hardlinks in tarballs are relative to the root
  // of the tarball.  So, they need to be resolved against
  // the target directory in order to be created properly.
  me.on("entry", function (entry) {
    // if there's a "strip" argument, then strip off that many
    // path components.
    if (opts.strip) {
      var p = entry.path.split("/").slice(opts.strip).join("/")
      entry.path = entry.props.path = p
      if (entry.linkpath) {
        var lp = entry.linkpath.split("/").slice(opts.strip).join("/")
        entry.linkpath = entry.props.linkpath = lp
      }
    }

    // absolutes on posix are also absolutes on win32
    // so we only need to test this one to get both
    var p = entry.path
    var s = stripAbsolutePath(p)
    if (s[0]) {
      entry.path = s[1]
      entry.props.path = s[1]
      if (entry.warn) {
        entry.warn('stripping ' + s[0] + ' from absolute path', p)
      }
    }

    // CVE-2021-32803: if we are not creating a directory, and the path is in the dirCache,
    // then that means we are about to delete the directory we created
    // previously, and it is no longer going to be a directory, and neither
    // is any of its children.
    // Compute absolute path after all path modifications
    var entryAbsolute = path.resolve(opts.path, entry.path)
    // Normalize the path (remove trailing slashes for comparison)
    entryAbsolute = entryAbsolute.replace(/[\/\\]+$/, '')

    if (entry.type !== 'Directory') {
      for (var cachedPath in me.dirCache) {
        var normalizedCached = cachedPath.replace(/[\/\\]+$/, '')
        if (normalizedCached === entryAbsolute ||
          normalizedCached.indexOf(entryAbsolute + '/') === 0 ||
          normalizedCached.indexOf(entryAbsolute + '\\') === 0) {
          delete me.dirCache[cachedPath]
        }
      }
    } else {
      // Track directories as they're created
      me.dirCache[entryAbsolute] = true
    }

    if (entry.type === "Link") {
      entry.linkpath = entry.props.linkpath =
        path.join(opts.path, path.join("/", entry.props.linkpath))
    }

    if (entry.type === "SymbolicLink") {
      var dn = path.dirname(entry.path) || ""
      var linkpath = entry.props.linkpath
      var target = path.resolve(opts.path, dn, linkpath)
      if (target.indexOf(opts.path) !== 0) {
        linkpath = path.join(opts.path, path.join("/", linkpath))
      }
      entry.linkpath = entry.props.linkpath = linkpath
    }
  })

  this._fst.on("ready", function () {
    me.pipe(me._fst, { end: false })
    me.resume()
  })

  this._fst.on('error', function(err) {
    me.emit('error', err)
  })

  this._fst.on('drain', function() {
    me.emit('drain')
  })

  // this._fst.on("end", function () {
  //   console.error("\nEEEE Extract End", me._fst.path)
  // })

  this._fst.on("close", function () {
    // console.error("\nEEEE Extract End", me._fst.path)
    me.emit("finish")
    me.emit("end")
    me.emit("close")
  })
}

inherits(Extract, tar.Parse)

Extract.prototype._streamEnd = function () {
  var me = this
  if (!me._ended || me._entry) me.error("unexpected eof")
  me._fst.end()
  // my .end() is coming later.
}
