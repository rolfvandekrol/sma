/**
 * Allows properties of an object to have a getter and setter.
 * 
 * This function will initialize a container object that will contain the data
 * you set to it, which will stay encapsulized, such that only the getter and
 * setter can directly access that object.
 * 
 * @param object  The object that will be made avaible as 'this' in the all the
 *   callbacks that are described below.
 * @param options Options object. Recognized options are:
 *   'init': function object that accepts the container as it's first and only 
 *     argument. This function can setup some default values.
 *   'set': function object that accepts the container as it's first argument 
 *     and furthermore an arbitrary number of arguments. This function will be
 *     called when the 'set' function on our return object is called. The 
 *     arguments of that are send to the set function will be prepended with the
 *     container object and then passed through. The return value of the setter
 *     function will be the return value of the 'set' function of the return 
 *     object.
 *   'get': everything that applies to the setter callback, applies to the 
 *     getter callback.
 * @return An object with two keys: 'get' and 'set'.
 */ 
exports.property = function(object, options) {
  var container = {};
  
  if (options === undefined) {
    options = {};
  }
  
  if (options.init !== undefined) {
    options.init.call(object, container);
  }
  
  return {
    get: function() {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(container);
      
      if (options.get !== undefined) {
        return options.get.apply(object, args);
      } else {
        return (function(container) {
          return container.value;
        }).apply(object, args);
      }
    },
    set: function() {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(container);
      
      if (options.set !== undefined) {
        return options.set.apply(object, args);
      } else {
        return (function(container, value) {
          container.value = value;
        }).apply(object, args);
      }
    }
  };
};
