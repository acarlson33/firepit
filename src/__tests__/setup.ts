import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// happy-dom environment is configured in vitest.config.ts
// No need to manually set up DOM globals - Vitest does this automatically

// Global mock for appwrite SDK - applied to all tests
// This ensures all tests have consistent mocking for the appwrite SDK
vi.mock("appwrite", () => ({
	ID: {
		unique: () => "mock-id-123",
	},
	Query: {
		limit: (n: number) => `limit(${n})`,
		orderDesc: (field: string) => `orderDesc(${field})`,
		orderAsc: (field: string) => `orderAsc(${field})`,
		cursorAfter: (cursor: string) => `cursorAfter(${cursor})`,
		equal: (field: string, value: string) => `equal(${field},${value})`,
		and: (...queries: string[]) => `and(${queries.join(",")})`,
		or: (...queries: string[]) => `or(${queries.join(",")})`,
		isNull: (field: string) => `isNull(${field})`,
		isNotNull: (field: string) => `isNotNull(${field})`,
		search: (field: string, value: string) => `search(${field},${value})`,
		contains: (field: string, value: string) => `contains(${field},${value})`,
	},
	Permission: {
		read: (role: string) => `read(${role})`,
		write: (role: string) => `write(${role})`,
		update: (role: string) => `update(${role})`,
		delete: (role: string) => `delete(${role})`,
		create: (role: string) => `create(${role})`,
	},
	Role: {
		any: () => "any",
		user: (id: string) => `user:${id}`,
		users: () => "users",
		guests: () => "guests",
		team: (id: string, role?: string) => role ? `team:${id}/${role}` : `team:${id}`,
	},
	Client: vi.fn(() => ({
		setEndpoint: vi.fn().mockReturnThis(),
		setProject: vi.fn().mockReturnThis(),
	})),
	Account: vi.fn(),
	Databases: vi.fn(),
	Storage: vi.fn(),
	Teams: vi.fn(),
}));

// Mock node-appwrite to prevent import errors
vi.mock("node-appwrite", () => ({
	Client: vi.fn(() => ({
		setEndpoint: vi.fn().mockReturnThis(),
		setProject: vi.fn().mockReturnThis(),
		setKey: vi.fn().mockReturnThis(),
	})),
	Databases: vi.fn(),
	Storage: vi.fn(),
	Teams: vi.fn(),
	Query: {
		equal: (field: string, value: string) => `equal(${field},${value})`,
		limit: (n: number) => `limit(${n})`,
		orderAsc: (field: string) => `orderAsc(${field})`,
		orderDesc: (field: string) => `orderDesc(${field})`,
		cursorAfter: (cursor: string) => `cursorAfter(${cursor})`,
		and: (...queries: string[]) => `and(${queries.join(",")})`,
		or: (...queries: string[]) => `or(${queries.join(",")})`,
		isNull: (field: string) => `isNull(${field})`,
		isNotNull: (field: string) => `isNotNull(${field})`,
		search: (field: string, value: string) => `search(${field},${value})`,
		contains: (field: string, value: string) => `contains(${field},${value})`,
	},
	Permission: {
		read: (role: string) => `read(${role})`,
		write: (role: string) => `write(${role})`,
		update: (role: string) => `update(${role})`,
		delete: (role: string) => `delete(${role})`,
		create: (role: string) => `create(${role})`,
	},
	Role: {
		any: () => "any",
		user: (id: string) => `user:${id}`,
		users: () => "users",
		guests: () => "guests",
		team: (id: string, role?: string) => role ? `team:${id}/${role}` : `team:${id}`,
	},
	ID: {
		unique: () => "mock-id-123",
	},
}));
