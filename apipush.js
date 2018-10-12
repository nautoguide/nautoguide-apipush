#!/usr/bin/env node

//Libraries
const fs = require('fs');
const path = require('path');
const lineReader = require('readline');
const { Client } = require('pg');
const readdir = require('readdir-enhanced');

let client;

//Normalize command line arguments
let args = process.argv.slice(2);

//Parameter checking
if (!(args[0] && args[1])) {
    console.error("Incorrect Usage. apipush {config file} {run file}");
    process.exit(1);
}

fileCheck(args[0], args[1]);

const debug = (args[2] ? args[2] : false);

//Load the configuration file
let config = require(process.cwd() + "/" + args[0]);

console.log(`Running APIPush against ${config['host']} using the ${config['database']} database`);

let run = [];

//Find out what needs to be run
let file = lineReader.createInterface({
    input: fs.createReadStream(process.cwd() + "/" + args[1])
});

//For every line in the run file, populate the array with the value
file.on('line', function(line) {
    //Check if the line is commented out. Exclude it from the run config if so
    if (line.startsWith("--")) {
        return;
    }

    run.push(line);
});

//Scan a directory with optional filter to find more files
function directoryParse(type, directory, filter, data) {
    readdir.sync(directory, {
        deep: true,
        filter: filter,
        basePath: directory
    }).forEach(file => {
        //If it's a directory exclude it - directory recursion is handled by the library
        if (!fs.lstatSync(file).isDirectory()) {
            data.push(type + ": " + file);
        }
    });
}

//Once the file has been read, process each line
file.on('close', function() {
    //Set up the database client
    client = new Client({
        host: config['host'],
        port: config['port'] || 5432,
        user: config['user'],
        password: config['pass'],
        database: config['database']
    });

    //Connect to the database. This will log out an error if it can't connect successfully
    client.connect((error) => {
        if (error) {
            client.end();
            console.error("Error logging into the database", error['stack']);
        }
        else {
            //Set the search path
            client.query("SET SEARCH_PATH = " + (config['schema'] || config['user'].replace("_user", "")) + ", public, ng_rest")
                .then(function() {
                    //Run through the run file
                    preLoopData(run)
                        .then(function() {
                            client.end();
                        });
                });
        }
    });

    //If notice statements are raised, log them out
    client.on('notice', function(msg) {
        console.log("[DEBUG]: " + msg);
    });
});

let transaction = false;

async function preLoopData(data) {
    await loopData(data);
}

async function processItem(item) {
    if (item === 'SQL/TRANSACTION') {
        if (transaction) {
            console.error("Already in transaction. Bad configuration likely.");
            process.exit(1);
        }

        transaction = true;

        console.log("---TRANSACTION---");

        try {
            await client.query('BEGIN');
        }
        catch(error) {
            console.log("Error running begin");
            console.error(error);
        }
    }
    else if (item === 'SQL/COMMIT') {
        if (!transaction) {
            console.log("No transaction found. Bad configuration likely.");
            process.exit(1);
        }

        transaction = false;

        try {
            await client.query('COMMIT');
            console.log("---END TRANSACTION---");
        }
        catch(error) {
            console.log("Error running commit");
            console.error(error);
        }
    }
    else {
        //Parse the format
        let itemConfig = item.split(/: (.+)?/, 2);

        let runContent = itemConfig[1];

        let execute = false;

        //Detecting if a file needs to be loaded
        if (/file\/.*/ig.test(itemConfig[0].toUpperCase())) {
            //If it's a directory that exists run through it
            if (fs.existsSync(runContent) && fs.lstatSync(runContent).isDirectory()) {
                let subFiles = [];

                directoryParse(itemConfig[0], runContent, null, subFiles);

                await loopData(subFiles);

                return;
            }

            //If there's a * in the name, assume regex and parse the directory to match
            if (runContent.includes("*")) {
                let subFiles = [];

                directoryParse(itemConfig[0], path.dirname(runContent), function(stats) {
                    try {
                        return new RegExp(path.basename(runContent)).test(path.basename(stats.path));
                    }
                    catch(e) {
                        console.log(e);
                        return false;
                    }
                }, subFiles);

                await loopData(subFiles);
            }
            else {
                if (fs.existsSync(runContent)) {
                    runContent = fs.readFileSync(runContent).toString();
                    execute = true;
                }
                else {
                    console.log("FILE NOT FOUND: " + runContent);
                    process.exit(1);
                }
            }
        }
        else {
            execute = true;
        }

        if (execute) {
            try {
                console.log(truncate("Running SQL: " + runContent.split('\n')[0], process['stdout']['columns'] - 3));

                //Run the query against the database
                let result = await client.query(runContent);

                debugMsg(5, result);
            }
            catch (error) {
                if (transaction) {
                    try {
                        await client.query('ROLLBACK');
                        console.log(error);
                        process.exit(1);
                    }
                    catch(error) {
                        console.log("Error running rollback");
                        console.error(error);
                        process.exit(1);
                    }
                }
                else {
                    console.error(error);
                    process.exit(1);
                }
            }
        }
    }
}

async function loopData(data) {
    for (let i = 0; i < data.length; i++) {
        await processItem(data[i]);
    }
}

//A function to check if a file exists
function fileCheck(...files) {
    for (let i = 0; i < files.length; i++) {
        if (!fs.existsSync(files[i])) {
            console.error("File " + files[i] + " does not exist.");
            process.exit(1);
        }
    }
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

    let truncated = text.substring(0, length);

    if (truncated.length !== text.length) {
        return truncated + "...";
    }
    else {
        return truncated;
    }
}