<?php
//
//Catch all errors, including warnings.
\set_error_handler(function ($errno, $errstr, $errfile, $errline /*, $errcontext*/) {
    throw new \ErrorException($errstr, 0, $errno, $errfile, $errline);
});
//
//The schema is the base of all our applications; it is primarily used for
//supporting the database class
include_once $_SERVER['DOCUMENT_ROOT'] . '/schema/v/code/schema.php';
//.
//We want to have access to the selector class
include_once $_SERVER['DOCUMENT_ROOT'] . '/schema/v/code/sql.php';
//
//construct a new seleector query based on tenant in rentize.
//$s = new selector("member", "mutall_chama");
//$s = new mutall\selector("eaccount", "mutallco_rental");
//
//Construct a new database
$db = new mutall\database("mutall_tracker");
//
//The recursion query
$query = '
      select * from intern; select * from certificate;
    ';
//
//The result of the query
$data = $db->get_sql_data($query);
//
//Visualize the results as a JSON string
echo "<pre>" . json_encode($data) . "</pre>";

