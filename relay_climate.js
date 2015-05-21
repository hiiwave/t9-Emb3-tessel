var relay, climate, wifiAgent;
var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;

var fanController = {
  init: function() {
    this.detectTemp(this.turn);
    this.bindEvents();
  },
  threshold: 31,
  turn: function(b) {
    var channel = 1;
    relay.getState(channel, function (err, state) {
      if (err)  console.log("Err get relay state", err);
      if (b && !state) {
        relay.turnOn(channel, function (err) {
          if (err)  console.log("Err turning on 1", err);
        });
      } else if (!b && state) {
        relay.turnOff(channel, function (err) {
          if (err)  console.log("Err turning off 1", err);
        });
      }
    })
  },
  detectTemp: function(cb) {
    setImmediate(function loop () {
      climate.readTemperature('c', function (err, temp) {
        console.log('Degrees:', temp.toFixed(4) + 'C');
        setTimeout(loop, 2000);
        cb(temp > fanController.threshold);
        fanController.sendStatus(temp, temp > fanController.threshold);
      });
    });
  },
  bindEvents: function() {
    relay.on('latch', function(channel, value) {
      console.log('latch on relay channel ' + channel + ' switched to', value);
    });
    climate.on('error', function(err) {
      console.log('error connecting module', err);
    });
  },
  sendReady : true,
  sendStatus: function(temp_, fanState_) {
    if (!fanController.sendReady)  return;
    if (wifiAgent.state ) {
      console.log("Send a packet");
      var packet = {
        temp: temp_,
        threshold: fanController.threshold,
        state: fanState_
      };
      fanController.postData(JSON.stringify(packet));
    } else {
      console.log("Wifi has not been ready")
    }
  },
  postData: function(data) {
    fanController.sendReady = false;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://t9-dataserver.herokuapp.com/feedfan');
    xhr.onreadystatechange = function(oEvent) {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          console.log('Got response: ' + xhr.responseText);
          fanController.sendReady = true;
        } else {
          console.error("Error: ", xhr.statusText);
          console.log("Retry late..");
          fanController.sendReady = true;
        }
      }
    };
    xhr.send(data);
  }
};

var wifi = require('wifi-cc3000'); 
var wifiAgent = {
  init : function() {
    this.bindEvents();

    // Auto connection seems problematic, pls connect by hand using command "tessel wifi .."
    // this.connect();  
  },
  state : false,
  connect : function() {
    var network = 'esys305-Dlink';
    var pass = '305305abcd';
    var security = 'wpa2';
    var timeouts = 20;
    wifi.connect({
      security: security,
      ssid: network,
      password: pass,
      timeout: 10 // in seconds
    });
  },
  bindEvents : function() {
    wifi.on('connect', function(data) {
      console.log("connect emitted", data);
      wifiAgent.state = true;
      // wifiAgent.testConnection();
    });
    wifi.on('disconnect', function(data) {
      console.log("disconnect emitted", data);
      wifiAgent.state = false;
    })
    wifi.on('timeout', function(err) {
      console.log("timeout emitted");
      timeouts++;
      if (timeouts > 2) {
        // reset the wifi chip if we've timed out too many times
        wifiAgent.powerCycle();
      } else {
        wifiAgent.connect();
      }
    });
    wifi.on('error', function(err) {
      // one of the following happened
      // 1. tried to disconnect while not connected
      // 2. tried to disconnect while in the middle of trying to connect
      // 3. tried to initialize a connection without first waiting for a timeout or a disconnect
      console.log("error emitted", err);
    });    
  },
  powerCycle : function() {
    // when the wifi chip resets, it will automatically try to reconnect
    // to the last saved network
    wifi.reset(function() {
      timeouts = 0; // reset timeouts
      console.log("done power cycling");
      // give it some time to auto reconnect
      setTimeout(function() {
        if (!wifi.isConnected()) {
          // try to reconnect
          wifiAgent.connect();
        }
      }, 20 * 1000); // 20 seconds wait
    })
  },
  testConnection: function() {
    var http = require('http');
    var statusCode = 200;
    var count = 1;

    setImmediate(function start () {
      console.log('http request #' + (count++))
      http.get("http://httpstat.us/" + statusCode, function (res) {
        console.log('# statusCode', res.statusCode)

        var bufs = [];
        res.on('data', function (data) {
          bufs.push(new Buffer(data));
          console.log('# received', new Buffer(data).toString());
        })
        res.on('close', function () {
          console.log('done.');
          setImmediate(start);
        })
      }).on('error', function (e) {
        console.log('not ok -', e.message, 'error event')
        setImmediate(start);
      });
    });
  }
}
wifiAgent.init();

require('tesselate') ({
  modules: {
    A: ['relay-mono', 'relay'],
    C: ['climate-si7020', 'climate']
  }
}, function (tessel, modules) {
  // Function called when all modules are ready
  relay = modules.relay;
  climate = modules.climate;
  // Do something with relay and climate

  fanController.init();
});



