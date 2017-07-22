#!/usr/bin/env node

require('should');

const cp = require('child_process');
const request = require('request');
const path = require('path');
const streamSplitter = require('stream-splitter');
const Mqtt = require('mqtt');
let mqtt = Mqtt.connect('mqtt://127.0.0.1');



const msCmd = path.join(__dirname, '/index.js');
const msArgs = ['-d', __dirname + '/testscripts', '-v', 'debug'];
let ms;
let msPipeOut;
let msPipeErr;
const msSubscriptions = {};
const msBuffer = [];

let subIndex = 0;

function subscribe(type, rx, cb) {
    subIndex += 1;
    if (type === 'sim') {
        simSubscriptions[subIndex] = {rx, cb};
    } else if (type === 'ms') {
        msSubscriptions[subIndex] = {rx, cb};
    }
    matchSubscriptions(type);
    return subIndex;
}

function unsubscribe(type, subIndex) {
    if (type === 'sim') {
        delete simSubscriptions[subIndex];
    } else if (type === 'ms') {
        delete msSubscriptions[subIndex];
    }
}

function matchSubscriptions(type, data) {
    let subs;
    let buf;
    if (type === 'sim') {
        subs = simSubscriptions;
        buf = simBuffer;
    } else if (type === 'ms') {
        subs = msSubscriptions;
        buf = msBuffer;
    }
    if (data) {
        buf.push(data);
    }
    buf.forEach((line, index) => {
        Object.keys(subs).forEach(key => {
            const sub = subs[key];
            if (line.match(sub.rx)) {
                sub.cb(line);
                delete subs[key];
                buf.splice(index, 1);
            }
        });
    });
}

const mqttSubscriptions = {};
function mqttSubscribe(topic, callback) {
    if (mqttSubscriptions[topic]) {
        mqttSubscriptions[topic].push(callback);
    } else {
        mqttSubscriptions[topic] = [callback];
        mqtt.subscribe(topic);
    }
}
mqtt.on('message', (topic, payload) => {
    if (mqttSubscriptions[topic]) {
        mqttSubscriptions[topic].forEach((callback, index) => {
            //console.log('cb', index, topic, payload.toString());
            callback(payload.toString());
        });
    }
});

function startMs() {
    ms = cp.spawn(msCmd, msArgs);
    msPipeOut = ms.stdout.pipe(streamSplitter('\n'));
    msPipeErr = ms.stderr.pipe(streamSplitter('\n'));
    msPipeOut.on('token', data => {
        console.log('ms', data.toString());
        matchSubscriptions('ms', data.toString());
    });
    msPipeErr.on('token', data => {
        console.log('ms', data.toString());
        matchSubscriptions('ms', data.toString());
    });
}



function end(code) {
    if (ms.kill) {
        ms.kill();
    }
    if (typeof code !== 'undefined') {
        process.exit(code);
    }
}

process.on('SIGINT', () => {
    end(1);
});

process.on('exit', () => {
    end();
});

describe('start daemon', () => {
    it('should start without error', function (done) {
        this.timeout(20000);
        subscribe('ms', /mqtt-scripts [0-9.]+ starting/, data => {
            done();
        });
        startMs();
    });
    it('should connect to the mqtt broker', function (done) {
        this.timeout(20000);
        subscribe('ms', /mqtt connected/, data => {
            done();
        });
     });
    it('should subscribe to #', function (done) {
        this.timeout(20000);
        subscribe('ms', /mqtt subscribe #/, data => {
            done();
        });
    });
    it('should publish 2 on logic/connected', function (done) {
        this.timeout(20000);
        mqttSubscribe('logic/connected', payload => {
            if (payload === '2') {
                done();
            }
        });
    });
    it('should load script file', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test\.js loading/, data => {
            done();
        });
    });
    it('should execute script file', function (done) {
        this.timeout(20000);
        subscribe('ms', /testscripts\/test\.js running/, data => {
            done();
        });
    });
});

describe('script execution', () => {
    it('should log a msg', function (done) {
        subscribe('ms', /testscripts\/test\.js: test log/, data => {
            done();
        });
    });
    it('should increase a number', function (done) {
        mqttSubscribe('test/set/incr', payload => {
            if (payload === '5') {
                done();
            }
        });
        mqtt.publish('test/status/incr', '4');
    });
});

describe('setting variables', () => {
    setTimeout(function () {

    }, 1000);
     it('should publish a number', function (done) {

         mqttSubscribe('var/status/testnumber', payload => {
             console.log(payload);
             const state = JSON.parse(payload);
             if (state.val === 1) {
                 done();
             }
         });
         setTimeout(function () {
             mqtt.publish('var/set/testnumber', '1');
         }, 1000);

     });
    it('should publish a string', function (done) {

        mqttSubscribe('var/status/teststring', payload => {
            console.log(payload);
            const state = JSON.parse(payload);
            if (state.val === 'test') {
                done();
            }
        });
        setTimeout(function () {
            mqtt.publish('var/set/teststring', 'test');
        }, 2000);

    });
    it('should publish a bool', function (done) {
        mqttSubscribe('var/status/testbool', payload => {
            console.log(payload);
            const state = JSON.parse(payload);
            if (state.val === true) {
                done();
            }
        });
        setTimeout(function () {
            mqtt.publish('var/set/testbool', 'true');
        }, 3000);

    });

});



setTimeout(() => {
    ms2mqtt.kill();
    process.exit(1);
}, 30000);
