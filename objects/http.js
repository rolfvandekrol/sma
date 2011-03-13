var http = require('http');

var regexp = /^(?:([^:/?#]+):)?(?:\/\/([^/?#]+))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?/;
var positions = {
  scheme: 1,
  domain: 2,
  path: 3,
  query: 4,
  fragment: 5
};
var validSchemes = {'http':'', 'https':''};

/**
 * Detect redirection. Sends the result to the result_callback. If infinite 
 * loop is detected, then false will be send.
 *
 * @param link            The URL that should be detected. 
 * @param result_callback The function that should be called with the result
 * @param path            For internal usage only. This function calls itself
 *                        resursively, and uses this variable to keep track of
 *                        of the redirection path. This is used for the infinite
 *                        redirection loop detection.
 */
var redirectionDetector = function (link, callback, path) {
  var redirectionPath,
      i;
  
  // construct a redirection path. We need this for infinite loop detection
  if (path === undefined) {
    redirectionPath = [link];
  } else {
    redirectionPath = path.slice(0);
    redirectionPath.push(link);
  }
  
  // perform actual redirect
  redirect(link, function (err, result) {
    if (err !== null) {
      // no redirect
      callback(null, link);
    } else {
      // redirect, make sure we do not end up in an infinite redirection loop
      for (i in redirectionPath) {
        if (redirectionPath[i] === result) {
          // we have been redirected to an URL that we already stumbled upon.
          callback(new Error('Endless redirection loop detected'));
          return;
        }
      }
      
      // we have been redirected, and apperently no infinite loop, yet
      redirectionDetector(result, callback, redirectionPath);
    }
  });
};


var redirect = function (link, callback) {
  var m = link.match(regexp),
      client, path;
  
  path = m[positions.path];
  if (m[positions.query] !== undefined) {
    path += '?' + m[positions.query];
  }
  
  if (m[positions.scheme] == 'https') {
    client = http.createClient(443, m[positions.domain], true);
  } else {
    client = http.createClient(80, m[positions.domain]);
  }
  
  var request = client.request('HEAD', path,
    {'host': m[positions.domain]});
  request.end();
  
  request.on('response', function (response) {
    if (response.statusCode === 301) {
      if ('location' in response.headers) {
        callback(null, response.headers.location);
        return;
      }
    }
    
    callback(new Error('No redirection'));
  });
};


exports.link = {
  unify: function (id, callback) {
    redirectionDetector(id, function(err, result) {
      if (err === null) {
        callback(null, result);
      } else {
        callback(new Error('Could not unify, probably a endless redirection loop occurred'));
      }
    });
  },
  
  validate: function (id, callback) {
    var m = id.match(regexp);
    
    if (m[positions.scheme] === undefined) {
      callback(new Error('Schema is undefined'));
      return;
    }
    if (validSchemes[m[positions.scheme]] === undefined) {
      callback(new Error('Defined schema is not recognized'));
      return;
    }
    
    if (m[positions.domain] === undefined) {
      callback(new Error('Domain is undefined'));
      return;
    }
    
    callback(null, id);
    return;
  }
};
