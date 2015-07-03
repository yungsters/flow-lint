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
  var issues = results.filter(function(result) {
    return result.unused.length > 0;
  });
  if (issues.length === 0) {
    return;
  }
  console.log('Found unused types in the following files:\n'.red);
  issues.map(function(issue) {
    console.log(issue.path.yellow);
    console.log(issue.unused.map(function(type) {
      return '    ' + type + '\n';
    }).join(''));
  });
});

function lintContent(content) {
  var types = {};

  if (content.indexOf('@flow') >= 0) {
    content = content.replace(
      /(export)?\s+type\s+([A-Za-z]+)\s+=/g,
      function(match, exportKeyword, typeIdentifier) {
        if (!exportKeyword) {
          types[typeIdentifier] = true;
        }
        return '';
      }
    );

    content = content.replace(
      /import\s+type\s+([A-Za-z]+)\s+from/g,
      function(match, typeIdentifier) {
        types[typeIdentifier] = true;
        return '';
      }
    );

    content = content.replace(
      /import\s+type\s+\{([^}]+)\}\s+from/g,
      function(match, typeIdentifiers) {
        typeIdentifiers.split(',').forEach(function(match) {
          types[match.trim()] = true;
        });
        return '';
      }
    );
  }

  var unused = Object.keys(types)
    .filter(function(type) {
      return content.match(new RegExp('\\b' + type + '\\b')) === null;
    })
    .sort();

  return unused;
}
