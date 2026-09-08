CREATE TABLE `assignment_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_name` text NOT NULL,
	`scope` text NOT NULL,
	`element_key` text DEFAULT '' NOT NULL,
	`responsible` text NOT NULL,
	`previous_responsible` text DEFAULT '' NOT NULL,
	`changed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
