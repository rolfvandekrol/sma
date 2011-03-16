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
    
    // List of all available objects types to convert between. Keys are type
    // definition strings (module:type) and values are object definition 
    // constructs that contain all the validation, unification and conversion
    // functions.
    conversionTypes = (
      function () {
            // File system module
        var fs = require('fs'),
            // Prepare empty result
            types = {},
            // Regular expression to match the filename of a javascript file
            js = /([a-z]+)\.js/,
            
            // Read the names of all files in the objects dir, relative to this
            // script
            filenames = fs.readdirSync(__dirname + '/objects'),
            
            m, key, file;
        
        for (i in filenames) {
          // Match filename with filename regular expression
          m = filenames[i].match(js);
          if (m) {
            // Execute file
            file = require('./objects/' + m[1]);
            
            // Loop over all types and register them in the type list.
            for (key in file) {
              types[m[1] + ':' + key] = file[key];
            }
          }
        }
        
        return types;
      }
    ()),
    
    // List of the working conversion paths between types. Keys are source type
    // definition strings (module:type) and values are objects, where keys are
    // type definition strings (module:type) and values are path definition
    // objects.
    conversionTree = (
      function(types) {
            // Prepare empty result
        var paths = {},
            // Keep track of the type that we already ran 'find' on, to prevent
            // the detection from going wild.
            done = {},
            
            // Starts from a given point and traverses all available conversion
            // paths, recursively
            find = function(type) {
              var key;
              
              // Register this type as done
              done[type] = true;
              
              // Loop over all available types
              for (key in types) {
                // Check whether a conversion path is available from 'type' to
                // 'key'.
                // We prefer from logic, because we assume the target knows 
                // better how to convert to itself, than the source knows how to
                // convert to a target.
                if (types[key].convert !== undefined && 
                    types[key].convert.from !== undefined && 
                    types[key].convert.from[type] !== undefined
                ) {
                  // Register from logic in paths. If something changed we 
                  // traverse further to the 'key'.
                  if (register(type, key, TARGET)) {
                    find(key);
                  }
                } else if (types[type].convert !== undefined && 
                           types[type].convert.to !== undefined && 
                           types[type].convert.to[key] !== undefined
                ) {
                  // Register to logic in paths. If something changed we 
                  // traverse further to the 'key'.
                  if(register(type, key, SOURCE)) {
                    find(key);
                  }
                }
              }
            },
            
            // Register a conversion step in the paths.
            register = function(s, t, method) {
                  // Prepare return value. This will be set to true when we
                  // change something
              var added = false,
                  key;
              
              // Prepare object to store our path in.
              if (paths[s] === undefined) {
                paths[s] = {};
              }
              
              // If our path has not ben registered yet, or if the registered
              // path is not a direct path, we register our path.
              if ((paths[s][t] === undefined) || 
                  (paths[s][t].route.length > 2)
              ) {
                paths[s][t] = {'route': [s,t], 'method': [method, GOAL]};
                added = true;
              }
              
              // Loop over the existing paths to find paths ending in our 
              // source path
              for (key in paths) {
                if (paths[key][s] !== undefined) {
                  // If our target is not already part of the found path and
                  // if no path from the start to our target has been defined
                  // or the registered path is longer than the path we are about
                  // to register.
                  if (!inarray(paths[key][s].route, t) && 
                     ((paths[key][t] === undefined) || 
                      (paths[key][t].route.length > 
                        (paths[key][s].route.length + 1))
                     )
                  ) {
                    // Create a new path, based on the path to our source which
                    // extends it with the step to our target.
                    subregister(paths[key][s], t, method);
                    added = true;
                  }
                }
              }
              
              return added;
            },
            
            // Register root path, that defines a dummy conversion path with
            // source == target
            registerRoot = function(type) {
              if (paths[type] === undefined) {
                paths[type] = {};
              }
              
              paths[type][type] = {
                'route': [type],
                'method': [GOAL]
              };
            },
            
            // Register a path that is based on another path. Extends given
            // original path with a new target and conversion method.
            subregister = function(orig, target, method) {
              // Copy original path
              var item = {
                route: orig.route.slice(0), 
                method: orig.method.slice(0)
              };
              
              // Add target
              item.route.push(target);
              
              // Add method. The method that should not be the last method, but
              // the second last method. The last method should be GOAL.
              item.method.push(GOAL);
              item.method[item.method.length-2] = method;
              
              // Register new path
              paths[orig.route[0]][target] = item;
            },
            
            key;
        
        // Loop all types
        for (key in types) {
          // Register root path
          registerRoot(key);
          
          // If this type has not been traversed yet, we start the traversing.
          if (done[key] === undefined) {
            find(key);
          }
        }
        
        return paths;
      }
    (conversionTypes)),
    
    // List of preferred conversion paths. Uses the outweighs parameter to 
    // identify this.
    conversionLogic = (
      function(types) {
            // Prepare empty result
        var output = {},
            
            // Build the list of preferred paths for a type. If self is true
            // the dummy route to the type itself is also included. This 
            // parameter (default true) is false when recursively called.
            construct = function(type, self) {
                  // Prepare empty result
              var result = [],
                  
                  key, key2, result2;
                  
              // include type itself as possible target if self is true
              if (self === undefined || self === true) {
                result.push(type);
              }
              
              // loop over all types
              for (key in types) {
                // If found type outweight the type we're looking at
                if (types[key].outweighs !== undefined && 
                    inarray(types[key].outweighs, type)
                ) {
                    // Add the found type to the possible targets
                    result.push(key);
                    
                    // Find the types that outweight the found type and add
                    // those too.
                    result2 = construct(key, false);
                    for (key2 in result2) {
                      result.push(result2[key2]);
                    }
                  }
                }
              }
              
              return result;
            },
            
            key;
        
        // Loop all types
        for (key in types) {
          output[key] = construct(key);
        }
        
        return output;
      }
    )(conversionTypes);

/**
 * Status container. Based on promise code from kriszyp, but much simpler.
 * 
 * A status object has 3 statuses. When pending, it is waiting for an operation
 * to be finished. When resolved, the operation is finished and succeeded. In
 * general the operation results in some value that is stored in the status 
 * object. When rejected, the operation is finished, but resulted in an error.
 * The error message is saved into the status object.
 * The basic idea is that a piece of code can create a status object which 
 * in which it will store the result of some asynchronous operation. Even when
 * the operation has not finished yet, some other code can register a callback
 * on the status object, that will be called when the status object received
 * data.
 *
 * TODO: Refactor this to a separate library.
 */
var Status = function(value) {
  // Create empty list for the callbacks
  this.callbacks = [];
  
  // If a value is specified at construction, the object is already resolved.
  // This is useful when some start data is always available, but you want to
  // handle it the same way as asynchronously created intermediate data.
  if (value === undefined) {
    this.status = Status.PENDING;
  } else {
    this.status = Status.RESOLVED;
    this.value = value;
  }
};
// Statuses for the status objects
Status.PENDING = 0;
Status.RESOLVED = 1;
Status.REJECTED = -1;

// Call this method when the operation, that the status object is waiting for, 
// succeeded.
Status.prototype.resolve = function(value) {
  this.status = Status.RESOLVED;
  this.value = value;
  this.notifyAll();
};
// Call this method when the operation, that the status object is waiting for,
// failed.
Status.prototype.reject = function(msg) {
  this.status = Status.REJECTED;
  this.error = new Error(msg);
  this.notifyAll();
};
// Notify all callback of the status
Status.prototype.notifyAll = function() {
  var i;
  
  for (i in this.callbacks) {
    this.notify(this.callbacks[i]);
  }
};
// Notify a callback of the status.
Status.prototype.notify = function(callback) {
  var self = this;
  
  // if resolved, send the value
  if (this.status === Status.RESOLVED) {
    process.nextTick(function() {
      callback(null, self.value);
    });
  // if failed, send the error
  } else {
    process.nextTick(function() {
      callback(self.error);
    });
  }
};
// Register a callback, that will be notified when the operation the status
// object is waiting for is finished.
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
