//Init variables
let VERSION = "Shelly-2.0_beta2";
print('Pörssäri Control Script ', VERSION)

let CONFIG = {
	apiEndpoint: "https://dev.porssari.fi/getcontrols_newjson.php",
	shellyId: null,
	shellyMac: null,
	shellyFwVer: null,
	deviceChannels: 0, // Updated during main cycle
	returnTimestamps: 100, // Limit amount of schedule timestamps returned per channel
	updatePeriod: 15000,
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
	mainCycleCounter: 0,
	cyclesUntilRequest: 20, // Set initial value here, updated during main cycle
};
	
// Read config values from Shelly
Shelly.call("Shelly.GetDeviceInfo", {}, function (result) {
	CONFIG.shellyId = result.id;
	CONFIG.shellyMac = result.mac;
	CONFIG.shellyFwVer = result.ver;
	CheckMac();
});

//let ChannelLastControlTimeStamp = {ch0: 0, ch1: 0, ch2: 0, ch3: 0, ch100: 0};
//Functions

//Check mac validity
function CheckMac() {
    if (CONFIG.shellyMac.length > 0) {
		print('Device info: id ', CONFIG.shellyMac, ', firmware version ', CONFIG.shellyFwVer);
    } else {
        print('Could not get valid device-id, rebooting.');
		Shelly.call("Shelly.Reboot");
    }
}

//Get current time and check if json is still valid
function UpdateStatus() {
	print('Getting Shelly Time. Reboot if json schedule is empty');
  
	// Update global time variables
	let curTime = new Date(Date.now());
	let timestampMillis = Date.now();      
	STATE.currentUnixTime = Math.floor(timestampMillis / 1000);
	STATE.currentHour = curTime.getHours();
	STATE.currentMinute = curTime.getMinutes();
  
	// Reboot Shelly if time is over json valid -timestamp
	if (STATE.getcontrolsInit === true && STATE.jsonValidUntil <= STATE.currentUnixTime) {
		print("Control schedule empty. Rebooting Shelly.");
		Shelly.call("Shelly.Reboot");
	}
}

//Get controls JSON
function ParseHttpResponse(res, error_code, error_msg, ud) {
    let requestInfo = null;
	if (error_code != 0) {
		print("Request error: ", error_code, error_msg);
	} else {
		// Parse response
		if (res.code === 200) {
			requestInfo = 'Get controls succesful. Code 200.';
			STATE.controlsJson = '{}';
			STATE.controlsJson = JSON.parse(res.body);
			CONFIG.deviceChannels = STATE.controlsJson.Metadata.Channels;
			STATE.lastRequest = JSON.parse(STATE.controlsJson.Metadata.Timestamp);
			STATE.jsonValidUntil = JSON.parse(STATE.controlsJson.Metadata.Valid_until);
			STATE.lastRequestHttpCode = res.code;
			//CONFIG.apiEndpoint = ControlsJson.Metadata.Fetch_url;
			print('Controls JSON parsed.');
			print('Device controlled channels: ', CONFIG.deviceChannels);
			print('Control json valid until: ', STATE.jsonValidUntil);
			print('Api endpoint: ', CONFIG.apiEndpoint);
			STATE.getcontrolsInit = true; // Important in first request cycle, remains true while script is running
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
	let urlToCall = CONFIG.apiEndpoint + "?device_mac=" + CONFIG.shellyMac + "&last_request=" + JSON.stringify(STATE.lastRequest) + "&client=" + VERSION + "&shelly_fw=" + CONFIG.shellyFwVer + "&cut_schedule=" + CONFIG.returnTimestamps;

	print('URL: ', urlToCall);

	Shelly.call("HTTP.GET", { url: urlToCall, timeout: 10, ssl_ca:"*" }, ParseHttpResponse);
}

//Do controls
function doControls() {

	print('Executing controls.');

	if (STATE.doControlsInit === true) {
		//Check if current timestamp is past next control timestamp and doing controls
    
		//Loop through channels
		for (var channel in STATE.controlsJson.controls) {
			if (STATE.controlsJson.controls.hasOwnProperty(channel)) {
				let SwitchId = STATE.controlsJson.controls[channel].id - 1;
		
				//Loop through schedules
				for (var ScheduleEntry in STATE.controlsJson.controls[channel].schedules) {
					if (STATE.controlsJson.controls[channel].schedules.hasOwnProperty(ScheduleEntry)) {
					//If current timestamp is greater or equal than schedule entrys timestamp then check if control already done
						if (STATE.currentUnixTime >= STATE.controlsJson.controls[channel].schedules[ScheduleEntry].timestamp) {
							if (STATE.controlsJson.controls[channel].schedules[ScheduleEntry].timestamp > STATE.channelLastControlTimeStamps[SwitchId]) {
								//Control switch and update last control timestamp
								let ControlState = STATE.controlsJson.controls[channel].schedules[ScheduleEntry].state;
								if (ControlState == 1) {
									controlSwitch(SwitchId, true);
									STATE.channelLastControlTimeStamps[SwitchId] = STATE.controlsJson.controls[channel].schedules[ScheduleEntry].timestamp;
								} else if (ControlState == 0) {
									controlSwitch(SwitchId, false);
									STATE.channelLastControlTimeStamps[SwitchId] = STATE.controlsJson.controls[channel].schedules[ScheduleEntry].timestamp;
								};
							};
						};
					}
				}
			}
		}
	
	} else {
	//Controls not initialized (bootup): Getting channels current states from control-json and making controls
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
        }
    }
    STATE.doControlsInit = true;
  };

  print('Controls done.');

}

//Control switches
function controlSwitch(SwitchId, setState) {
	
	Shelly.call("Switch.Set", { id: SwitchId, on: setState }, null, null);
  
	if (setState === true) {
		print('Switch id ', SwitchId, 'set ON.');
	} else {
		print('Switch id ', SwitchId, 'set OFF.');
	};

}


function MainCycle() {
       
	//Get controls once when controls not initialized (after bootup). Later controls updated at slower cycle. 
	if (STATE.getcontrolsInit === false) {
		print('Initial controls data not fetched from server, impossible to do controls');
		getControls();
	}	
  
	if (STATE.getcontrolsInit === true) {
	  
	    print('Cycle ', STATE.mainCycleCounter, '/', STATE.cyclesUntilRequest, ' until next request.');
    
        //Update time
	    UpdateStatus();
		
		// Do controls
		if (STATE.controlsReady === true) {
			doControls();
		};
  
		// Update controls json
		if (STATE.mainCycleCounter >= STATE.cyclesUntilRequest) {
			STATE.controlsReady = false;
			getControls();
		};
	}
  
	STATE.mainCycleCounter++;
}

//Main cycle timer
mainTimer = Timer.set(CONFIG.updatePeriod, true, MainCycle);