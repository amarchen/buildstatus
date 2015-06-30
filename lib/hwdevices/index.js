/**
 * Maintains a list of HW devices connected. Calls back on the list change
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

// Counter for fetching-from-hw cycle. Is used to cancel previous iteration if devices are already re-read
// while the previous iteration is still in progress
var deviceIdFindingCycle = 0;

// Array of device ID when read from hardware in the very same order
// Is used to try detecting changes in HW configuration without plugging to USB modules
var deviceIdsFromHW = [];

/**
 * Key: device Id
 * Value: device object
 */
var deviceByIdMap = {};

// Keep refreshing the device list
// In case of any difference with the reported list of devices we assume some insertion-removal of USB has
// happened and we reinit everything
// @param changeDetected Callback function. Is called whenever a change is detected
function startMonitoringHwChanges(changeDetected) {
	console.log('startMonitoringHwChanges');
    var interval = setInterval(function() {
        // console.log('rechecking device list');
        var hwDevices = blinkstick.findAll();
        var somethingHasChanged = false;
        if(hwDevices.length !== deviceIdsFromHW.length) {
            console.log('Number of devices connected has changed. Was ' + deviceIdsFromHW.length + ', now ' + hwDevices.length);
            console.log('Number of devices connected has changed, stop monitor and reinit');
            clearInterval(interval);
            somethingHasChanged = true;
            changeDetected();
        } else {
            for(var i=0; i<hwDevices.length; i++) {
                var hwDevice = hwDevices[i];
                var checkIfSerialIsStillTheSame = function(idx) {
                    hwDevice.getSerial(function(err, data) {
                    	if(somethingHasChanged) {
                    		console.log("Monitor was about to check the HW id, but some change is already identified, so not doing it");
                    		return;
                    	}
                        // console.log('comparing ', data, ' and ', deviceIdsFromHW[idx]);
                        if(data !== deviceIdsFromHW[idx]) {
                            console.log('deviceId changed, reporting and stopping the monitoring');
                            clearInterval(interval);
                            somethingHasChanged = true;
                            changeDetected();
                        }
                    })
                }(i);
            }
        }

    }, 1000);
}

/**
 * (Re)initializes device list and starts monitoring changes
 * @param deviceFound function(deviceId) called when a new device is found
 */
function initAndMonitor( deviceFound ) {
	deviceIdFindingCycle = deviceIdFindingCycle +1;

	deviceIdsFromHW = [];
    var hwDevices = blinkstick.findAll();
    console.log('initAndMonitor: found ' + hwDevices.length + ' devices');
    var devicesInitedCnt = 0;
    if(hwDevices.length === 0) {
        console.log('initAndMonitor: No connected devices found, starting monitoring')
        startMonitoringChanges();
    }


    function changeInHwDevicesFound() {
    	console.log("changeInHwDevicesFound");
    	initAndMonitor(deviceFound);
    }

    // console.log('hwDevices:', hwDevices);
    for(var i=0; i<hwDevices.length; i++) {
        var hwDevice = hwDevices[i];
        // console.log('abt to fetch id for device ', hwDevice);
        hwDevice.morph('#000000');

        // closure for passing 'current' device reference for when its name is fetched
        var analyzeDevice = function(device, forCycleId) {
            hwDevice.getSerial(function(err, data) {
                // console.log('getSerial callback for ', device)
                if(forCycleId !== deviceIdFindingCycle) {
                    console.log('found serial for a cycle ' +forCycleId + " while current cycle is "
                        + deviceIdFindingCycle + ", so ignoring this serial");
                    return;
                }
                console.log("initAndMonitor: found device with id " + data);
                deviceIdsFromHW.push(data);
                deviceByIdMap[data] = device;
                // console.log('storing for id ', data, 'device', device);
                if(deviceFound) {
                	deviceFound(data);
            	} else {
            		console.log("initAndMonitor: not reporting device found as callback is not defined");
            	}
                startMonitoringHwChanges(changeInHwDevicesFound);
            });
        }(hwDevice, deviceIdFindingCycle);
    }
}

/**
 * Returns an array of all known connected device ids
 */
function knownHwDevices() {
	return deviceIdsFromHW;
}

/**
 * Morphs given device to a given color. If deviceId is unknown, nothing happens
 */ 
function morph(deviceId, color) {
	var device = deviceByIdMap[deviceId];
	if(!device) {
		console.log("morph: device for device id " + deviceId + " not found");
		return;
	}
	device.morph(color);
}

/**
 * @param deviceId If not found nothing happens, function silently succeeds
 * @param status String. Currently only "passed" is supported for green color. Anything else is treated as "failed"
 */
function updateBuildStatus(deviceId, status) {
    console.log('updateBuildStatus for device ' + deviceId + ' with ', status);
    var device = deviceByIdMap[deviceId];
    if(!device) {
        console.log('updateBuildStatus: Failed to find device for dev id ' + deviceId + ', ignoring');
        return;
    }
    // console.log('device to be updated: ', device);

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

module.exports.initAndMonitor = initAndMonitor;
module.exports.knownHwDevices = knownHwDevices;
module.exports.updateBuildStatus = updateBuildStatus;