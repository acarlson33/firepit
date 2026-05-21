/**
 * Basic integration tests for role management API
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
	getAllPermissions,
	getPermissionDescription,
	calculateRoleHierarchy,
	getEffectivePermissions,
	canManageRole,
	getHighestRole,
} from "@/lib/permissions";
import type { Role, ChannelPermissionOverride } from "@/lib/types";

describe("Role Management API", () => {
	it("should have role types defined", () => {
		const permissions = getAllPermissions();
		expect(permissions).toHaveLength(8);
		expect(permissions).toContain("readMessages");
		expect(permissions).toContain("sendMessages");
		expect(permissions).toContain("manageMessages");
		expect(permissions).toContain("manageChannels");
		expect(permissions).toContain("manageRoles");
		expect(permissions).toContain("manageServer");
		expect(permissions).toContain("mentionEveryone");
		expect(permissions).toContain("administrator");
	});

	it("should provide permission descriptions", () => {
		const desc = getPermissionDescription("readMessages");
		expect(desc).toBeTruthy();
		expect(typeof desc).toBe("string");
		expect(desc.length).toBeGreaterThan(0);
	});

	it("should calculate role hierarchy", () => {
		const roles: Role[] = [
			{ $id: "1", serverId: "s1", position: 1, name: "Member", color: "#000", readMessages: false, sendMessages: false, manageMessages: false, manageChannels: false, manageRoles: false, manageServer: false, mentionEveryone: false, administrator: false, mentionable: false },
			{ $id: "2", serverId: "s1", position: 10, name: "Admin", color: "#f00", readMessages: false, sendMessages: false, manageMessages: false, manageChannels: false, manageRoles: false, manageServer: false, mentionEveryone: false, administrator: false, mentionable: false },
			{ $id: "3", serverId: "s1", position: 5, name: "Moderator", color: "#0f0", readMessages: false, sendMessages: false, manageMessages: false, manageChannels: false, manageRoles: false, manageServer: false, mentionEveryone: false, administrator: false, mentionable: false },
		];

		const sorted = calculateRoleHierarchy(roles);
		expect(sorted[0].name).toBe("Admin"); // Highest position
		expect(sorted[1].name).toBe("Moderator");
		expect(sorted[2].name).toBe("Member");
	});

	it("should calculate effective permissions with admin bypass", () => {
		const roles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Admin",
				color: "#f00",
				position: 1,
				readMessages: false,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: true,
				mentionable: false,
			},
		];

		const permissions = getEffectivePermissions(roles, []);
		expect(permissions.readMessages).toBe(true); // Admin bypasses all
		expect(permissions.administrator).toBe(true);
	});

	it("should calculate effective permissions with role merging", () => {
		const roles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Role1",
				color: "#000",
				position: 1,
				readMessages: true,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
			{
				$id: "2",
				serverId: "s1",
				name: "Role2",
				color: "#111",
				position: 2,
				readMessages: true,
				sendMessages: true,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const permissions = getEffectivePermissions(roles, []);
		expect(permissions.readMessages).toBe(true); // Both roles allow
		expect(permissions.sendMessages).toBe(true); // One role allows (OR operation)
		expect(permissions.manageMessages).toBe(false); // Neither allows
	});

	it("should apply channel permission overrides", () => {
		const roles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Role1",
				color: "#000",
				position: 1,
				readMessages: true,
				sendMessages: true,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const overrides: ChannelPermissionOverride[] = [
			{
				$id: "override1",
				channelId: "channel1",
				roleId: "1",
				userId: undefined,
				allow: [],
				deny: ["sendMessages"], // Deny sending in this channel
			},
		];

		const permissions = getEffectivePermissions(roles, overrides);
		expect(permissions.readMessages).toBe(true); // Not overridden
		expect(permissions.sendMessages).toBe(false); // Denied by override
	});

	it("should prioritize user overrides over role overrides", () => {
		const roles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Role1",
				color: "#000",
				position: 1,
				readMessages: true,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const overrides: ChannelPermissionOverride[] = [
			{
				$id: "override1",
				channelId: "channel1",
				roleId: "1",
				userId: undefined,
				allow: [],
				deny: ["readMessages"], // Role override denies
			},
			{
				$id: "override2",
				channelId: "channel1",
				roleId: undefined,
				userId: "user1",
				allow: ["readMessages"], // User override allows
				deny: [],
			},
		];

		const permissions = getEffectivePermissions(roles, overrides);
		expect(permissions.readMessages).toBe(true); // User override takes precedence
	});

	it("should correctly identify if user can manage role", () => {
		const userRoles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Manager",
				color: "#f00",
				position: 10,
				readMessages: false,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: true,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const targetRole: Role = {
			$id: "2",
			serverId: "s1",
			name: "Member",
			color: "#0f0",
			position: 5,
			readMessages: false,
			sendMessages: false,
			manageMessages: false,
			manageChannels: false,
			manageRoles: false,
			manageServer: false,
			mentionEveryone: false,
			administrator: false,
			mentionable: false,
		};

		// User can manage lower positioned roles
		expect(canManageRole(userRoles, targetRole, false)).toBe(true);

		const higherTargetRole: Role = {
			$id: "3",
			serverId: "s1",
			name: "Admin",
			color: "#00f",
			position: 15,
			readMessages: false,
			sendMessages: false,
			manageMessages: false,
			manageChannels: false,
			manageRoles: false,
			manageServer: false,
			mentionEveryone: false,
			administrator: false,
			mentionable: false,
		};

		// User cannot manage higher positioned roles
		expect(canManageRole(userRoles, higherTargetRole, false)).toBe(false);
	});

	it("should allow owner to manage all roles", () => {
		const userRoles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Member",
				color: "#000",
				position: 1,
				readMessages: false,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const targetRole: Role = {
			$id: "2",
			serverId: "s1",
			name: "Admin",
			color: "#f00",
			position: 100,
			readMessages: false,
			sendMessages: false,
			manageMessages: false,
			manageChannels: false,
			manageRoles: false,
			manageServer: false,
			mentionEveryone: false,
			administrator: true,
			mentionable: false,
		};

		// Owner can manage all roles
		expect(canManageRole(userRoles, targetRole, true)).toBe(true);
	});
});

describe("Permission Edge Cases", () => {
	it("should handle empty roles array in getEffectivePermissions", () => {
		const permissions = getEffectivePermissions([], []);
		expect(permissions.readMessages).toBe(false);
		expect(permissions.sendMessages).toBe(false);
		expect(permissions.administrator).toBe(false);
	});

	it("should handle empty overrides array", () => {
		const roles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Role1",
				color: "#000",
				position: 1,
				readMessages: true,
				sendMessages: true,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const permissions = getEffectivePermissions(roles, []);
		expect(permissions.readMessages).toBe(true);
		expect(permissions.sendMessages).toBe(true);
	});

	it("should return all permissions for server owner", () => {
		const permissions = getEffectivePermissions([], [], true);
		expect(permissions.readMessages).toBe(true);
		expect(permissions.sendMessages).toBe(true);
		expect(permissions.manageMessages).toBe(true);
		expect(permissions.manageChannels).toBe(true);
		expect(permissions.manageRoles).toBe(true);
		expect(permissions.manageServer).toBe(true);
		expect(permissions.mentionEveryone).toBe(true);
		expect(permissions.administrator).toBe(true);
	});

	it("should handle role overrides with empty allow array", () => {
		const roles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Role1",
				color: "#000",
				position: 1,
				readMessages: true,
				sendMessages: true,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const overrides: ChannelPermissionOverride[] = [
			{
				$id: "override1",
				channelId: "channel1",
				roleId: "1",
				userId: undefined,
				allow: [],
				deny: ["sendMessages"],
			},
		];

		const permissions = getEffectivePermissions(roles, overrides);
		expect(permissions.readMessages).toBe(true);
		expect(permissions.sendMessages).toBe(false);
	});

	it("should handle role overrides with empty deny array", () => {
		const roles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Role1",
				color: "#000",
				position: 1,
				readMessages: false,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const overrides: ChannelPermissionOverride[] = [
			{
				$id: "override1",
				channelId: "channel1",
				roleId: "1",
				userId: undefined,
				allow: ["readMessages", "sendMessages"],
				deny: [],
			},
		];

		const permissions = getEffectivePermissions(roles, overrides);
		expect(permissions.readMessages).toBe(true);
		expect(permissions.sendMessages).toBe(true);
	});

	it("should handle user override with empty userId string", () => {
		const roles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Role1",
				color: "#000",
				position: 1,
				readMessages: true,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const overrides: ChannelPermissionOverride[] = [
			{
				$id: "override1",
				channelId: "channel1",
				roleId: undefined,
				userId: "", // Empty userId should be treated as no override
				allow: ["sendMessages"],
				deny: [],
			},
		];

		const permissions = getEffectivePermissions(roles, overrides);
		expect(permissions.sendMessages).toBe(false); // Should not apply empty userId override
	});

	it("should handle role override with empty roleId string", () => {
		const roles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Role1",
				color: "#000",
				position: 1,
				readMessages: true,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const overrides: ChannelPermissionOverride[] = [
			{
				$id: "override1",
				channelId: "channel1",
				roleId: "", // Empty roleId should be treated as no override
				userId: undefined,
				allow: ["sendMessages"],
				deny: [],
			},
		];

		const permissions = getEffectivePermissions(roles, overrides);
		expect(permissions.sendMessages).toBe(false); // Should not apply empty roleId override
	});

	it("should return undefined for getHighestRole with empty array", () => {
		const result = getHighestRole([]);
		expect(result).toBeUndefined();
	});

	it("should return highest role from single role array", () => {
		const roles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Role1",
				color: "#000",
				position: 5,
				readMessages: false,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const result = getHighestRole(roles);
		expect(result).toBeDefined();
		expect(result?.name).toBe("Role1");
	});

	it("should return false for canManageRole when user has no roles", () => {
		const targetRole: Role = {
			$id: "1",
			serverId: "s1",
			name: "Role1",
			color: "#000",
			position: 5,
			readMessages: false,
			sendMessages: false,
			manageMessages: false,
			manageChannels: false,
			manageRoles: false,
			manageServer: false,
			mentionEveryone: false,
			administrator: false,
			mentionable: false,
		};

		expect(canManageRole([], targetRole, false)).toBe(false);
	});

	it("should return false for canManageRole when user lacks manageRoles permission", () => {
		const userRoles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Role1",
				color: "#000",
				position: 10,
				readMessages: false,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false, // No manageRoles permission
				manageServer: false,
				mentionEveryone: false,
				administrator: false,
				mentionable: false,
			},
		];

		const targetRole: Role = {
			$id: "2",
			serverId: "s1",
			name: "Role2",
			color: "#111",
			position: 5,
			readMessages: false,
			sendMessages: false,
			manageMessages: false,
			manageChannels: false,
			manageRoles: false,
			manageServer: false,
			mentionEveryone: false,
			administrator: false,
			mentionable: false,
		};

		expect(canManageRole(userRoles, targetRole, false)).toBe(false);
	});

	it("should allow admin to manage non-admin roles", () => {
		const userRoles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Admin",
				color: "#f00",
				position: 10,
				readMessages: false,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: true,
				mentionable: false,
			},
		];

		const targetRole: Role = {
			$id: "2",
			serverId: "s1",
			name: "Member",
			color: "#000",
			position: 5,
			readMessages: false,
			sendMessages: false,
			manageMessages: false,
			manageChannels: false,
			manageRoles: false,
			manageServer: false,
			mentionEveryone: false,
			administrator: false,
			mentionable: false,
		};

		expect(canManageRole(userRoles, targetRole, false)).toBe(true);
	});

	it("should prevent admin from managing other admin roles", () => {
		const userRoles: Role[] = [
			{
				$id: "1",
				serverId: "s1",
				name: "Admin",
				color: "#f00",
				position: 10,
				readMessages: false,
				sendMessages: false,
				manageMessages: false,
				manageChannels: false,
				manageRoles: false,
				manageServer: false,
				mentionEveryone: false,
				administrator: true,
				mentionable: false,
			},
		];

		const targetRole: Role = {
			$id: "2",
			serverId: "s1",
			name: "OtherAdmin",
			color: "#ff0",
			position: 15,
			readMessages: false,
			sendMessages: false,
			manageMessages: false,
			manageChannels: false,
			manageRoles: false,
			manageServer: false,
			mentionEveryone: false,
			administrator: true,
			mentionable: false,
		};

		expect(canManageRole(userRoles, targetRole, false)).toBe(false);
	});
});
