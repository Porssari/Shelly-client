//Init variables
let VERSION = "Shelly-2.0";
print('Pörssäri Control Script ', VERSION)

let CONFIG = {
	updatePeriod: 15000, 
	apiEndpoint: "https://dev.porssari.fi/getcontrols.php", 
	shellyApp: null,
	shellyMac: null,
	shellyFwVer: null,
	deviceChannels: 0,
	returnTimestamps: 10, 
	jsonVersion: 2, 
	jsonChannelNames: false, 
};

let STATE = {
	currentHour: 0,
	currentMinute: 0,
	currentUnixTime: 0,
	deviceInfoOk: false,
	controlsReady: false,
	getcontrolsInit: false,
	doControlsInit: false,
	lastRequest: 0,
	lastRequestHttpCode: null,
	jsonValidUntil: 0,
	controlsJson: '{}',
	channelLastControlTimeStamps: [],
	mainCycleCounter: 20, 
	cyclesUntilRequest: 20, 
};

Shelly.call("Shelly.GetDeviceInfo", {}, function (result) {
	CONFIG.shellyApp = result.app;
	CONFIG.shellyMac = result.mac;
	CONFIG.shellyFwVer = result.ver;
	CheckMac();
});

function CheckMac() {
	if (CONFIG.shellyMac.length > 0) {
		print('Device info: id ', CONFIG.shellyMac, ', firmware version ', CONFIG.shellyFwVer);
	} else {
		print('Could not get valid device-id, rebooting.');
		Shelly.call("Shelly.Reboot");
	}
}

function UpdateStatus() {
	print('Getting Shelly Time. Reboot if json schedule is empty');
	let curTime = new Date(Date.now());
	let timestampMillis = Date.now();      
	STATE.currentUnixTime = Math.floor(timestampMillis / 1000);
	STATE.currentHour = curTime.getHours();
	STATE.currentMinute = curTime.getMinutes();
	if (STATE.getcontrolsInit === true && STATE.jsonValidUntil <= STATE.currentUnixTime) {
		print("Control schedule empty. Rebooting Shelly.");
		Shelly.call("Shelly.Reboot");
	}
}

function ParseHttpResponse(res, error_code, error_msg, ud) {
	let requestInfo = null;
	if (error_code != 0) {
		print("Request error: ", error_code, error_msg);
	} else {
		if (res.code === 200) {
			requestInfo = 'Get controls successful. Code 200.';
			STATE.controlsJson = '{}';
			STATE.controlsJson = JSON.parse(res.body);
			CONFIG.deviceChannels = STATE.controlsJson.metadata.channels;
			STATE.lastRequest = JSON.parse(STATE.controlsJson.metadata.timestamp);
			STATE.jsonValidUntil = JSON.parse(STATE.controlsJson.metadata.valid_until);
			STATE.lastRequestHttpCode = res.code;
			CONFIG.apiEndpoint = STATE.controlsJson.metadata.fetch_url;
			print('Controls JSON parsed.');
			print('Device controlled channels: ', CONFIG.deviceChannels);
			print('Control json valid until: ', STATE.jsonValidUntil);
			print('Api endpoint: ', CONFIG.apiEndpoint);
			STATE.getcontrolsInit = true; 
		} else if (res.code === 400) {
			STATE.lastRequestHttpCode = res.code;
			requestInfo = 'Get controls failed. Bad request. Code: ' + res.code;
		} else if (res.code === 429) {
			STATE.lastRequestHttpCode = res.code;
			requestInfo = 'Get controls failed. Request rate limiter. Code: ' + res.code;
		} else if (res.code === 425) {
			STATE.lastRequestHttpCode = res.code;
			requestInfo = 'Get controls failed. Too fast subsequent requests. Code: ' + res.code;
		} else if (res.code === 304) {
			STATE.lastRequestHttpCode = res.code;
			requestInfo = 'Control settings not changed after last request. No need to update. Code: ' + res.code;
		} else {
			STATE.lastRequestHttpCode = res.code;
			requestInfo = 'Get controls failed. Code: ' + res.code;
		}
	}
	STATE.controlsReady = true;
	STATE.cyclesUntilRequest = 18 + Math.floor(3 * Math.random());
	STATE.mainCycleCounter = 1;
	print('Server request done. ', requestInfo);
}

function getControls() {
	print('Get controls-JSON.');
	let urlToCall = CONFIG.apiEndpoint + "?device_mac=" + CONFIG.shellyMac + "&last_request=" + JSON.stringify(STATE.lastRequest) + "&script_version=" + VERSION + "&client_model=" + CONFIG.shellyApp + "&client_fw=" + CONFIG.shellyFwVer + "&cut_schedule=" + CONFIG.returnTimestamps + "&json_version=" + CONFIG.jsonVersion + "&json_channel_names=" + CONFIG.jsonChannelNames;
	print('URL: ', urlToCall);
	Shelly.call("HTTP.GET", { url: urlToCall, timeout: 10, ssl_ca:"*" }, ParseHttpResponse);
}

function doControls() {
	print('Executing controls.');
	if (STATE.doControlsInit === true) {
		for (var channel in STATE.controlsJson.controls) {
			if (STATE.controlsJson.controls.hasOwnProperty(channel)) {
				let SwitchId = STATE.controlsJson.controls[channel].id - 1;
				for (var ScheduleEntry in STATE.controlsJson.controls[channel].schedules) {
					if (STATE.controlsJson.controls[channel].schedules.hasOwnProperty(ScheduleEntry)) {
						if (STATE.currentUnixTime >= STATE.controlsJson.controls[channel].schedules[ScheduleEntry].timestamp) {
							if (STATE.controlsJson.controls[channel].schedules[ScheduleEntry].timestamp > STATE.channelLastControlTimeStamps[SwitchId]) {
								let ControlState = STATE.controlsJson.controls[channel].schedules[ScheduleEntry].state;
								if (ControlState == 1) {
									controlSwitch(SwitchId, true);
									STATE.channelLastControlTimeStamps[SwitchId] = STATE.controlsJson.controls[channel].schedules[ScheduleEntry].timestamp;
								} else if (ControlState == 0) {
									controlSwitch(SwitchId, false);
									STATE.channelLastControlTimeStamps[SwitchId] = STATE.controlsJson.controls[channel].schedules[ScheduleEntry].timestamp;
								};
							};
						} else if (STATE.controlsJson.controls[channel].updated > STATE.channelLastControlTimeStamps[SwitchId]) {
							print('Switch id ', SwitchId, ' user settings changed after last control. Controlling to current state.');
							let ControlState = STATE.controlsJson.controls[channel].state;
							if (ControlState == 1) {
								controlSwitch(SwitchId, true);
							} else if (ControlState == 0) {
								controlSwitch(SwitchId, false);
							};
							STATE.channelLastControlTimeStamps[SwitchId] = STATE.currentUnixTime;	
						};
					}
				}
			}
		}
	} else {
		print('Initializing controls to current states.');		
		for (var channel in STATE.controlsJson.controls) {
			if (STATE.controlsJson.controls.hasOwnProperty(channel)) {
				let SwitchId = STATE.controlsJson.controls[channel].id - 1;
				let ControlState = STATE.controlsJson.controls[channel].state;
			
				if (ControlState == 1) {
					controlSwitch(SwitchId, true);
				} else if (ControlState == 0) {
					controlSwitch(SwitchId, false);
				};
				STATE.channelLastControlTimeStamps[SwitchId] = STATE.currentUnixTime;	
			}
		}
		STATE.doControlsInit = true;
	};
	print('Controls done.');
}

function controlSwitch(SwitchId, setState) {
	Shelly.call("Switch.Set", { id: SwitchId, on: setState }, null, null);
	if (setState === true) {
		print('Switch id ', SwitchId, 'set ON.');
	} else {
		print('Switch id ', SwitchId, 'set OFF.');
	};
}

function MainCycle() {	
	print('Cycle ', STATE.mainCycleCounter, '/', STATE.cyclesUntilRequest, ' until next request.');
	if (STATE.getcontrolsInit === true) {
		UpdateStatus();
		if (STATE.controlsReady === true) {
			doControls();
		};		
	} else {
	    print('Initial controls data not fetched from server, impossible to do controls');
	}	
	if (STATE.mainCycleCounter >= STATE.cyclesUntilRequest) {
	    STATE.controlsReady = false;
		getControls();
	};	
	STATE.mainCycleCounter++;
}

mainTimer = Timer.set(CONFIG.updatePeriod, true, MainCycle);
