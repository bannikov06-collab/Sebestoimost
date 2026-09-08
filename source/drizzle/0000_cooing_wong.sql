CREATE TABLE `calculations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_name` text NOT NULL,
	`section_name` text NOT NULL,
	`section_length` integer NOT NULL,
	`quantity` integer NOT NULL,
	`material_cost` real NOT NULL,
	`labor_cost` real NOT NULL,
	`utility_cost` real NOT NULL,
	`unit_cost` real NOT NULL,
	`total_cost` real NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
