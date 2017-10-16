# Nautoguide API Push
A tool to push project configuration to the Nautoguide V2 API

## Usage
To begin with you will need to create a couple of files. The first being a configuration file that will store the necessary information to connect to our services. There's an example configuration file included in this project that will look similar to this:
```JavaScript
{
  "user": "email address",
  "password": "password",
  "schema": "schema",
  "app": "app",
  "system": "dev"
}
```

You will need to edit this to match your configuration.

You will also need to have a run file that contains the information about what you want to do. There's an example file in this project called `test.nsql` that will look like the following:
```
FILE/SQL: test.sql
SQL: SELECT * FROM users;
API: {"api": "configuration_api", "action": "list_users"}
```

You can have a few different options in this file:

- FILE/SQL:
    This will run an SQL file. This can either be just SQL or it can be any of the following: a report, a filter or a script

    If you want to utilise any of the additional options you will need to put in something like the following at the top of the file:
    ```
    !auto_update:{"type":"report","name":"get_featured_talking_points"}
    ```

    What is stored within the JSON here depends on what's being run:
    Reports: name, template, filter_id and attributes
    Filters: name, filter_type
    Scripts: name, mime

- SQL:
    This will run raw SQL code, like what's in the example above.

- API:
    This will be a JSON of an API call, like what's in the example above.

You can have as many calls in a file as you would like, and if any call fails the calls afterwards will not be called.