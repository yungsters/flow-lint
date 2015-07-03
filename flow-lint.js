#!/usr/bin/env node

var FS = require('q-io/fs');
var Q = require('q');

require('colors');

var path = process.argv[2] || process.cwd();

FS.listTree(path, function(path) {
  if (path.indexOf('__mocks__') >= 0 ||
      path.indexOf('__tests__') >= 0 ||
      path.indexOf('node_modules') >= 0) {
    return null;
  }
  return path.match(/\.js$/) !== null;
}).then(function(paths) {
  var lints = paths
    .filter(function(path) {
      return FS.isFile(path);
    })
    .map(function(path) {
      return FS.read(path).then(function(content) {
        return {
          path: path,
          unused: lintContent(content, path)
        };
      });
    });
  return Q.all(lints);
}).done(function(results) {
  var issues = results
    .filter(function(result) {
      return Object.keys(result.unused).length > 0;
    })
    .sort(function(a, b) {
      if (a.path < b.path) {
        return -1;
      } else if (a.path > b.path) {
        return 1;
      } else {
        return 0;
      }
    });

  var unusedCount = issues.reduce(function(count, issue) {
    return count + Object.keys(issue.unused).length;
  }, 0);
  console.log(
    'Found %d unused Flow type%s.\n',
    unusedCount,
    unusedCount === 1 ? '' : 's'
  );
  if (unusedCount === 0) {
    return;
  }

  issues.map(function(issue) {
    console.log(issue.path.yellow);
    console.log(Object.keys(issue.unused).map(function(type) {
      var context = issue.unused[type];
      return '  ' + [
        type.red,
        ('' + context.lineNumber),
        ('' + context.columnNumber),
        context.line.replace(
          getWordPattern(type),
          function(match) {
            return match.red;
          }
        )
      ].join(':'.dim.cyan) + '\n';
    }).join(''));
  });
});

function lintContent(content) {
  var offsets = {};

  var removed = content;
  if (removed.indexOf('@flow') >= 0) {
    removed = removed.replace(
      /import\s+type\s+(\w+)\s+from[^;]+?;/g,
      function(match, typeIdentifier, offset) {
        offsets[typeIdentifier] =
          offset + getWordPattern(typeIdentifier).exec(match).index;
        return catchup(match);
      }
    );
    removed = removed.replace(
      /import\s+type\s*\{([^}]+)\}\s*from[^;]+?;/g,
      function(match, typeIdentifiers, offset) {
        typeIdentifiers.split(',').forEach(function(each) {
          var typeIdentifier = each.trim();
          offsets[typeIdentifier] =
            offset + getWordPattern(typeIdentifier).exec(match).index;
        });
        return catchup(match);
      }
    );
    removed = removed.replace(
      /(export\s+)?type\s+(\w+)\s*=/g,
      function(match, exportKeyword, typeIdentifier, offset) {
        if (!exportKeyword) {
          offsets[typeIdentifier] =
            offset + getWordPattern(typeIdentifier).exec(match).index;
        }
        return catchup(match);
      }
    );
  }

  var unusedTypes = Object.keys(offsets)
    .filter(function(type) {
      return removed.match(getWordPattern(type)) === null;
    })
    .sort(function(a, b) {
      return offsets[a] - offsets[b];
    });

  var unused = {};
  unusedTypes.forEach(function(type) {
    var offset = offsets[type];
    unused[type] = {
      line: content.substring(
        content.lastIndexOf('\n', offset) + 1,
        content.indexOf('\n', offset)
      ),
      lineNumber: getLineNumber(content, offset),
      columnNumber: getColumnNumber(content, offset)
    }
  });
  return unused;
}

function catchup(content) {
  return content.replace(/[^\n]/g, ' ');
}

function getLineNumber(content, offset) {
  return (content.substr(0, offset).match(/\n/g) || []).length + 1;
}

function getColumnNumber(content, offset) {
  return offset - content.lastIndexOf('\n', offset);
}

function getWordPattern(word) {
  return new RegExp('\\b' + word + '\\b');
}
