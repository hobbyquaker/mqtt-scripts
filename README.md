# mqtt-scripts

mqtt-scripts is a Node.js based script runner for use in mqtt based smart home environments. 

It's intentended to be used as the "logic layer" in your smart home, and offers a zero-boilerplate, straight forward scripting environment.

It follows the [mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome) architecture. Mqtt-scripts is quite similar to [logic4mqtt](https://github.com/owagner/logic4mqtt) - but allows the usage of modules via the require command.

Mqtt-scripts could also be seen as something like "Node-RED without GUI"


## Documentation

#### Getting started

Prerequisites: mqtt-scripts needs Node.js >= 0.10 or io.js including npm. Node.js 4.0 is recommended.

```sudo npm install -g mqtt-scripts```


Create a folder from where mqtt-scripts will load the scripts:

```mkdir /opt/mqtt-scripts```


Start mqtt-scripts

```mqtt-scripts -d /opt/mqtt-scripts```


Hint: Use [pm2](https://github.com/Unitech/pm2) to control your mqtt-scripts processes, pm2 will also take care of restarting eventually crashed
processes and offers comfortable access to the log output.



### Examples

#### Use hm2mqtt and hue2mqtt to control a hue lamp with a homematic remote control

```javascript
link('hm//RC4:1/PRESS_CONT', 'hue//lights/Hobbyraum/bri_inc', -16);

subscribe('hm//RC4:2/PRESS_CONT', function () {
    if (!getValue('hue//lights/Hobbyraum')) {
        setValue('hue//lights/Hobbyraum', 1);
    } else {
        setValue('hue//lights/Hobbyraum/bri_inc', 16);
    }
});

link('hm//RC4:1/PRESS_SHORT', 'hue//lights/Hobbyraum', 0);
link('hm//RC4:2/PRESS_SHORT', 'hue//lights/Hobbyraum', 254);
link('hm//RC4:3/PRESS_CONT', 'hue//lights/Hobbyraum/ct_inc', -16);
link('hm//RC4:4/PRESS_CONT', 'hue//lights/Hobbyraum/ct_inc', 16);
link('hm//RC4:3/PRESS_SHORT', 'hue//lights/Hobbyraum/ct', 153);
link('hm//RC4:4/PRESS_SHORT', 'hue//lights/Hobbyraum/ct', 500);
```

#### retrieve fuel prices from tankerkoenig

```javascript
var request =   require('request');
var cred =      require('./lib/credentials.js');

var url = 'https://creativecommons.tankerkoenig.de/json/detail.php';

var tankstellen = {
    'OMV': 'cb1f0588-d517-40f0-8ce3-3edadebea40d',
    'Shell': '4267c196-eea1-47be-96b7-d790b2fbd17a'
};

schedule('0/12 * * * *', function () {
    for (var topic in tankstellen) {
        getData(topic, tankstellen[topic]);
    }
});

function getData(topic, id) {
    request.get(url + '?id=' + id + '&apikey=' + cred.tankerkoenig.apikey, function (err, res) {
        if (err) {
            log.error(err);
            return;
        }
        var data = JSON.parse(res.body).station;
        setValue('$Tankstelle/' + topic + '/Diesel',    data.diesel);
        setValue('$Tankstelle/' + topic + '/E5',        data.e5);
        setValue('$Tankstelle/' + topic + '/Offen',     data.isOpen);
    });
}
```

#### Send a variables state changes to Pushover

```Javascript
var cred = require('./lib/credentials.js');

var pushoverNotifications = require('pushover-notifications');

var push = new pushoverNotifications( {
    user: cred.pushover.user,
    token: cred.pushover.token,
    onerror: function (error) {
        log.error(error);
    }
});

function pushover(msg) {
    if (typeof msg !== 'object' || typeof msg.message !== 'string') msg = {message: '' + msg};
    msg.title = msg.title || "Smart Home";
    msg.priority = msg.priority || 0;
    msg.device = msg.device || 'iphone5';
    push.send(msg, function(err, result) {
        if (err) {
            log.error(err);
        }
    });
}

subscribe('$Anwesenheit', {change: true}, function () {
    pushover({
        title:'Anwesenheit',
        message: getProp($Anwesenheit, 'logic_textual'),
        priority: -1
    });
});
```




### Api Docs

see http://hobbyquaker.github.io/mqtt-smarthome/


## License

MIT © [Sebastian Raff](https://github.com/hobbyquaker)


