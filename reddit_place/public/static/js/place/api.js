!r.placeModule('api', function(require) {
  var r = require('r');
  var buildFullURL = function(url) {
    if (window.location.hostname == "oauth.reddit.com") {
      return window.location.protocol + "//www.reddit.com" + url;
    }
    return window.location.protocol + "//" + window.location.hostname + url;
  };
  var injectedHeaders = {};

  // Collection of functions that call out to the backend API.
  // All requests made to the banckend from the client are defined here.
  return {
    injectHeaders: function(headers) {
      injectedHeaders = headers;
    },

    /**
     * POST to the draw API
     * @function
     * @param {int} x,
     * @param {int} y,
     * @param {int} color index
     * @returns {Promise}
     */
    draw: function(x, y, color) {
      return r.ajax({
        url: '/api/place/draw.json',
        type: 'POST',
        headers: injectedHeaders,
        data: {
          x: x,
          y: y,
          color: color,
        },
      });
    },

    /**
     * GET a bitmap representation of the board state
     * @function
     * @returns {Promise}
     */
    getCanvasBitmapState: function() {
      var dfd = $.Deferred();

      var timestamp;
      var canvas = new Uint8Array(r.config.place_canvas_width * r.config.place_canvas_height);
      var offset = 0;

      /**
       * Handle a single "chunk" or response data.
       * This modifies the local timestamp, canvas, and offset variables.
       * @function
       * @param {Uint8Array} responseArray
       */
      function handleChunk(responseArray) {
        // If we haven't set the timestamp yet, slice it off of this chunk
        if (!timestamp) {
          timestamp = (new Uint32Array(responseArray.buffer, 0, 1))[0],
          responseArray = new Uint8Array(responseArray.buffer, 4);
        }
        // Each byte in the responseArray represents two values in the canvas
        for (var i = 0; i < responseArray.byteLength; i++) {
          canvas[offset + 2 * i] = responseArray[i] >> 4;
          canvas[offset + 2 * i + 1] = responseArray[i] & 15;
        }
        offset += responseArray.byteLength * 2;
      }

      if (window.fetch) {
        // If the fetch API is available, use it so we can process the response
        // in chunks as it comes in.
        // TODO - should we render the board as it streams in?
        fetch(buildFullURL("/api/place/board-bitmap"), { credentials: 'include' })
          .then(function(res) {
            function next(reader) {
              reader.read().then(function(chunk) {
                if (chunk.done) {
                  dfd.resolve(timestamp, canvas);
                } else {
                  handleChunk(chunk.value);
                  next(reader);
                }
              });
            }
            next(res.body.getReader());
          });
      } else {
        // Fall back to using a normal XHR request.
        var oReq = new XMLHttpRequest();
        oReq.responseType = "arraybuffer";
        var resp = oReq.open("GET", buildFullURL("/api/place/board-bitmap"), true);

        oReq.onload = function (oEvent) {
          var arrayBuffer = oReq.response;
          if (!arrayBuffer) { dfd.resolve(); }
          var responseArray = new Uint8Array(arrayBuffer);
          handleChunk(responseArray);
          dfd.resolve(timestamp, canvas);
        };

        oReq.send(null);
      }

      return dfd.promise();
    },

    /**
     * GET the amount of time remaining on the current user's cooldown.
     * @function
     * @returns {Promise<number>}
     */
    getTimeToWait: function() {
      return r.ajax({
        url: '/api/place/time.json',
        headers: injectedHeaders,
        type: 'GET',
      }).then(function onSuccess(responseJSON, status, jqXHR) {
        return 1000 * responseJSON.wait_seconds
      });
    },
  };
});
