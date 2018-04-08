# mqtt-scripts

[![NPM version](https://badge.fury.io/js/mqtt-scripts.svg)](http://badge.fury.io/js/mqtt-scripts)
[![Dependency Status](https://img.shields.io/gemnasium/hobbyquaker/mqtt-scripts.svg?maxAge=2592000)](https://gemnasium.com/github.com/hobbyquaker/mqtt-scripts)
[![Build Status](https://travis-ci.org/hobbyquaker/mqtt-scripts.svg?branch=master)](https://travis-ci.org/hobbyquaker/mqtt-scripts)
[![Coverage Status](https://coveralls.io/repos/github/hobbyquaker/mqtt-scripts/badge.svg?branch=master)](https://coveralls.io/github/hobbyquaker/mqtt-scripts?branch=master)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![License][mit-badge]][mit-url]

> mqtt-scripts is a Node.js based script runner for use in mqtt based smart home environments. 

It's intentended to be used as the "logic layer" in your smart home, and offers a zero-boilerplate, straight forward 
scripting environment.

It follows the [mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome) architecture. Mqtt-scripts could be 
seen as something like "Node-RED without GUI"


# Getting started

Prerequisites: mqtt-scripts needs Node.js >= 6.0.

* Install mqtt-scripts globally:

```sudo npm install -g mqtt-scripts```

* Create a folder from where mqtt-scripts will load the scripts:

```mkdir -p /opt/mqtt-smarthome/scripts```

* Create a folder to install node modules that can be used in the scripts:

```mkdir /opt/mqtt-smarthome/scripts/node_modules```    
(You can then just use npm install in the directory /opt/mqtt-smarthome/scripts)

* Put some files in you script dir:

```
echo "log.info('my first script!')" > /opt/mqtt-smarthome/scripts/test1.js
echo "log.info 'get ma a coffee' > /opt/mqtt-smarthome/scripts/test1.coffee
```   

* Start mqtt-scripts

```mqtt-scripts -d /opt/mqtt-smarthome/scripts```  


# Command Line Options

<pre>
Usage: mqtt-scripts [options]

Options:
  -v, --verbosity          possible values: "error", "warn", "info", "debug"
                                                               [default: "info"]
  -n, --name               instance name. used as mqtt client id and as prefix
                           for connected topic                [default: "logic"]
  -s, --variable-prefix    topic prefix for $ substitution (shorthand for
                           variables, see docs)                 [default: "var"]
  -t, --disable-variables  disable variable feedback (see docs)
                                                                [default: false]
  -u, --url                mqtt broker url. See https://github.com/mqttjs/MQTT.
                           js#connect-using-a-url  [default: "mqtt://127.0.0.1"]
  -h, --help               Show help                                  
  -d, --dir                directory to scan for .js and .coffee files. can be
                           used multiple times.
  -w, --disable-watch      disable file watching (don't exit process on file
                           changes)                             
  --version                Show version number                        
  -l, --latitude           Coordinates are needed for the sunSchedule method                                  
  -m, --longitude                                             
</pre>

If you're running multiple instances of mqtt-scripts you have to decide which one should handle variables and disable 
the variables on all other instances with the --disable-variable option.


# Script Examples

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

# API

## Classes

<dl>
<dt><a href="#log">log</a></dt>
<dd><p>Log to stdout/stderr. Messages are prefixed with a timestamp and the calling scripts path.</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#subscribe">subscribe(topic, [options], callback)</a></dt>
<dd><p>Subscribe to MQTT topic(s)</p>
</dd>
<dt><a href="#schedule">schedule(pattern, [options], callback)</a></dt>
<dd><p>Schedule recurring and one-shot events</p>
</dd>
<dt><a href="#sunSchedule">sunSchedule(pattern, [options], callback)</a></dt>
<dd><p>Schedule a recurring event based on sun position</p>
</dd>
<dt><a href="#publish">publish(topic, payload, [options])</a></dt>
<dd><p>Publish a MQTT message</p>
</dd>
<dt><a href="#setValue">setValue(topic, val)</a></dt>
<dd><p>Set a value on one or more topics</p>
</dd>
<dt><a href="#getValue">getValue(topic)</a> ⇒ <code>mixed</code></dt>
<dd></dd>
<dt><a href="#getProp">getProp(topic, [...property])</a> ⇒ <code>mixed</code></dt>
<dd><p>Get a specific property of a topic</p>
</dd>
<dt><a href="#now">now()</a> ⇒ <code>number</code></dt>
<dd></dd>
<dt><a href="#age">age(topic)</a> ⇒ <code>number</code></dt>
<dd></dd>
<dt><a href="#link">link(source, target, [value])</a></dt>
<dd><p>Link topic(s) to other topic(s)</p>
</dd>
<dt><a href="#combineBool">combineBool(srcs, targets)</a></dt>
<dd><p>Combine topics through boolean or</p>
</dd>
<dt><a href="#combineMax">combineMax(srcs, targets)</a></dt>
<dd><p>Publish maximum of combined topics</p>
</dd>
<dt><a href="#timer">timer(src, target, time)</a></dt>
<dd><p>Publishes 1 on target for specific time after src changed to true</p>
</dd>
</dl>

## Typedefs

<dl>
<dt><a href="#subscribeCallback">subscribeCallback</a> : <code>function</code></dt>
<dd></dd>
</dl>

<a name="log"></a>

## log
Log to stdout/stderr. Messages are prefixed with a timestamp and the calling scripts path.

**Kind**: global class  

* [log](#log)
    * [.debug()](#log.debug)
    * [.info()](#log.info)
    * [.warn()](#log.warn)
    * [.error()](#log.error)

<a name="log.debug"></a>

### log.debug()
Log a debug message

**Kind**: static method of [<code>log</code>](#log)  

| Type |
| --- |
| <code>\*</code> | 

<a name="log.info"></a>

### log.info()
Log an info message

**Kind**: static method of [<code>log</code>](#log)  

| Type |
| --- |
| <code>\*</code> | 

<a name="log.warn"></a>

### log.warn()
Log a warning message

**Kind**: static method of [<code>log</code>](#log)  

| Type |
| --- |
| <code>\*</code> | 

<a name="log.error"></a>

### log.error()
Log an error message

**Kind**: static method of [<code>log</code>](#log)  

| Type |
| --- |
| <code>\*</code> | 

<a name="subscribe"></a>

## subscribe(topic, [options], callback)
Subscribe to MQTT topic(s)

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| topic | <code>string</code> \| <code>Array.&lt;string&gt;</code> | topic or array of topics to subscribe |
| [options] | <code>Object</code> \| <code>string</code> \| <code>function</code> | Options object or as shorthand to options.condition a function or string |
| [options.shift] | <code>number</code> | delay execution in seconds. Has to be positive |
| [options.random] | <code>number</code> | random delay execution in seconds. Has to be positive |
| [options.change] | <code>boolean</code> | if set to true callback is only called if val changed |
| [options.retain] | <code>boolean</code> | if set to true callback is also called on retained messages |
| [options.condition] | <code>string</code> \| <code>function</code> | conditional function or condition string |
| callback | [<code>subscribeCallback</code>](#subscribeCallback) |  |

<a name="schedule"></a>

## schedule(pattern, [options], callback)
Schedule recurring and one-shot events

**Kind**: global function  
**See**: [sunSchedule](#sunSchedule) for scheduling based on sun position.  

| Param | Type | Description |
| --- | --- | --- |
| pattern | <code>string</code> \| <code>Date</code> \| <code>Object</code> \| <code>Array.&lt;mixed&gt;</code> | pattern or array of patterns. May be cron style string, Date object or node-schedule object literal. See [https://github.com/tejasmanohar/node-schedule/wiki](https://github.com/tejasmanohar/node-schedule/wiki) |
| [options] | <code>Object</code> |  |
| [options.random] | <code>number</code> | random delay execution in seconds. Has to be positive |
| callback | <code>function</code> | is called with no arguments |

**Example**  
```js
// every full Hour.
schedule('0 * * * *', callback);

// Monday till friday, random between 7:30am an 8:00am
schedule('30 7 * * 1-5', {random: 30 * 60}, callback);

// once on 21. December 2018 at 5:30am
schedule(new Date(2018, 12, 21, 5, 30, 0), callback);

// every Sunday at 2:30pm
schedule({hour: 14, minute: 30, dayOfWeek: 0}, callback);
```
<a name="sunSchedule"></a>

## sunSchedule(pattern, [options], callback)
Schedule a recurring event based on sun position

**Kind**: global function  
**See**: [schedule](#schedule) for time based scheduling.  

| Param | Type | Description |
| --- | --- | --- |
| pattern | <code>string</code> \| <code>Array.&lt;string&gt;</code> | a suncalc event or an array of suncalc events. See [https://github.com/mourner/suncalc](https://github.com/mourner/suncalc) |
| [options] | <code>Object</code> |  |
| [options.shift] | <code>number</code> | delay execution in seconds. Allowed Range: -86400...86400 (+/- 24h) |
| [options.random] | <code>number</code> | random delay execution in seconds. |
| callback | <code>function</code> | is called with no arguments |

**Example**  
```js
// Call callback 15 minutes before sunrise
sunSchedule('sunrise', {shift: -900}, callback);

// Call callback random 0-15 minutes after sunset
sunSchedule('sunset', {random: 900}, callback);
```
<a name="publish"></a>

## publish(topic, payload, [options])
Publish a MQTT message

**Kind**: global function  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| topic | <code>string</code> \| <code>Array.&lt;string&gt;</code> |  | topic or array of topics to publish to |
| payload | <code>string</code> \| <code>Object</code> |  | the payload string. If an object is given it will be JSON.stringified |
| [options] | <code>Object</code> |  | the options to publish with |
| [options.qos] | <code>number</code> | <code>0</code> | QoS Level |
| [options.retain] | <code>boolean</code> | <code>false</code> | retain flag |

<a name="setValue"></a>

## setValue(topic, val)
Set a value on one or more topics

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| topic | <code>string</code> \| <code>Array.&lt;string&gt;</code> | topic or array of topics to set value on |
| val | <code>mixed</code> |  |

<a name="getValue"></a>

## getValue(topic) ⇒ <code>mixed</code>
**Kind**: global function  
**Returns**: <code>mixed</code> - the topics value  

| Param | Type |
| --- | --- |
| topic | <code>string</code> | 

<a name="getProp"></a>

## getProp(topic, [...property]) ⇒ <code>mixed</code>
Get a specific property of a topic

**Kind**: global function  
**Returns**: <code>mixed</code> - the topics properties value  

| Param | Type | Description |
| --- | --- | --- |
| topic | <code>string</code> |  |
| [...property] | <code>string</code> | the property to retrieve. May be repeated for nested properties. If omitted the whole topic object is returned. |

**Example**  
```js
// returns the timestamp of a given topic
getProp('hm//Bewegungsmelder Keller/MOTION', 'ts');
```
<a name="now"></a>

## now() ⇒ <code>number</code>
**Kind**: global function  
**Returns**: <code>number</code> - ms since epoch  
<a name="age"></a>

## age(topic) ⇒ <code>number</code>
**Kind**: global function  
**Returns**: <code>number</code> - seconds since last change  

| Param | Type |
| --- | --- |
| topic | <code>string</code> | 

<a name="link"></a>

## link(source, target, [value])
Link topic(s) to other topic(s)

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| source | <code>string</code> \| <code>Array.&lt;string&gt;</code> | topic or array of topics to subscribe |
| target | <code>string</code> \| <code>Array.&lt;string&gt;</code> | topic or array of topics to publish |
| [value] | <code>mixed</code> | value to publish. If omitted the sources value is published. |

<a name="combineBool"></a>

## combineBool(srcs, targets)
Combine topics through boolean or

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| srcs | <code>Array.&lt;string&gt;</code> | array of topics to subscribe |
| targets | <code>string</code> | topic to publish |

<a name="combineMax"></a>

## combineMax(srcs, targets)
Publish maximum of combined topics

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| srcs | <code>Array.&lt;string&gt;</code> | array of topics to subscribe |
| targets | <code>string</code> | topic to publish |

<a name="timer"></a>

## timer(src, target, time)
Publishes 1 on target for specific time after src changed to true

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| src | <code>string</code> \| <code>Array.&lt;string&gt;</code> | topic or array of topics to subscribe |
| target | <code>string</code> | topic to publish |
| time | <code>number</code> | timeout in milliseconds |

<a name="subscribeCallback"></a>

## subscribeCallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| topic | <code>string</code> | the topic that triggered this callback. +/status/# will be replaced by +//# |
| val | <code>mixed</code> | the val property of the new state |
| obj | <code>object</code> | new state - the whole state object (e.g. {"val": true, "ts": 12346345, "lc": 12346345} ) |
| objPrev | <code>object</code> | previous state - the whole state object |
| msg | <code>object</code> | the mqtt message as received from MQTT.js |


# License


MIT © [Sebastian Raff](https://github.com/hobbyquaker)

[mit-badge]: https://img.shields.io/badge/License-MIT-blue.svg?style=flat
[mit-url]: LICENSE
