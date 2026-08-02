create role swiftflow_executor_test
  login
  password 'swiftflow_executor_test'
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

grant swiftflow_action_executor to swiftflow_executor_test;
