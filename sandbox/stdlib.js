/* eslint-disable func-name-matching, func-names, camelcase */

module.exports = function (Sandbox) {
    /**
     * @method now
     * @returns {number} ms since epoch
     */
    Sandbox.now = function Sandbox_now() {
        return (new Date()).getTime();
    };

    /**
     * @method age
     * @param {string} topic
     * @returns {number} seconds since last change
     */
    Sandbox.age = function Sandbox_age(topic) {
        return Math.round(((new Date()).getTime() - Sandbox.getProp(topic, 'lc')) / 1000);
    };

    /**
     * Link topic(s) to other topic(s)
     * @method link
     * @param {(string|string[])} source - topic or array of topics to subscribe
     * @param {(string|string[])} target - topic or array of topics to publish
     * @param {mixed} [value] - value to publish. If omitted the sources value is published.
     */
    Sandbox.link = function Sandbox_link(source, target, /* optional */ value) {
        Sandbox.subscribe(source, (topic, val) => {
            val = (typeof value === 'undefined') ? val : value;
            Sandbox.setValue(target, val);
        });
    };

    /**
     * Combine topics through boolean or
     * @method combineBool
     * @param {string[]} srcs - array of topics to subscribe
     * @param {string} targets - topic to publish
     */
    Sandbox.combineBool = function Sandbox_combineBool(srcs, target) {
        function combine() {
            let result = 0;
            srcs.forEach(src => {
                if (Sandbox.getValue(src)) {
                    result = 1;
                }
            });
            Sandbox.setValue(target, result);
        }
        combine();
        Sandbox.subscribe(srcs, {retain: true}, combine);
    };

    /**
     * Publish maximum of combined topics
     * @method combineMax
     * @param {string[]} srcs - array of topics to subscribe
     * @param {string} targets - topic to publish
     */
    Sandbox.combineMax = function (srcs, target) {
        function combine() {
            let result = 0;
            srcs.forEach(src => {
                const srcVal = Sandbox.getValue(src);
                if (srcVal > result) {
                    result = srcVal;
                }
            });
            Sandbox.setValue(target, result);
        }
        combine();
        Sandbox.subscribe(srcs, {retain: true}, combine);
    };

    const timeouts = {};
    /**
     * Publishes 1 on target for specific time after src changed to true
     * @method timer
     * @param {(string|string[])} src - topic or array of topics to subscribe
     * @param {string} target - topic to publish
     * @param {number} time - timeout in milliseconds
     */
    Sandbox.timer = function (src, target, time) {
        Sandbox.subscribe(src, {retain: false}, (topic, val) => {
            if (val) {
                Sandbox.clearTimeout(timeouts[target]);
                if (!Sandbox.getValue(target)) {
                    Sandbox.setValue(target, 1);
                }
                timeouts[target] = Sandbox.setTimeout(() => {
                    if (Sandbox.getValue(target)) {
                        Sandbox.setValue(target, 0);
                    }
                }, time);
            }
        });

        timeouts[target] = Sandbox.setTimeout(() => {
            if (Sandbox.getValue(target)) {
                Sandbox.setValue(target, 0);
            }
        }, time);
    };
};
