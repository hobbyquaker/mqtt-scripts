# Calculating interval deltas for a rain gauge (and other counters)

This script calculates deltas on each value from my rain gauge. The gauge behaves in the following way:
- if it rained a certain amount (0.45mm), a counter is increased and the total value is sent via mqtt
- the total value is also published every 30 seconds
- if the device is restarted, the total value starts at zero
- the topic where the total value is published is /sensor/SENSORID/rainTotal

This script calculates the delta between two total value changes and handles some special situations:
- a zero delta is ignored (so no unnecessary updates if it's not raining)
- a delta is ignored when its negative (that happens when the device is restarted)
- a delta is ignored when the previous value is more than 10 minutes old (happens when the script did not run for a while, so the rain cannot be assigned to the correct timestamp)
- a delta is ignored when it's >10mm (that should not happen because a delta should be sent every 0.45mm or at least every 30 seconds - it's just a sanity check)

The result is published via /sensor/SENSORID/rainDelta and can directly be stored to a time series database and then aggregated.

This script can easily be used/modified to do the same calculations for any kind of counter that runs over or is reset from time to time.

The script:

```javascript
subscribe('sensor/+/rainTotal', function (topic,val,obj,prev,msg) {
	var sensorId=topic.split("/")[1]
	var lastValueTopic='sensor/'+sensorId+'/rainLastValue';
	var oldValue=getValue(lastValueTopic)
	if (oldValue!==undefined) {
		var delta=Math.round((val-oldValue.v)*1000)/1000;

		if (now()-oldValue.t>1800000) {
			log.info("sensor ",sensorId,", delta ",delta,"- delta older than 30 minutes ignored");
		} else if (delta<0) {
			log.info("sensor ",sensorId,", delta ",delta,"- negative delta ignored");
		} else if (delta>10) {
			log.info("sensor ",sensorId,", delta ",delta,"- very large delta ignored");
		} else if (delta==0) {
			log.debug("sensor ",sensorId,", delta ",delta,"- zero delta ignored");
		} else {
			log.debug("sensor ",sensorId,", delta ",delta);
			publish('sensor/'+sensorId+'/rainDelta',delta);
		}
	}
	publish(lastValueTopic,{v:val,t:now()},{retain:true});
});
```
