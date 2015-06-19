/**
 * Reads whole configuration from app.locals.config
 * Writes changes to there as well
 */

'use strict';

var COLOR_GREEN = '#00ff00';
var COLOR_RED = '#ff0000';
var COLOR_AMBER = '#ffbf00';
var COLOR_MAGENTA = '#ff00ff';

var COLOR_PASSED = COLOR_GREEN,
    COLOR_FAILED = COLOR_RED,
    COLOR_CONNECTING = COLOR_AMBER,
    COLOR_UPDATING = COLOR_MAGENTA;


var blinkstick = require('blinkstick');
var http = require('http');

// Map of objects
// Key is build id as a string. Value is device object
var deviceBuildMap = {};

// Array of device ID when read from hardware in the very same order
// Is used to try detecting changes in HW configuration without plugging to USB modules
var deviceIdsFromHW = [];

// keeping track of them to kill on reinit
var eventSourcesInProgress = [];

// Counter for fetching-from-hw cycle. Is used to cancel previous iteration if devices are already re-read
// while the previous iteration is still in progress
var deviceIdFindingCycle = 0;


/**
 * @return null if none found
 */
function buildIdForDeviceId(deviceId, config) {

    // @TODO: extract from global to some module such as buildstatus-config
    var config = global.__buildstatusConfig;
    var ini  = require('ini');

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

/**
 * @param status String. Currently only "passed" is supported for green color. Anything else is treated as "failed"
 */
function updateBuildStatus(device, status) {
    // console.log('updateBuildStatus with ', status);
    var targetColor = COLOR_FAILED;
    if(status == 'passed') {
        targetColor = COLOR_PASSED;
    }
    // console.log('chosen targetColor is ', targetColor);

    // Show 'updating' color for a while
    // Some nice soft animation could be here in the future
    device.morph( COLOR_UPDATING );
    setTimeout(function() {
        // console.log('timeout hit, targetColor is ', targetColor);
        device.morph(targetColor);
    }, 1000);
}

// intervals in sec to try reiniting after unsuccessful connection
var currentReinitCounterIdx = 0;
var retryingInProgress = false;
var reinitCounters = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 253, 600, 1000, 2000, 4000, 10000];

function retryInitingLater() {
    if(retryingInProgress) {
        console.log('Retrying ordered while previous one is still being served. Ignoring');
        return;
    }
    if(currentReinitCounterIdx +1 > reinitCounters.length) {
        console.log('Tried max amount of retries(' + currentReinitCounterIdx + ' - '
            + reinitCounters[currentReinitCounterIdx] + ' sec), giving up, no killing the process');
        process.exit(0);
    }
    retryingInProgress = true;
    console.log('Will retry connecting in ' + reinitCounters[currentReinitCounterIdx] + ' sec');
    setTimeout(function() {
        console.log('Retrial timeout happened, calling initDevices');
        retryingInProgress = false;
        initDevices();
    }, reinitCounters[currentReinitCounterIdx++] * 1000);
}


function initAndStartWatching(device, buildId) {
    console.log('initAndStartWatching for buildId', buildId)
    device.morph( COLOR_CONNECTING );

    var EventSource = require('eventsource');
    var config = global.__buildstatusConfig;
    var apiAddr = config.apiAddress;

    // First request for the initial status and then start monitoring live
    http.get(apiAddr + '/builds/' + buildId, function(res) {
        console.log('initial res status code: ', res.statusCode);
        if(res.statusCode !== 200) {
            console.error('Initial req for build id ' + buildId + " resulted in " + res.statusCode + ", will retry later");
            retryInitingLater();
        } else {
            currentReinitCounterIdx = 0;
            // Continuously update stream with data
            var body = '';
            res.on('data', function(d) {
                // console.log('init res chunk: ', d)
                body += d;
            });
            res.on('end', function() {
                // console.log('init res end, fetched body is ', body)

                // Data reception is done, do whatever with it!
                var initialBuildState = JSON.parse(body);
                updateBuildStatus(device, initialBuildState.current_status);

                var es = new EventSource(apiAddr + '/live/' + buildId);
                eventSourcesInProgress.push(es);
                es.onmessage = function(e) {
                  console.log(e.data);
                };
                es.onerror = function(e) {
                  // Any error -> close all the event sources and reinit everything
                  console.log('ERROR!', e, 'readyState: ', es.readyState + ', reiniting everything');
                  initDevices();
                };
                es.addEventListener('update', function(event) {
                    console.log('UPDATE(' + event.lastEventId + '): ' + event.data);
                    var eventObj = JSON.parse(event.data);
                    updateBuildStatus(device, eventObj.currentStatus);
                });

            });
        }
    }).on('error', function(e) {
      console.log("Got http error: " + e.message);
    });;
}

// Common initialization
var initDevices = function() {
    deviceIdFindingCycle = deviceIdFindingCycle +1;
    var i;
    for(i=0; i < eventSourcesInProgress.length; i++) {
        console.log('initDevices: closing old eventSource');
        eventSourcesInProgress[i].close();
    }
    eventSourcesInProgress = [];
    deviceIdsFromHW = [];
    var hwDevices = blinkstick.findAll();
    console.log('initDevices: found ' + hwDevices.length + ' devices');
    var devicesInitedCnt = 0;
    if(hwDevices.length === 0) {
        console.log('No connected devices found, starting monitoring')
        startMonitoringChanges();
    }
    // console.log('hwDevices:', hwDevices);
    for(var i=0; i<hwDevices.length; i++) {
        var hwDevice = hwDevices[i];
        hwDevice.morph('#000000');

        // closure for passing 'current' device reference for when its name is fetched
        var analyzeAndBindDevice = function(device, forCycleId) {
            hwDevice.getSerial(function(err, data) {
                if(forCycleId !== deviceIdFindingCycle) {
                    console.log('found serial for a cycle ' +forCycleId + " while current cycle is "
                        + deviceIdFindingCycle + ", so ignoring this serial");
                    return;
                }
                deviceIdsFromHW.push(data);
                // console.log('pushed ', data, 'array is now', deviceIdsFromHW);
                var buildId = buildIdForDeviceId(data);
                if(buildId) {
                    console.log('for device ', data, 'found build ', buildId)
                    deviceBuildMap[buildId] = device;
                    initAndStartWatching(device, buildId);
                    devicesInitedCnt = devicesInitedCnt+1;
                    if(devicesInitedCnt === hwDevices.length) {
                        startMonitoringChanges();
                    }
                }
            });
        }(hwDevice, deviceIdFindingCycle);
    }
};


// Keep refreshing the device list
// In case of any difference with the reported list of devices we assume some insertion-removal of USB has
// happened and we reinit everything
function startMonitoringChanges() {
    var interval = setInterval(function() {
        // console.log('rechecking device list');
        var hwDevices = blinkstick.findAll();
        if(hwDevices.length !== deviceIdsFromHW.length) {
            console.log('Number of devices connected has changed. Was ' + deviceIdsFromHW.length + ', now ' + hwDevices.length);
            console.log('Number of devices connected has changed, stop monitor and reinit');
            clearInterval(interval);
            initDevices();
        } else {
            for(var i=0; i<hwDevices.length; i++) {
                var hwDevice = hwDevices[i];
                var checkIfSerialIsStillTheSame = function(idx) {
                    hwDevice.getSerial(function(err, data) {
                        // console.log('comparing ', data, ' and ', deviceIdsFromHW[idx]);
                        if(data !== deviceIdsFromHW[idx]) {
                            console.log('deviceId changed, stop monitor and reinit');
                            clearInterval(interval);
                            initDevices();
                        }
                    })
                }(i);
            }
        }

    }, 1000);
}

initDevices();


// Get list of builds
exports.index = function(req, res) {
    res.render('devices', { title: 'Device list' });
};

