# Sending rain data (and other sensor data) to influxdb

This script subscribes to a certain topic and sends all incoming values to influxdb database "iotdata". The values are tagged with a sensor id extracted from the topic.

The script:

```javascript
var request = require('request');

subscribe('sensor/+/rainDelta', function (topic,val,obj,prev,msg) {
        var sensorId=topic.split("/")[1];
        data='rain_amount,sensor='+sensorId+' value='+val;
        request.post({
                url: 'https://influxdb.example.com/write?db=iotdata',
                body: data
        });
});
```
