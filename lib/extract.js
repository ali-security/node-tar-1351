// give it a tarball and a path, and it'll dump the contents

module.exports = Extract

var tar = require("../tar.js")
  , fstream = require("fstream")
  , inherits = require("inherits")
  , path = require("path")

const DEFAULT_MAX_DEPTH = 1024

function Extract(opts) {
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

  // prevent excessively deep nesting of subfolders
  // set to `Infinity` to remove this restriction
  this.maxDepth = typeof opts.maxDepth === 'number'
    ? opts.maxDepth
    : DEFAULT_MAX_DEPTH

  // store onwarn handler if provided
  this.onwarn = opts.onwarn

  this._fst = fstream.Writer(opts)
  this._fstClosed = false

  this.pause()
  var me = this

  // Set up error handler immediately to catch any errors from fstream writer
  this._fst.on('error', function (err) {
    // Handle ENAMETOOLONG errors gracefully - these can happen when
    // paths are too long for the filesystem, even if depth is within limits
    if (err.code === 'ENAMETOOLONG') {
      var warnData = {
        code: err.code,
        path: err.path || (err.cwd ? path.join(err.cwd, err.path) : undefined),
        syscall: err.syscall
      }
      if (me.onwarn) {
        me.onwarn('TAR_ENTRY_ERROR', 'path too long for filesystem', warnData)
        // Don't emit error - allow stream to continue processing
        // Note: fstream writer might be destroyed, but parse stream should still complete
        // We'll handle completion in _streamEnd
      } else {
        // If no onwarn handler, emit as error to maintain backward compatibility
        me.emit('error', err)
      }
    } else {
      me.emit('error', err)
    }
  })

  // Hardlinks in tarballs are relative to the root
  // of the tarball.  So, they need to be resolved against
  // the target directory in order to be created properly.
  me.on("entry", function (entry) {
    var p = entry.path
    // if there's a "strip" argument, then strip off that many
    // path components.
    if (opts.strip) {
      p = entry.path.split("/").slice(opts.strip).join("/")
      entry.path = entry.props.path = p
      if (entry.linkpath) {
        var lp = entry.linkpath.split("/").slice(opts.strip).join("/")
        entry.linkpath = entry.props.linkpath = lp
      }
    }

    // Check depth before processing
    var parts = p.split("/").filter(function (part) {
      return part && part !== "."
    })
    if (isFinite(me.maxDepth) && parts.length > me.maxDepth) {
      var warnData = {
        entry: entry,
        path: p,
        depth: parts.length,
        maxDepth: me.maxDepth
      }
      if (me.onwarn) {
        me.onwarn('TAR_ENTRY_ERROR', 'path excessively deep', warnData)
      } else if (entry.warn) {
        entry.warn('TAR_ENTRY_ERROR', 'path excessively deep', warnData)
      }
      return false
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

  this._fst.on('drain', function () {
    me.emit('drain')
  })

  // this._fst.on("end", function () {
  //   console.error("\nEEEE Extract End", me._fst.path)
  // })

  this._fst.on("close", function () {
    // console.error("\nEEEE Extract End", me._fst.path)
    me._fstClosed = true
    me.emit("finish")
    me.emit("end")
    me.emit("close")
  })
}

inherits(Extract, tar.Parse)

Extract.prototype._streamEnd = function () {
  var me = this
  if (!me._ended || me._entry) me.error("unexpected eof")

  // If _fst is already closed or destroyed, emit end immediately
  if (me._fstClosed || !me._fst || me._fst.writable === false) {
    me.emit("finish")
    me.emit("end")
    me.emit("close")
    return
  }

  // Try to end the fstream writer
  // If it's already ended or destroyed, the 'close' handler will emit 'end'
  // If it errors, our error handler will have converted ENAMETOOLONG to a warning
  // and we need to ensure we still complete
  try {
    me._fst.end()
  } catch (e) {
    // If ending fails, emit end immediately
    me._fstClosed = true
    me.emit("finish")
    me.emit("end")
    me.emit("close")
  }
}
