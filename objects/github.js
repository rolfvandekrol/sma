var regexps = {
  http: [
    /github\.com\/([^"\&\? ]+)\/([^"\&\? ]+)/i,
  ]
};

exports.repository = {
  convert: {
    from: {
      'http:link': function (id, callback) {
        var m;
        for (i in regexps.http) {
          m = id.match(regexps.http[i]);
          if (m) {
            callback(null, m[1] + '/' + m[2]);
            return
          }
        }
        
        callback(new Error('Invalid github URL'));
      }
    },
    to: {
      'http:link': function (id, callback) {
        callback(null, 'http://github.com/' + id);
      }
    }
  },
  outweighs: [
    'http:link'
  ]
  // info: http://code.google.com/apis/youtube/2.0/developers_guide_php.html#Retrieving_Video_Entry
};
