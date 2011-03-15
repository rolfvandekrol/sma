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
        var paths = {};
        var done = {};
        
        var find = function(type) {
          var key;
          
          done[type] = true;
          
          for (key in types) {
            // we prefer from logic, because we assume the target knows better
            // how to convert to itself, than the source knows how to convert
            // to a target
            if (types[key].convert !== undefined && types[key].convert.from !== undefined && types[key].convert.from[type] !== undefined) {
              // from logic
              if (register(type, key, TARGET)) {
                find(key);
              }
            } else if (types[type].convert !== undefined && types[type].convert.to !== undefined && types[type].convert.to[key] !== undefined) {
              // to logic
              if(register(type, key, SOURCE)) {
                find(key);
              }
            }
          }
        };
        
        var inarray = function(a, i) {
          var j;
          for (j in a) {
            if (a[j] === i) {
              return true;
            }
          }
          
          return false;
        };
        
        var register = function(s, t, method) {
          var added = false,
              item = {'route': [s,t], 'method': [method, GOAL]},
              key;
          
          if (paths[s] === undefined) {
            paths[s] = {};
          }
          
          if ((paths[s][t] === undefined) || (paths[s][t].route.length > 2)) {
            paths[s][t] = item;
            added = true;
          }
          
          for (key in paths) {
            if (paths[key][s] !== undefined) {
              if (!inarray(paths[key][s].route, t) && ((paths[key][t] === undefined) || (paths[key][t].route.length > (paths[key][s].route.length + 1)))) {
                subregister(paths[key][s], t, method);
                added = true;
              }
            }
          }
          
          return added;
        };
        
        var subregister = function(orig, target, method) {
          var item = {route: orig.route.slice(0), method: orig.method.slice(0)};
          item.route.push(target);
          item.method.push(GOAL);
          item.method[item.method.length-2] = method;
          
          paths[orig.route[0]][target] = item;
        };
        
        var key;
        for (key in types) {
          if (done[key] === undefined) {
            find(key);
          }
        }
        
        return paths;
      }
    (conversionTypes)),
    
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
      (function(i) {
        c(conversionLogic[type][i], function(err, id) {
          // errors are nothing to worry about here. An error just means that some
          // conversion couldn't succeed, which is very common.
          if (err === null) {
            output[conversionLogic[type][i]] = id;
          } else {
          }
          counter += 1;
          
          if (counter == conversionLogic[type].length) {
            callback(null, output);
          }
        });
      })(i);
    }
  };
  
  valuni(type, id, function(err, new_id) {
    if (err === null) {
      conversion(type, new_id, function(err, result) {
        callback(err, result);
      });
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
