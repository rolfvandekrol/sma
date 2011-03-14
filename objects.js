var objectRegexp = /^([a-z]+):([a-z]+):.*$/i,
    typeRegexp = /^([a-z]+):([a-z]+)$/i,
    
    SOURCE = 'source',
    TARGET = 'target',
    GOAL = 'goal',
    
    conversionTypes = (
      function () {
        var fs = require('fs'),
            types = {},
            
            js = /([a-z]+)\.js/,
            filenames = fs.readdirSync(__dirname + '/objects'),
            files = {},
            m, key, file;
        
        for (i in filenames) {
          m = filenames[i].match(js);
          if (m) {
            file = require('./objects/' + m[1]);
            for (key in file) {
              types[m[1] + ':' + key] = file[key];
            }
          }
        }
        
        return types;
      }
    ()),
    conversionTree = (
      // TODO: Change this to logic that inspects the objects to define the 
      // available conversion paths
      function(types) {
        return {
          'http:link': {
            'youtube:video': {
              'route': [
                'http:link',
                'youtube:video'
              ],
              'method': [
                TARGET,
                GOAL
              ]
            }
          }
        };
      }
    ());
    conversionLogic = (
      // TODO: Change this to logic that inspects the objects and the outweighs
      // parameters to define the preferered conversions
      function(types) {
        return {
          'http:link': [
            'youtube:video'
          ]
        };
      }
    );

var Status = function(value) {
  this.callbacks = [];
  
  if (value === undefined) {
    this.status = Status.PENDING;
  } else {
    this.status = Status.RESOLVED;
    this.value = value;
  }
};
Status.PENDING = 0;
Status.RESOLVED = 1;
Status.REJECTED = -1;

Status.prototype.resolve = function(value) {
  this.status = Status.RESOLVED;
  this.value = value;
  this.notifyAll();
};
Status.prototype.reject = function(msg) {
  this.status = Status.REJECTED;
  this.error = new Error(msg);
  this.notifyAll();
}
Status.prototype.notifyAll = function() {
  var i;
  
  for (i in this.callbacks) {
    this.notify(this.callbacks[i]);
  }
};
Status.prototype.notify = function(callback) {
  var self = this;
  
  if (this.status === Status.RESOLVED) {
    process.nextTick(function() {
      callback(null, self.value);
    });
  } else {
    process.nextTick(function() {
      callback(self.error);
    });
  }
};
Status.prototype.when = function(callback) {
  if (this.status === Status.PENDING) {
    this.callbacks.push(callback);
  } else {
    this.notify(callback);
  }
};

var convert = exports.convert = function (type, id, callback) {
  var target, i,
      options = {},
      result = [],
      conversion;
  
  if (conversionLogic[type] === undefined) {
    callback(new Error('No conversion logic available for this type'));
    return;
  }
  
  conversion = function(type, id, callback) {
    var results = {};
    results[type] = id;
    
    var output = {};
    
    var report = {};
    
    var c = function(target, callback) {
      var steps = conversionTree[type][target],
          i;
      
      for (i in steps) {
        
      }
    };
    
    // loop over the preferred conversion targets
    for (i in conversionLogic[type]) {
      c(conversionLogic[type][i], function(err, type, id) {
        
      });
    }
  };
  
  valuni(type, id, function(err, new_id) {
    if (err === null) {
      
    } else {
      callback(err);
    }
  });
};

/**
 * Encapsulates validation and unification and provides simple dummy functions
 * for types without a validation and/or unification method.
 */
var valnuni = exports.valuni =  function(type, id, callback) {
  var dummy = function (id, callback) {
        callback(null, id);
      },
      finder = function(type, action) {
        if (conversionTypes[type][action] !== undefined) {
          return function(id, callback) {
            conversionTypes[type][action](id, callback);
          };
        } else {
          return dummy;
        }
      },
      val = finder(type, 'validate'),
      uni = finder(type, 'unify');
  
  val(id, function(err, id) {
    if (err === null) {
      uni(id, function(err, id) {
        if (err === null) {
          callback(null, id);
        } else {
          callback(err);
        }
      });
    } else {
      callback(err);
    }
  });
};
