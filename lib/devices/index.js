/**
 * Reads whole configuration from app.locals.config
 * Writes changes to there as well
 */

// 'use strict';

var http = require('http');
var buildDeviceConfig = require('../builddeviceconfig');
var hwDevicesLib = require('../hwdevices');
var EventSource = require('eventsource');

// keeping track of them to kill on reinit
var eventSourcesInProgress = [];

// TODO: initalize somewhere higher?
var apiAddr = global.__buildstatusConfig.apiAddress;


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
    apiAddr = config.apiAddress;

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

function fetchBuildStatusAndMonitor(buildId, deviceId) {

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
                hwDevicesLib.updateBuildStatus(deviceId, initialBuildState.current_status);

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
    });
}


// TODO: Maybe close only really old irrelevant event sources, not all of them on every device discovery
function hwDeviceFound(/*deviceId*/) {
	console.log("hwDeviceFound: " + deviceId +
		', all devices known: ' + hwDevicesLib.knownHwDevices());
	var knownDevices = hwDevicesLib.knownHwDevices();
    for(var i=0; i < eventSourcesInProgress.length; i++) {
        console.log('initDevices: closing old eventSource');
        eventSourcesInProgress[i].close();
    }
    eventSourcesInProgress = [];
    for(var i=0; i < knownDevices.length; i++) {
        var deviceId = knownDevices[i];
        var buildId = buildDeviceConfig.buildIdForDeviceId(deviceId);
        if(buildId) {
            console.log('for device ', deviceId, 'found build ', buildId)
            fetchBuildStatusAndMonitor(buildId, deviceId);
            
        } else {
            console.log("Can't find a build for device with id " + buildId);
        }
    }
}

// Common initialization
var initDevices = function() {
	hwDevicesLib.initAndMonitor(hwDeviceFound);
};

module.exports.initDevices = initDevices;