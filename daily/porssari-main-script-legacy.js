let CurrentHour = 0;
let CurrentMinute = 0;
let CurrentUnixTime = 0;
let Mac = '';
let DeviceChannels = 0;
let ScriptVersion = "Shelly-legacy";
let ShellyVersion = '';

let StatusOk = false;
let ControlsReady = false;
let GetcontrolsInit = false;
let LastRequest = 0;
let HoursLeftOnJson = 0;
let ApiEndpoint = "https://api.porssari.fi";
let ControlsJson = '{}';
let DoControlsTimerArmed = false;
let GetcontrolsTimerArmed = false;

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

function getSwitch(id) {
  let o = Object.create(ShellySwitch);
  o.id = id;
  return o;
}

let Switch0 = getSwitch(0);
let Switch1 = getSwitch(1);
let Switch2 = getSwitch(2);
let Switch3 = getSwitch(3);

function GetVersionAndMac() {
  print('Getting Shelly Mac and firmware version');
  Shelly.call("Shelly.GetConfig", "", function (res) {
    Mac = res.sys.device.mac;
    let VersionFromGetConfig = res.sys.device.fw_id;
    ShellyVersion = VersionFromGetConfig.slice(ShellyVersion.indexOf('/') + 1);
    if (Mac.length > 0) {
      StatusOk = true;
    }
  }, null);
}

function UpdateStatus() {
  print('Getting Shelly Time. Controls timer arming if needed.');
  let CurTime = new Date(Date.now());
  let CurrentHourUpdated = CurTime.getHours();
  if (CurrentHour !== CurrentHourUpdated && HoursLeftOnJson > 0) {
    HoursLeftOnJson = HoursLeftOnJson - 1;
    print('Hour changed. Control hours left on buffer: ', HoursLeftOnJson);
    if (HoursLeftOnJson <= 0) {
	    print("Control hours empty. Rebooting Shelly.");
	    Shelly.call("Shelly.Reboot");
	  };
  }
  CurrentHour = CurrentHourUpdated;
  CurrentMinute = CurTime.getMinutes();
  let timestampMillis = Date.now();      
  CurrentUnixTime = Math.floor(timestampMillis / 1000);
  if (DoControlsTimerArmed === false && ControlsReady === true) {
    let SecondsUntilNextQuarter = 900;
    SecondsUntilNextQuarter = getSecondsUntilNextQuarter();         
    print('Arming controls timer (sec): ', SecondsUntilNextQuarter);           
    Timer.set(SecondsUntilNextQuarter * 1000, false, function (ud) {
      doControls(true);
    }, null);
		DoControlsTimerArmed = true;
  };
}

function getControls() {
  print('Get controls-JSON.');
  let urlToCall = ApiEndpoint + "/getcontrols.php?device_mac=" + Mac + "&client=" + ScriptVersion;
  if (LastRequest > 0) {
    urlToCall = urlToCall + "&last_request=" + JSON.stringify(LastRequest);
  };
  print('URL: ', urlToCall);
  Shelly.call("HTTP.GET", { url: urlToCall, timeout: 20, ssl_ca:"*" },
  function (res, error_code, error_msg, ud) {
    if (error_code !== 0) {
      print("Request error: ", error_code, error_msg);
      return;
    }
    if (res.code === 200) {
      print('Get controls succesful. Code 200.');
			ControlsJson = '{}';
      ControlsJson = JSON.parse(res.body);
      print('Controls JSON parsed.');
			DeviceChannels = ControlsJson.Metadata.Channels;
			LastRequest = JSON.parse(ControlsJson.Metadata.Timestamp);
			HoursLeftOnJson = JSON.parse(ControlsJson.Metadata.Hours_count);
			print('Device controlled channels: ', DeviceChannels);
			print('Control hours in buffer: ', HoursLeftOnJson);
			doControls(false);
      ControlsReady = true;
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
    };
  }, null);
}

function doControls(TimerTriggered) {
  print('Executing controls.');
  if (TimerTriggered === true) {
    UpdateStatus();
    DoControlsTimerArmed = false;
  };
  let CurrentHourString = JSON.stringify(CurrentHour);
  if (DeviceChannels >= 1) {
    if (ControlsJson.Channel1[CurrentHourString] === "1") {
      Switch0.turnOn();
    } else if (ControlsJson.Channel1[CurrentHourString] === "0") {
      Switch0.turnOff();
    };
  };
  if (DeviceChannels >= 2) {
    if (ControlsJson.Channel2[CurrentHourString] === "1") {
      Switch1.turnOn();
    } else if (ControlsJson.Channel2[CurrentHourString] === "0") {
      Switch1.turnOff();
    };
  };
  if (DeviceChannels >= 3) {
    if (ControlsJson.Channel3[CurrentHourString] === "1") {
      Switch2.turnOn();
    } else if (ControlsJson.Channel3[CurrentHourString] === "0") {
      Switch2.turnOff();
    };
  };
  if (DeviceChannels >= 4) {
    if (ControlsJson.Channel4[CurrentHourString] === "1") {
      Switch3.turnOn();
    } else if (ControlsJson.Channel4[CurrentHourString] === "0") {
      Switch3.turnOff();
    };
  };
}

function getSecondsUntilNextQuarter() {
  let NextQuarterMinute = 0;  
  if (CurrentMinute >= 0 && CurrentMinute < 15) {
    NextQuarterMinute = 15;
  } else if (CurrentMinute >= 15 && CurrentMinute < 30) {
    NextQuarterMinute = 30;
  } else if (CurrentMinute >= 30 && CurrentMinute < 45) {
    NextQuarterMinute = 45;
  } else if (CurrentMinute >= 45 && CurrentMinute < 60) {
    NextQuarterMinute = 60;
  };
  let CurrentHourUnixtime =  Math.floor(CurrentUnixTime / 3600.0);
  CurrentHourUnixtime = CurrentHourUnixtime * 3600;
  let CurrentSecondsOverHour = CurrentUnixTime - CurrentHourUnixtime;
  let SecondsUntilNextQuarter = (NextQuarterMinute * 60) - CurrentSecondsOverHour;
  return SecondsUntilNextQuarter + 5;
}

function getControlsCall() {
  if (StatusOk  === true && getSecondsUntilNextQuarter() > 60) {
    	getControls();
  }
  GetcontrolsTimerArmed = false;
}

GetVersionAndMac();

Timer.set(5000, true, function (ud) {
  UpdateStatus();
  if (StatusOk === true && GetcontrolsInit === false) {
		getControls();
    GetcontrolsInit = true;
  }
	if (GetcontrolsTimerArmed === false) {
		let RequestInterval = Math.floor(30 * Math.random()) + 90;
		print('Arming timer for next control JSON request (sec): ', RequestInterval);		
		Timer.set(RequestInterval * 1000, false, function (ud) {
      getControlsCall();
    }, null);
		GetcontrolsTimerArmed = true;
	}
}, null);
