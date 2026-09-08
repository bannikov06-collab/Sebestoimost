CREATE TABLE `workspace_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`project_key` text DEFAULT '' NOT NULL,
	`entity_key` text DEFAULT '' NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
