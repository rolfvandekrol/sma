var services = require('./services');

var error = function(req, res, error) {
  res.writeHead(500);
  
};

exports.watch = function (req, data, res) {
  if (typeof data.service === 'undefined' || typeof services[data.service] !== 'undefined') {
    
  }
  
  res.writeHead(200);
  res.end('watch');
};
exports.unwatch = function (req, data, res) {
  res.writeHead(200);
  res.end('unwatch');
};
exports.message = function (req, data, res) {
  res.writeHead(200);
  res.end('message');
};

exports.notfound = function (req, data, res) {
  res.writeHead(404);
  res.end();
};


