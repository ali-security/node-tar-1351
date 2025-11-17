// give it a tarball and a path, and it'll dump the contents

module.exports = Extract

var tar = require("../tar.js")
  , fstream = require("fstream")
  , inherits = require("inherits")
  , path = require("path")

var DEFAULT_MAX_DEPTH = 1024

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
  // set to Infinity to remove this restriction
  this.maxDepth = typeof opts.maxDepth === 'number'
    ? opts.maxDepth
    : DEFAULT_MAX_DEPTH

  // store onwarn callback if provided
  this._onwarn = opts.onwarn

  this._fst = fstream.Writer(opts)

  this.pause()
  var me = this

  // Hardlinks in tarballs are relative to the root
  // of the tarball.  So, they need to be resolved against
  // the target directory in order to be created properly.
  me.on("entry", function (entry) {
    // Store original path for warning message
    var originalPath = entry.path
    var parts = entry.path.split("/")
    var shouldAbort = false

    // Check depth FIRST, before any processing
    if (isFinite(me.maxDepth) && parts.length > me.maxDepth) {
      shouldAbort = true
    }

    // if there's a "strip" argument, then strip off that many
    // path components.
    if (!shouldAbort && opts.strip) {
      if (parts.length < opts.strip) {
        entry.abort()
        entry.pause()
        entry.on('data', function () { }) // Drain data
        entry.on('end', function () { }) // Handle end
        return
      }
      parts = parts.slice(opts.strip)
      entry.path = entry.props.path = parts.join("/")
      if (entry.linkpath) {
        var lp = entry.linkpath.split("/")
        if (lp.length < opts.strip) {
          entry.abort()
          entry.pause()
          entry.on('data', function () { })
          entry.on('end', function () { })
          return
        }
        entry.linkpath = entry.props.linkpath = lp.slice(opts.strip).join('/')
      }

      // Check depth again AFTER stripping
      if (isFinite(me.maxDepth) && parts.length > me.maxDepth) {
        shouldAbort = true
      }
    }

    // If entry should be aborted, warn and abort it
    if (shouldAbort) {
      var warnData = {
        entry: entry,
        path: originalPath,
        depth: parts.length,
        maxDepth: me.maxDepth,
      }
      if (me._onwarn) {
        me._onwarn('TAR_ENTRY_ERROR', 'path excessively deep', warnData)
      }
      me.warn('TAR_ENTRY_ERROR', 'path excessively deep', warnData)
      entry.abort()
      entry.pause()
      entry.on('data', function () { }) // Drain data
      entry.on('end', function () { }) // Handle end
      return  // Exit early - don't process this entry at all
    }

    // Only pipe valid entries to _fst
    // This prevents aborted entries from reaching fstream.Writer
    entry.pipe(me._fst, { end: false })

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
    // Don't auto-pipe all entries - we manually pipe valid entries in the entry handler
    // This prevents aborted entries from reaching fstream.Writer
    me.resume()
  })

  this._fst.on('error', function (err) {
    me.emit('error', err)
  })

  this._fst.on('drain', function () {
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
