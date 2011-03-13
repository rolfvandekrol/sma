var regexps = {
  http: [
    /youtube\.com\/(?:v|embed)\/([^"\&\? ]+)/i,
    /youtube\.com\/(?:watch)?\?v=([^"\& ]+)/i,
    /youtu\.be\/([^"\& ]+)/i
  ]
};

exports.video = {
  convert: {
    from: {
      'http:link': function (id, callback) {
        var m;
        for (i in regexps.http) {
          m = id.match(regexps.http[i]);
          if (m) {
            callback(null, m[1]);
            return
          }
        }
        
        callback(new Error('Invalid youtube URL'));
      }
    },
    to: {
      'http:link': function (id, callback) {
        callback(null, 'http://www.youtube.com/watch?v=' + id);
      }
    }
  },
  outweighs: [
    'http:link'
  ]
  // info: http://code.google.com/apis/youtube/2.0/developers_guide_php.html#Retrieving_Video_Entry
};
