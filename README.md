# Nautoguide API Push
A tool to push project configuration to the Nautoguide V2 API

## Usage
To begin with you will need to create a couple of files. The first being a configuration file that will store the necessary information to connect to our services. There's an example configuration file included in this project that will look similar to this:
```JavaScript
{
  "host": "host",
  "port": 5432,
  "user": "user",
  "pass": "password",
  "database": "database"
}
```

You will need to edit this to match your configuration.

You will also need to have a run file that contains the information about what you want to do. There's an example file in this project called `test.nsql` that will look like the following:
```
FILE/SQL: test.sql
SQL: SELECT * FROM users;
```

You can have a few different options in this file:

- FILE/SQL:
    This will run an SQL file.
- SQL:
    This will run raw SQL code, like what's in the example above.

You can have as many calls in a file as you would like, and if any call fails the calls afterwards will not be called.

If you wish to exclude a call in the build file, you can comment it out by putting `--` at the beginning, e.g.:
```
--FILE/SQL: test.sql
```