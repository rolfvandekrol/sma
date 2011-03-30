// should implement the waiting logic, as specified by twitter. Should use two
// sockets when argument switching.

var events = require('events');
var util = require('util');

var options = {
  host: 'stream.twitter.com',
  path: '/1/statuses/sample', // filter is what we really want to use. Sample is
    // for testing purposes
  headers: { "User-Agent": 'SMA 1.0' }, // Twitter wants us to send a version
};

var T = exports.Twitter = function(username, password) {
  events.EventEmitter.call(this); // call EventEmitter constructor
  
  var users = [];
};
util.inherits(T, events.EventEmitter); // inherit from EventEmitter

T.prototype.addUser = function(username) {
  // Prevent users from getting listed more than once
  if (this.users.indexOf(username) < 0) {
    this.users.push(username);
  }
};
T.prototype.removeUser = function(username) {
  // In theory a user could end up more than one in the array, if some silly 
  // consumer script directly starts adding users. 
  while(this.users.indexOf(username) > -1) {
    this.users.splice(this.users.indexOf(username),1);
  }
};

T.prototype.start = function() {
  
};
T.prototype.stop = function() {

};

T.prototype.connect = function() {
  
};
T.prototype._createConnection = function() {
  
};
