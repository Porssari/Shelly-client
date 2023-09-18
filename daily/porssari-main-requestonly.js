//Init variables
let ApiEndpoint = "https://dev.porssari.fi";
let ScriptVersion = "Shelly-2.0_beta1";
let Mac = Shelly.getDeviceInfo().mac;
let ShellyVersion = Shelly.getDeviceInfo().ver;

let CurrentHour = 0;
let CurrentMinute = 0;
let CurrentUnixTime = 0;
let DeviceChannels = 0;

let StatusOk = false;
let ControlsReady = false;
let GetcontrolsInit = false;
let LastRequest = 0;
let JsonValidUntil = 0;
let ControlsJson = '{}';

let MainTimer = null;
let MainCycleCounter = 0;
let CyclesUntilRequest = 20;

//Prototype switch object
let ShellySwitch = {
  turnOn: function () {
    Shelly.call("Switch.Set", { id: this.id, on: true }, null, null);
    print('Switch id ', this.id, 'set ON.');
  },
  turnOff: function () {
    Shelly.call("Switch.Set", { id: this.id, on: false }, null, null);
    print('Switch id ', this.id, 'set OFF.');
  },
};

//Create switch object
function getSwitch(id) {
  let o = Object.create(ShellySwitch);
  o.id = id;
  return o;
}

//Declare switches
let Switch0 = getSwitch(0);
let Switch1 = getSwitch(1);
let Switch2 = getSwitch(2);
let Switch3 = getSwitch(3);
let Switch100 = getSwitch(100); 

//Functions
function CheckMac() {
    if (Mac.length > 0) {
      StatusOk = true;
      print('Mac: ', Mac, ', firmware: ', ShellyVersion);
    }
}

//Get current time and check if json is still valid
function UpdateStatus() {
 
  print('Getting Shelly Time. Reboot if json schedule is empty');
  
  // Update global time variables
  let CurTime = new Date(Date.now());
  let timestampMillis = Date.now();      
  CurrentUnixTime = Math.floor(timestampMillis / 1000);
  CurrentHour = CurTime.getHours();
  CurrentMinute = CurTime.getMinutes();
  
  // Reboot Shelly if time is over json valid -timestamp
  if (GetcontrolsInit === true && JsonValidUntil <= CurrentUnixTime) {
    print("Control schedule empty. Rebooting Shelly.");
	Shelly.call("Shelly.Reboot");
  }
}

//Get controls JSON
function ParseHttpResponse(res, error_code, error_msg, ud) {
  if (error_code != 0) {
    print("Request error: ", error_code, error_msg);
  } else {
	// Parse response
    if (res.code === 200) {
      print('Get controls succesful. Code 200.');
	  ControlsJson = '{}';
      ControlsJson = JSON.parse(res.body);
      //print('Controls JSON parsed.');
      DeviceChannels = ControlsJson.Metadata.Channels;
	  LastRequest = JSON.parse(ControlsJson.Metadata.Timestamp);
	  JsonValidUntil = JSON.parse(ControlsJson.Metadata.Valid_until);
	  ApiEndpoint = ControlsJson.Metadata.Fetch_url;
	  print('Device controlled channels: ', DeviceChannels);
	  print('Control json valid until: ', JsonValidUntil);
	  print('Api endpoint: ', ApiEndpoint);
	  //doControls(false);
      //ControlsReady = true;
    } else if (res.code === 400) {
	  print('Get controls failed. Bad request. Code: ', res.code);
	} else if (res.code === 429) {
	  print('Get controls failed. Request rate limiter. Code: ', res.code);
	} else if (res.code === 425) {
	  print('Get controls failed. Too fast subsequent requests. Code: ', res.code);
	} else if (res.code === 304) {
	  print('Control settings not changed after last request. No need to update. Code: ', res.code);
    } else {
	  print('Get controls failed. Code: ', res.code);
    }
  }
}

function getControls() {

  print('Get controls-JSON.');
  let urlToCall = ApiEndpoint + "/getcontrols_newjson.php?device_mac=" + Mac + "&client=" + ScriptVersion;

  //If request already succesfully made once then add last response unix time to request
  if (LastRequest > 0) {
    urlToCall = urlToCall + "&last_request=" + JSON.stringify(LastRequest);
  };
  print('URL: ', urlToCall);

  Shelly.call("HTTP.GET", { url: urlToCall, timeout: 20, ssl_ca:"*" }, ParseHttpResponse);
  
  CyclesUntilRequest = 18 + Math.floor(3 * Math.random());
  MainCycleCounter = 0;
  print('Main cycles until next request: ', CyclesUntilRequest);
}

//Timer called control function for getControls
function getControlsCall() {
	//If status OK and over 60 seconds until next quarter, call getControls
  if (StatusOk  === true && getSecondsUntilNextQuarter() > 60) {
    	getControls();
  }
  GetcontrolsTimerArmed = false;
}

function MainCycle() {
  
  // Update time
  UpdateStatus();
        
  //Get controls once in this timer to speed things up after bootup. Later controls updated at slower cycle timer
  if (MainCycleCounter === CyclesUntilRequest || GetcontrolsInit === false) {
	getControls();
    GetcontrolsInit = true;
  }
  MainCycleCounter++;
  print('Cycles done: ', MainCycleCounter, ', next request after ', CyclesUntilRequest, ' cycles.');
}

//Main cycle
CheckMac();

mainTimer = Timer.set(15000, true, MainCycle);
