var http = require('http'), 
    util = require('util'), // containes the logic for inheritance
    rjs = require('../rjs'), // contains the property with getter and setter
                             // logic
    querystring = require('querystring'), // used to encode the tracking options
                                          // for post
    parser = require('./parser'), // contains the streaming JSON parser
    Buffer = require('buffer').Buffer  // required to convert to base64 for
                                       // http basic authentication
    EventEmitter = require('events').EventEmitter; // emit events

/**
 * Convert a username and password to the Authorization header value for Basic
 * Authentication.
 */
var basicAuth = function basicAuth(user, pass) {
  return "Basic " + new Buffer(user + ":" + pass).toString('base64');
};
/**
 * Set the Authorization header in HTTPOptions.
 */
exports.auth = function(username, password) {
  HTTPOptions.headers.Authorization = basicAuth(username, password);
};

// contains the data we need to build the http connection
var HTTPOptions = {
  host: 'stream.twitter.com',
  port: 80,
  path: '/1/statuses/sample.json', // filter is what we really want to use. 
                                   // Sample is for testing purposes
  headers: { "User-Agent": 'SMA 1.0',  // Twitter wants us to send a version
             "Authorization": '',
             "Host": 'stream.twitter.com'},
  method: 'POST'
};

// the connection agent for the given host and port. This agent manages the
// sockets.
var agent = http.getAgent(HTTPOptions.host, HTTPOptions.port);

var HTTPError = function(component, code, description) {
  this.component = component;
  this.code = code;
  this.description = description;
}
var HTTPConnection = exports.HTTPConnection = function(options) {
  var self = this;
  EventEmitter.call(this); // call EventEmitter constructor
  
  // manage the state as a property
  this.state = rjs.property(this, {
    // default to construction
    init: function(container) {
      container.value = HTTPConnection.status.construction;
    },
    // when state is set, we emit an event
    set: function(container, value) {
      container.value = value;
      this.emit('state_change', container.value);
    }
  });
  
  // create a request and write post to it
  this.request = agent.appendMessage(HTTPOptions);
  this.request.write(querystring.stringify(options));
  this.request.end();
  
  // variable to store the response object so we can reference it later
  var response;
  var abort = function() {
    // remove all the listeners we added to the request object, to free it's 
    // memory
    this.request.removeAllListeners('end');
    this.request.removeAllListeners('error');
    this.request.removeAllListeners('response');
    
    // abort the request
    this.request.abort();
    
    // remove the listeners from the response object
    if (response) {
      response.removeAllListeners('data');
      response.removeAllListeners('end');
    }
  };
  
  // on error, emit an error if the connection is still in use
  this.request.on('error', function() {
    if (self.state.get().state <= HTTPConnection.active) {
      self.emit('error', new HTTPError('socket', null, 'Socket error'));
      abort();
    }
  });
  // on socket end, emit an error if the connection is still in use
  this.request.on('end', function() {
    if (self.state.get().state <= HTTPConnection.active) {
      self.emit('error', new HTTPError('socket', null, 'Socket end'));
      abort();
    }
  });
  
  this.request.on('response', function(r) {
    // use response variable one scope up
    response = r;
    
    // if we did not get a 200 response, emit an error
    if (response.statusCode != 200 && self.state.get().state <= HTTPConnection.active) {
      self.emit('error', new HTTPError('http', response.statusCode, 
        'HTTP ' + response.statusCode + ' ' + 
        http.STATUS_CODES[response.statusCode]));
      
      abort();
      return;
    }
    
    // start the JSON Streamin parser
    var p = new parser.Parser();
    p.on('error', function() {
      // ignore parsing errors for now
    });
    
    // emit an object when an object is read in the parser
    p.on('object', function(object) {
      self.emit('object', object);
    });
    
    // if we receive a data chunk, we push it into the parser
    response.on('data', function(chunk) {
      p.receive(chunk);
    });
    response.on('end', function() {
      if (self.state.get().state <= HTTPConnection.active) {
        self.emit('error', new HTTPError('http', null, 
          'HTTP Response ended'));
      }
    });
  });
};
util.inherits(HTTPConnection, EventEmitter); // inherit from EventEmitter

HTTPConnection.status = {
  construction: 1, // New request, without any data received
  active: 2, // Actively used request
  deprecated: 3, // Request for which we still accept the data, but
                            // a new request is under construction
  abondaned: 4, // A new request has become the active request
  error: 5 // something went wrong in the request
};


