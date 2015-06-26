/**
 * Reads whole configuration from app.locals.config
 * Writes changes to there as well
 */

 /**
 * @return null if none found
 */
function buildIdForDeviceId(deviceId, config) {

    // @TODO: extract from global to some module such as buildstatus-config
    var config = global.__buildstatusConfig;
    
    var i;
    for(i = 0; i < config.devices.length; i++) {
        var str = config.devices[i];
        var item = JSON.parse(str);
        if(item[deviceId]) {
            return item[deviceId];
        }
    }
    return null;
}

module.exports.buildIdForDeviceId = buildIdForDeviceId;