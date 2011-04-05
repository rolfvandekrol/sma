// should implement the waiting logic, as specified by twitter. Should use two
// sockets when argument switching.

var events = require('events');
var util = require('util');

var Parser = exports.Parser = function () {
  events.EventEmitter.call(this); // Call EventEmitter constructor
  
  this.buffer = ''; // Initialize an empty input buffer
};
util.inherits(Parser, events.EventEmitter); // Inherit from EventEmitter

// JSON object seperator
Parser.END        = '\r\n';
Parser.END_LENGTH = 2;

// Read data from Twitter stream
Parser.prototype.receive = function (buffer) {
  this.buffer += buffer.toString('utf8');
  var index, json;

  // We can get several objects in one chunk, so keep looking for END until 
  // there is none left
  while ((index = this.buffer.indexOf(Parser.END)) > -1) {
    // Get the data before the END
    json = this.buffer.slice(0, index);
    
    // Strip the found data from the buffer. Even if it doesn't turn out to be
    // something valid.
    this.buffer = this.buffer.slice(index + Parser.END_LENGTH);
    
    // If we actually received data, we are going to try to process it. Twitter
    // can send just an END to keep the connection alive, so we ignore empty
    // data.
    if (json.length > 0) {
      // If the data we received turns out to be a valid object, we emit it. 
      // Otherwise we will emit an error. Errors should be listened for, because
      // EventEmitter otherwise will throw an Error.
      try {
        json = JSON.parse(json);
        this.emit('object', json);
      } catch (error) {
        this.emit('error', error);
      }
    }
  }
};
