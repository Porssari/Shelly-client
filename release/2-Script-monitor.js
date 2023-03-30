/*
Monitoring if scripts are running
*/
 
// Config
let CONFIG = {
    UpdateFrequence: 2 * 60000,
    MonitorScript1: true,
    MonitoredScript1: "1",
    MonitorScript2: false,
    MonitoredScript2: "2",
};
 
//Functions
function Control() {

    if (CONFIG.MonitorScript1 === true) {
       print("Monitoring script 1 execution, script ID to monitor: " + CONFIG.MonitoredScript1);
       MonitorScript1Execution();
    }
	
	if (CONFIG.MonitorScript2 === true) {
       print("Monitoring script 2 execution, script ID to monitor: " + CONFIG.MonitoredScript2);
       MonitorScript2Execution();
    }
    
}

function MonitorScript1Execution()
{
    Shelly.call("Script.GetStatus", { id: CONFIG.MonitoredScript1 }, function (res, error_code, error_msg, ud) 
    {
        if (res.running === true) 
        {
          print("Monitored script 1 is running.");
        }
        else 
        {
          print("Monitored script 1 is not running. Starting the script.");
          Shelly.call("Script.Start", { id: CONFIG.MonitoredScript1}, null, null);
        };
    }, null);
}

function MonitorScript2Execution()
{
    Shelly.call("Script.GetStatus", { id: CONFIG.MonitoredScript2 }, function (res, error_code, error_msg, ud) 
    {
        if (res.running === true) 
        {
          print("Monitored script 2 is running.");
        }
        else 
        {
          print("Monitored script 2 is not running. Starting the script.");
          Shelly.call("Script.Start", { id: CONFIG.MonitoredScript2}, null, null);
        };
    }, null);
}

 
Timer.set(CONFIG.UpdateFrequence, true, function (ud) { Control(); }, null);