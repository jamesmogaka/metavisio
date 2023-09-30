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
$s = new mutall\selector("eaccount", "mutallco_rental");
//
//Construct a new database
$db = new mutall\database("mutall_users");
//
//The recursion query
$recursion = '
    select 
        job.job,
        job.msg,
        job.recursion->>"$.repetitive" as repetitive,
        recursion->>"$.start_date" as start_date,
        recursion->>"$.end_date" as end_date,
        recursion->>"$.frequency" as frequency 
    from job 
    where job.recursion->>"$.repetitive"="yes" 
    and recursion->>"$.start_date"<= now()<recursion->>"$.end_date"
    ';
//
//The result of the query
$data = $db->get_sql_data($recursion);
//
//Visualize the results as a JSON string
echo "<pre>" . json_encode($s) . "</pre>";
// $sql = "
// select
//     user.email
// from user
//     where user.name='Peter Kamau Kungu'";
//
//Run the query
// $results = $db->get_sql_data($sql);
// //
// foreach ($results as $result) echo $result['email'];
//
//
// echo json_encode($result);
//
//echo "<pre>".$s->stmt()."</pre>";
// $result = $s->execute();
// //
// echo json_encode($result);
