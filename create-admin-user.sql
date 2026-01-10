-- Create admin user account
-- Email: abdallahelriz5@gmail.com
-- Password: Aboudi100*
-- Name: Abdallah Elrizz

INSERT INTO `users` (`username`, `email`, `password_hash`, `role`, `full_name`) 
VALUES (
  'abdallah',
  'abdallahelriz5@gmail.com',
  '$2b$10$eXHeVg4xVI1hULgLzkd77.e7xXdu/sCKRkXWZ3Br6MXectrzZW5v2',
  'admin',
  'Abdallah Elrizz'
);

