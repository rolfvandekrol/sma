var http = require('http');
var handlers = require('./handlers');

var objects = require('./objects');

var server = http.createServer(function (req, res) {
  var data = '';
  req.on('data', function(chunk) {
    data += chunk;
  });
  
  req.on('end', function() {
    var handler;
    var action = req.url.substr(1);
    if (typeof handlers[action] !== undefined) {
      handler = handlers[action];
    } else {
      handler = handlers.notfound;
    }
    
    if (handler) {
      handler(req, data, res);
    } else {
      // real error condition
      res.writeHead(500);
      res.end();
    }
  });
}).listen(1234);

console.log('bla');
