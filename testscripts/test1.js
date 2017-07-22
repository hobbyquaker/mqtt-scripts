log.info('test log');

subscribe('test//incr', function (topic, val) {
    val += 1;
    setValue(topic, val);
});
