//Libraries
const request = require('xhr-request');
const fs = require('fs');
const lineReader = require('readline');
const async = require('async');
const extend = require('extend');

//Normalize command line arguments
var args = process.argv.slice(2);

//Parameter checking
if (!(args[0] && args[1])) {
    console.error("Incorrect Usage. apipush {config file} {run file}");
    process.exit(1);
}

fileCheck(args[0], args[1]);

const debug = (args[2] ? args[2] : false);

//Load the configuration file
var config = require("./" + args[0]);

var run = [];

//Find out what needs to be run
var file = lineReader.createInterface({
    input: fs.createReadStream(args[1])
});

//For every line in the run file, populate the array with the value
file.on('line', function(line) {
    run.push(line);
});

//Once the file has been read, process each line
file.on('close', function() {
    var token;

    callApi({
        "system_api": "session",
        "schema": config['schema'],
        "api": "configuration_api",
        "action": "login",
        "payload": {
            "app": config['app'],
            "user_email": config['user'],
            "user_password": config['password']
        }
    }, function(success, result) {
        if (success) {
            //Save the token for future use
            token = result['API']['Response']['_token'];

            //Execute the queries within the run file
            async.eachSeries(run, function(item, callback) {
                //Parse the format in the file by splitting on : once
                var itemConfig = item.split(/: (.+)?/, 2);

                //Uppercasing to cope with non-uppercase values
                var runType = itemConfig[0].toUpperCase();
                var sqlType = 'raw';
                var runContent = itemConfig[1];

                //Detecting if a file needs to be loaded
                if (/file\/.*/ig.test(runType)) {
                    var fileOptions = runType.split('/');

                    runType = fileOptions[1];

                    if (fileOptions[2]) {
                        sqlType = fileOptions[2];
                    }

                    runContent = fs.readFileSync(itemConfig[1]).toString();
                }

                //Figure out what type of call to run.
                switch (runType) {
                    case "SQL": {
                        console.log(truncate("Running SQL: " + runContent, process['stdout']['columns'] - 3));

                        //Run the SQL on the server. If the call is successful it will continue with the queue after running otherwise it will stop

                        var runOptions;

                        if (runContent.match(/\!auto_update\:/)) {
                            var match = /(\!auto_update\:(\{.*\}))|(\!update_part\:(\{.*\}))/g.exec(runContent);

                            if (match) {
                                runOptions = JSON.parse(match[0].replace('!auto_update:', '').replace('!update_part:', ''));
                                var lines = data.split('\n');

                                lines.splice(0, 1);

                                runContent = lines.join('\n');
                            }
                        }

                        switch (sqlType) {
                            case "report": {
                                callApi({
                                    "system_api": "api",
                                    "schema": config['schema'],
                                    "api": "reporting_api",
                                    "action": "update_report",
                                    "app": config['app'],
                                    "_token": token,
                                    "payload": {
                                        'report_name': runOptions['name'],
                                        'report_query': runContent,
                                        'report_template': runOptions['template'],
                                        'report_filter': runOptions['filter_id'],
                                        'report_attributes': runOptions['attributes']
                                    }
                                }, function (success, data) {
                                    if (!success) {
                                        callback(data);
                                    }
                                    else {
                                        callback(null);
                                    }
                                });

                                break;
                            }

                            case "filter": {
                                callApi({
                                    "system_api": "api",
                                    "schema": config['schema'],
                                    "api": "reporting_api",
                                    "action": "update_filter",
                                    "app": config['app'],
                                    "_token": token,
                                    "payload": {
                                        'filter_name': runOptions['name'],
                                        'filter': JSON.parse(runContent),
                                        'filter_type': runOptions['filter_type'] ? runOptions['filter_type'] : 'I'
                                    }
                                }, function (success, data) {
                                    if (!success) {
                                        callback(data);
                                    }
                                    else {
                                        callback(null);
                                    }
                                });

                                break;
                            }

                            case "script": {
                                callApi({
                                    "system_api": "api",
                                    "schema": config['schema'],
                                    "api": "configuration_api",
                                    "action": "set_client_resource",
                                    "app": config['app'],
                                    "_token": token,
                                    "payload": {
                                        'resource_name': runOptions['name'],
                                        'resource_value': new Buffer(runContent).toString('base64'),
                                        'mime_type': runOptions['mime']
                                    }
                                }, function (success, data) {
                                    if (!success) {
                                        callback(data);
                                    }
                                    else {
                                        callback(null);
                                    }
                                });

                                break;
                            }

                            case "raw": {
                                callApi({
                                    "system_api": "api",
                                    "schema": config['schema'],
                                    "api": "admin_api",
                                    "action": "run_sql",
                                    "app": config['app'],
                                    "_token": token,
                                    "payload": {
                                        "sql": runContent
                                    }
                                }, function (success, data) {
                                    if (!success) {
                                        callback(data);
                                    }
                                    else {
                                        callback(null);
                                    }
                                });

                                break;
                            }

                            default: {
                                console.error("Unknown SQL Type '" + sqlType + "' Found");
                            }
                        }

                        break;
                    }

                    case "API": {
                        console.log(truncate("Calling API: " + runContent, process['stdout']['columns'] - 3));

                        //Call the API. If the call is successful it will continue with the queue after running otherwise it will stop

                        callApi(extend(true, {
                            "system_api": "api",
                            "_token": token,
                            "schema": config['schema'],
                            "app": config['app']
                        }, JSON.parse(runContent)), function(success, data) {
                            if (!success) {
                                callback(data);
                            }
                            else {
                                callback(null);
                            }
                        });

                        break;
                    }
                }
            });
        }
        else {
            console.log("Error logging in");
            console.log(result);
        }
    });
});

//A function to check if a file exists
function fileCheck(...files) {
    for (var i = 0; i < files.length; i++) {
        if (!fs.existsSync(files[i])) {
            console.error("File " + files[i] + " does not exist.");
            process.exit(1);
        }
    }
}

//A function to call our API.
function callApi(payload, callback) {
    debugMsg(5, 'https://api2.nautoguide.com/' + config['system'] + '/v2/' + payload['system_api'] + '/');
    debugMsg(10, payload);

    request('https://api2.nautoguide.com/' + config['system'] + '/v2/' + payload['system_api'] + '/', {
        method: 'POST',
        json: true,
        body: payload
    }, function(err, data) {
        debugMsg(10, data);

        if (err) {
            if (callback) {
                callback(data['API']['Code'] === 200 && data['API']['Response']['code'] === "00000", data);
            }
        }
        else {
            if (callback) {
                callback(data['API']['Code'] === 200, data);
            }
        }
    });
}

//Debug message helper function
function debugMsg(level, message) {
    if (debug && debug !== false && level <= debug) {
        console.log(message);
    }
}

//Truncate text and add an ellipsis if it truncated
function truncate(text, length) {
    if (!length) {
        length = text.length;
    }

    var truncated = text.substring(0, length);

    if (truncated.length !== text.length) {
        return truncated + "...";
    }
    else {
        return truncated;
    }
}