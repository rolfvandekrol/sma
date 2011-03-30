var http = require('http');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Connection = exports.Connection = function(options) {
  var self = this;
  events.EventEmitter.call(this); // call EventEmitter constructor
  
  this.options = options;
  
  this.agent = http.getAgent(options.host, options.port);
  
  this.requests = [];
  this.active_request = null;
  
  // build event callbacks here, so that we are able to reference ourselves. Use
  // 'self' to reference the Connection object. 'this' will, in most cases, 
  // refer to a request, respone or socket.
  this.callbacks = {
    'request': {},
  };
};
util.inherits(Connection, events.EventEmitter); // inherit from EventEmitter

Connection.status = {
  construction: 'construction', // New request, without any data received
  active: 'active', // Actively used request
  deprecated: 'deprecated', // Request for which we still accept the data, but
                            // a new request is under construction
  abondaned: 'abondaned', // A new request has become the active request
  error: 'error' // something went wrong in the request
};

Connection.prototype._request = function() {
  // TODO Find a better way to clone the options object
  var options = {
    host: this.options.host,
    port: this.options.port,
    method: this.options.method,
    path: this.options.path,
    headers: this.options.headers
  };
  
  var request = this.agent.appendMessage(options);
  request.twitter_status = Connection.status.construction;
  
  // register event callbacks
  var event;
  for (event in this.callbacks.request) {
    request.on(event, this.callbacks.request[event]);
  }
  
  return request;
};


