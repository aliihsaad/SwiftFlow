create role swiftflow_comparison_test
  login
  password 'swiftflow_comparison_test'
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

grant swiftflow_webhook_comparison to swiftflow_comparison_test;
