var conf = require('../config').configuration;
var twitter = require('../lib/twitter');

// setup authentication
twitter.auth(conf.services.twitter.username, conf.services.twitter.password);

var x = new twitter.connection.HTTPConnection({});
x.on('object', function(object) {
  console.log(object);
});
x.on('state_change', function(state) {
  console.log(state);
});
