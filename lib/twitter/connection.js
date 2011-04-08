var http = require('http'), 
    util = require('util'), // containes the logic for inheritance
    rjs = require('../rjs'), // contains the property with getter and setter
                             // logic
    sharedjs = require('../sharedjs'), // sharedJS library
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
  path: '/1/statuses/filter.json', // filter is what we really want to use. 
                                   // Sample is for testing purposes
  headers: { "User-Agent": 'SMA 1.0',  // Twitter wants us to send a version
             "Authorization": '',
             "Host": 'stream.twitter.com',
             "Content-Type": 'application/x-www-form-urlencoded'},
  method: 'POST'  // change to post for filter method
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
  var data = querystring.stringify(options);
  HTTPOptions.headers['Content-Length'] = data.length;
  this.request = agent.appendMessage(HTTPOptions);
  this.request.write(data);
  this.request.end();
  
  // variable to store the response object so we can reference it later
  var response;
  var abort = this.abort = function() {
    // remove all the listeners we added to the request object, to free it's 
    // memory
    self.request.removeAllListeners('end');
    self.request.removeAllListeners('error');
    self.request.removeAllListeners('response');
    
    // abort the request
    self.request.abort();
    
    // remove the listeners from the response object
    if (response) {
      response.removeAllListeners('data');
      response.removeAllListeners('end');
    }
  };
  
  // on error, emit an error if the connection is still in use
  this.request.on('error', function() {
    if (self.state.get() <= HTTPConnection.status.active) {
      self.emit('error', new HTTPError('socket', null, 'Socket error'));
      abort();
    }
  });
  // on socket end, emit an error if the connection is still in use
  this.request.on('end', function() {
    if (self.state.get() <= HTTPConnection.status.active) {
      self.emit('error', new HTTPError('socket', null, 'Socket end'));
      abort();
    }
  });
  
  this.request.on('response', function(r) {
    // use response variable one scope up
    response = r;
    
    // if we did not get a 200 response, emit an error
    if (response.statusCode != 200) {
      if (self.state.get() <= HTTPConnection.status.active) {
        self.emit('error', new HTTPError('http', response.statusCode, 
          'HTTP ' + response.statusCode + ' ' + 
          http.STATUS_CODES[response.statusCode]));
      }
      
      abort();
      return;
    } else {
      // notify Connection object that we build a valid connection
      self.emit('active'); 
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
      if (self.state.get() <= HTTPConnection.status.active) {
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
};

var Connection = exports.Connection = function() {
  var self = this;
  EventEmitter.call(this); // call EventEmitter constructor
  
  // manage the state as a property
  this.state = rjs.property(this, {
    // default to construction
    init: function(container) {
      container.value = Connection.status.idle;
    },
    // when state is set, we emit an event
    set: function(container, value) {
      container.value = value;
      this.emit('state_change', container.value);
    }
  });
  
  this.active_connection = null;
  
  this.queued = false;
  this.latest_stream = 0;
  
  this.options = null;
  
  var __connect = this.__connect = function() {
    var options = sharedjs.extend({}, this.options);
    _connect(options);
  };
  
  var _build_reconnection_new = function(err) {
    switch(err.component) {
      case 'socket':
        return {
          'reason': 'socket',
          'timeout': 250,
        };
      default:
        // treat not recognized component as HTTP, because that causes us to
        // play the nicest way against the Twitter API.
        return {
          'reason': 'http',
          'timeout': 10000
        };
    }
  };
  
  var _build_reconnection = function(err, reconnection) {
    // if no previous reconnection is present, we build a new one
    if (!reconnection) {
      return _build_reconnection_new(err);
    }
    
    // previous reconnection reason is not the same reason why we want to 
    // reconnect now. We drop the old reconnection and build a new one.
    if(reconnection.reason != _build_reconnection_new(err).reason) {
      return _build_reconnection_new(err);
    }
    
    var r = {
      'reason': reconnection.reason
    };
    switch (reconnection.reason) {
      case 'socket':
        r.timeout = Math.min(reconnection.timeout + 250, 16000);
        break;
      default:
        r.timeout = Math.min(reconnection.timeout * 2, 240000);
        break;
    }
    
    return r;
  };
  
  var _connect = function(options, reconnection) {
    switch(self.state.get()) {
      case Connection.status.idle:
      case Connection.status.lost:
        self.state.set(Connection.status.connecting);
        break;
      case Connection.status.streaming:
        self.active_connection.state.set(HTTPConnection.status.deprecated);
        break;
      default:
        // stupid situation. Should we emit an error?
        return;
    }
    
    var connection = new HTTPConnection(options);
    
    connection.on('object', function(object) {
      // process object
      self.emit('object',object); // need something smarter than this
    });
    
    connection.on('active', function() {
      // if we do have an currently active connection, completely get rid of it
      if (self.active_connection) {
        self.active_connection.state.set(HTTPConnection.status.abondaned);
        self.active_connection.abort();
      }
      
      // start using the new connection
      self.active_connection = connection;
      self.active_connection.state.set(HTTPConnection.status.active);
      self.state.set(Connection.status.streaming);
    });
    
    connection.on('error', function(err) {
      switch (connection.state.get()) {
        case HTTPConnection.status.construction:
          // we didn't get any data yet, so we're getting an error while 
          // building a new connection. This means we should follow the Twitter
          // reconnection protocol here
          self.state.set(Connection.status.lost);
          
          reconnection = _build_reconnection(err, reconnection);
          setTimeout(function() {
            _connect(options, reconnection);
          }, reconnection.timeout);
          break;
        case HTTPConnection.status.active:
          // we did receive a valid connection, so we shouldn't bother with the
          // reconnection protocol, but just reconnect
          self.active_connection = null;
          self.state.set(Connection.status.lost);
          process.nextTick(__connect);
          break;
        default:
          // connection wasn't used anymore, so do nothing at all
          break;
      }
    });
  };
};
util.inherits(Connection, EventEmitter); // inherit from EventEmitter

Connection.status = {
  idle: 0, // no connection and not trying to get one
  connecting: 1, // building a connection while not currently connected
  streaming: 2, // active connection present
  lost: 3 // no connection and waiting before trying to connect again
};

Connection.prototype.stream = function(options) {
  var self = this;
  this.options = options;
  
  var time = (new Date()).getTime();
  
  switch(this.state.get()) {
    case Connection.status.connecting:
    case Connection.status.lost:
      setTimeout(function () {
        self.stream(options);
      }, 1000);
      break;
    case Connection.status.streaming:
      if (time - this.latest_stream > 60000) {
        this.latest_stream = time;
        this.__connect();
      } else {
        if (!this.queued) {
          setTimeout(function() {
            self.__connect();
          }, this.latest_stream + 60000 - time);
        }
      }
    default:
      this.__connect();
  }
};

Connection.prototype.stop = function() {
  var self = this;
  if (self.active_connection) {
    self.active_connection.state.set(HTTPConnection.status.abondaned);
    self.active_connection.abort();
    
    self.active_connection = null;
    self.state.set(Connection.status.idle);
  }
};
