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
            },
            'http:link': {
              'route': [
                'http:link'
              ],
              'method': [
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
            'http:link',
            'youtube:video'
          ]
        };
      }
    )(conversionTypes);

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
    results[type] = new Status(id);
    
    var output = {};
    
    var c = function(target, callback) {
      var i, // iterator keys
          reported = false,
          error = function(msg) {
            if (!reported) {
              reported = true;
              callback(new Error(msg));
            }
          },
          finished = function(value) {
            if (!reported) {
              reported = true;
              callback(null, value);
            }
          };
      
      for (i in conversionTree[type][target].route) {
        // conversionTree[type][target].method[j] = way to get to the next
        // conversionTree[type][target].route[j+1] = next step
        (function(j) {
        
          if (results[conversionTree[type][target].route[j]] === undefined) {
            error('Conversion error. Source step not available. Probably a mistake in the conversionTree generation');
            return;
          }
          
          // TODO DRY
          if (conversionTree[type][target].method[j] == SOURCE) {
            if (conversionTypes[conversionTree[type][target].route[j]].convert.to[conversionTree[type][target].route[j+1]] === undefined) {
              error('Conversion error. Conversion function not available. Probably a mistake in the conversionTree generation.');
              return;
            }
            
            if (results[conversionTree[type][target].route[j+1]] === undefined) {
              results[conversionTree[type][target].route[j+1]] = new Status();
              
              results[conversionTree[type][target].route[j]].when(function(err, value) {
                if (err !== null) {
                  error(err.message);
                  return;
                }
                
                conversionTypes[conversionTree[type][target].route[j]].convert.to[conversionTree[type][target].route[j+1]](value, function(err, value) {
                  if (err !== null) {
                    results[conversionTree[type][target].route[j+1]].reject(err.message);
                    return;
                  }
                  results[conversionTree[type][target].route[j+1]].resolve(value);
                });
              });
            }
            
          } else if (conversionTree[type][target].method[j] == TARGET) {
            if (conversionTypes[conversionTree[type][target].route[j+1]].convert.from[conversionTree[type][target].route[j]] === undefined) {
              error('Conversion error. Conversion function not available. Probably a mistake in the conversionTree generation.');
              return;
            }
            
            if (results[conversionTree[type][target].route[j+1]] === undefined) {
              results[conversionTree[type][target].route[j+1]] = new Status();
              
              results[conversionTree[type][target].route[j]].when(function(err, value) {
                if (err !== null) {
                  error(err.message);
                  return;
                }
                
                conversionTypes[conversionTree[type][target].route[j+1]].convert.from[conversionTree[type][target].route[j]](value, function(err, value) {
                  if (err !== null) {
                    results[conversionTree[type][target].route[j+1]].reject(err.message);
                    return;
                  }
                  results[conversionTree[type][target].route[j+1]].resolve(value);
                });
              });
            }
          } else if (conversionTree[type][target].method[j] == GOAL) {
            results[conversionTree[type][target].route[j]].when(function(err, value) {
              if (err !== null) {
                error(err.message);
                return;
              }
              
              finished(value);
            });
          } else {
            error('Conversion error. Unregcognized conversion method. Probably a mistake in the conversionTree generation');
            return;
          }
        })(parseInt(i));
      }
    }; // end c
    
    var counter = 0;
    
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
var valuni = exports.valuni =  function(type, id, callback) {
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
