    // Regular expressions to recognize objects (module:type:id) and type 
    // definitions (module:type).
var objectRegexp = /^([a-z]+):([a-z]+):.*$/i,
    typeRegexp = /^([a-z]+):([a-z]+)$/i,
    
    // Conversion methods. When we are doing a direct conversion from a type A
    // object to a type B object then ...
    SOURCE = 'source', // ... A knows how to convert to B
    TARGET = 'target', // ... B knows how to convert from A.
    
    // Sort of dummy conversion method. In the method list in the 
    // conversionTree, this means that we reached the final conversion step.
    GOAL = 'goal',
    
    /**
     * Simple function that tells us whether an item is in an array or not.
     * TODO: refactor this into a generic library
     *
     * @param array a
     * @param mixed i
     * @return bool
     */
    inarray = function(a, i) {
      var j;
      for (j in a) {
        if (a[j] === i) {
          return true;
        }
      }
      
      return false;
    },
    
    // list of all available objects types to convert between. Keys are type
    // definition strings (module:type) and values are object definition 
    // constructs that contain all the validation, unification and conversion
    // functions.
    conversionTypes = (
      function () {
            // file system module
        var fs = require('fs'),
            // prepare empty result
            types = {},
            // regular expression to match the filename of a javascript file
            js = /([a-z]+)\.js/,
            
            // read the names of all files in the objects dir, relative to this
            // script
            filenames = fs.readdirSync(__dirname + '/objects'),
            
            m, key, file;
        
        for (i in filenames) {
          // match filename with filename regular expression
          m = filenames[i].match(js);
          if (m) {
            // execute file
            file = require('./objects/' + m[1]);
            
            // loop over all types and register them in the type list.
            for (key in file) {
              types[m[1] + ':' + key] = file[key];
            }
          }
        }
        
        return types;
      }
    ()),
    
    conversionTree = (
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
        
        var registerRoot = function(type) {
          if (paths[type] === undefined) {
            paths[type] = {};
          }
          
          paths[type][type] = {
            'route': [type],
            'method': [GOAL]
          };
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
          registerRoot(key);
          if (done[key] === undefined) {
            find(key);
          }
        }
        
        return paths;
      }
    (conversionTypes)),
    
    conversionLogic = (
      function(types) {
        var output = {},
            key;
        
        var construct = function(type, self) {
          var key, key2, result2,
              result = [];
          
          if (self === undefined || self === true) {
            result.push(type);
          }
          
          for (key in types) {
            if (types[key].outweighs !== undefined) {
              if (inarray(types[key].outweighs, type)) {
                result.push(key);
                
                result2 = construct(key, false);
                for (key2 in result2) {
                  result.push(result2[key2]);
                }
              }
            }
          }
          
          return result;
        };
        
        for (key in types) {
          output[key] = construct(key);
        }
        
        return output;
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

var convert = function(results, type, target, callback) {
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
      var method;
    
      if (results[conversionTree[type][target].route[j]] === undefined) {
        error('Conversion error. Source step not available. Probably a mistake in the conversionTree generation');
        return;
      }
      
      if (conversionTree[type][target].method[j] === SOURCE || conversionTree[type][target].method[j] === TARGET) {
        if (conversionTree[type][target].method[j] === SOURCE) {
          method = {
            a: j,
            b: j+1,
            m: 'to'
          };
        } else {
          method = {
            a: j+1,
            b: j,
            m: 'from'
          };
        }
        if (conversionTypes[conversionTree[type][target].route[method.a]].convert[method.m][conversionTree[type][target].route[method.b]] === undefined) {
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
            
            conversionTypes[conversionTree[type][target].route[method.a]].convert[method.m][conversionTree[type][target].route[method.b]](value, function(err, value) {
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
};

exports.convert = function(s, id, t, callback) {
  var results = {};
  results[s] = new Status(id);
  
  convert(results, s, t, callback);
}

var analyse = exports.analyse = function (type, id, callback) {
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
    
    var counter = 0;
    
    // loop over the preferred conversion targets
    for (i in conversionLogic[type]) {
      (function(i) {
        convert(results, type, conversionLogic[type][i], function(err, id) {
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
