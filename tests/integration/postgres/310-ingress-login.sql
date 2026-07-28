create role swiftflow_ingress_test
  login
  password 'swiftflow_ingress_test'
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

grant swiftflow_webhook_ingress to swiftflow_ingress_test;
