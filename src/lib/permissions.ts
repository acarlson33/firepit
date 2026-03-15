/**
 * Permission calculation and checking utilities for role-based access control.
 *
 * Permission hierarchy:
 * 1. Administrator role bypasses all checks
 * 2. Channel-specific user overrides (highest priority for non-admin)
 * 3. Channel-specific role overrides
 * 4. Base role permissions (by position/hierarchy)
 * 5. Default deny
 */

import type {
    Permission,
    Role,
    ChannelPermissionOverride,
    EffectivePermissions,
} from "./types";

/**
 * Calculate effective permissions for a user in a channel context.
 * Takes into account role hierarchy and channel-specific overrides.
 *
 * @param {Role[]} roles - The roles value.
 * @param {ChannelPermissionOverride[]} overrides - The overrides value, if provided.
 * @param {boolean} isOwner - The is owner value, if provided.
 * @returns {{ readMessages: boolean; sendMessages: boolean; manageMessages: boolean; manageChannels: boolean; manageRoles: boolean; manageServer: boolean; mentionEveryone: boolean; administrator: boolean; }} The return value.
 */
export function getEffectivePermissions(
    roles: Role[],
    overrides: ChannelPermissionOverride[] = [],
    isOwner = false,
): EffectivePermissions {
    // Server owner has all permissions
    if (isOwner) {
        return {
            readMessages: true,
            sendMessages: true,
            manageMessages: true,
            manageChannels: true,
            manageRoles: true,
            manageServer: true,
            mentionEveryone: true,
            administrator: true,
        };
    }

    // Check if user has administrator role
    const hasAdminRole = roles.some((role) => role.administrator);
    if (hasAdminRole) {
        return {
            readMessages: true,
            sendMessages: true,
            manageMessages: true,
            manageChannels: true,
            manageRoles: true,
            manageServer: true,
            mentionEveryone: true,
            administrator: true,
        };
    }

    // Start with base permissions from roles (highest position wins)
    const sortedRoles = [...roles].sort((a, b) => b.position - a.position);
    const basePermissions: EffectivePermissions = {
        readMessages: false,
        sendMessages: false,
        manageMessages: false,
        manageChannels: false,
        manageRoles: false,
        manageServer: false,
        mentionEveryone: false,
        administrator: false,
    };

    // Merge permissions from all roles (OR operation - any role grants permission)
    for (const role of sortedRoles) {
        const permissions: Array<keyof EffectivePermissions> = [
            "readMessages",
            "sendMessages",
            "manageMessages",
            "manageChannels",
            "manageRoles",
            "manageServer",
            "mentionEveryone",
            "administrator",
        ];
        for (const perm of permissions) {
            if (role[perm]) {
                basePermissions[perm] = true;
            }
        }
    }

    // Apply channel-specific overrides
    // User overrides take precedence over role overrides
    const userOverride = overrides.find((o) => o.userId && o.userId !== "");
    const rolePositionById = new Map(
        roles.map((role) => [role.$id, role.position]),
    );
    const roleOverrides = overrides
        .filter((o) => o.roleId && o.roleId !== "")
        .sort((left, right) => {
            const leftRoleId = left.roleId || "";
            const rightRoleId = right.roleId || "";
            const positionOrder =
                (rolePositionById.get(rightRoleId) ??
                    Number.NEGATIVE_INFINITY) -
                (rolePositionById.get(leftRoleId) ?? Number.NEGATIVE_INFINITY);

            if (positionOrder !== 0) {
                return positionOrder;
            }

            return leftRoleId.localeCompare(rightRoleId);
        });

    // Apply role overrides first
    for (const override of roleOverrides) {
        for (const perm of override.allow) {
            basePermissions[perm] = true;
        }
        for (const perm of override.deny) {
            basePermissions[perm] = false;
        }
    }

    // Apply user override (highest priority)
    if (userOverride) {
        for (const perm of userOverride.allow) {
            basePermissions[perm] = true;
        }
        for (const perm of userOverride.deny) {
            basePermissions[perm] = false;
        }
    }

    return basePermissions;
}

/**
 * Check if a user has a specific permission in a context.
 *
 * @param {'readMessages' | 'sendMessages' | 'manageMessages' | 'manageChannels' | 'manageRoles' | 'manageServer' | 'mentionEveryone' | 'administrator'} permission - The permission value.
 * @param {{ readMessages: boolean; sendMessages: boolean; manageMessages: boolean; manageChannels: boolean; manageRoles: boolean; manageServer: boolean; mentionEveryone: boolean; administrator: boolean; }} effectivePermissions - The effective permissions value.
 * @returns {boolean} The return value.
 */
export function hasPermission(
    permission: Permission,
    effectivePermissions: EffectivePermissions,
): boolean {
    // Administrator bypasses all checks
    if (effectivePermissions.administrator) {
        return true;
    }

    return effectivePermissions[permission];
}

/**
 * Calculate role hierarchy based on position.
 * Higher position = higher in hierarchy.
 *
 * @param {Role[]} roles - The roles value.
 * @returns {Role[]} The return value.
 */
export function calculateRoleHierarchy(roles: Role[]): Role[] {
    return [...roles].sort((a, b) => b.position - a.position);
}

/**
 * Get the highest role for display purposes (role with highest position).
 *
 * @param {Role[]} roles - The roles value.
 * @returns {Role | undefined} The return value.
 */
export function getHighestRole(roles: Role[]): Role | undefined {
    if (roles.length === 0) {
        return undefined;
    }
    return calculateRoleHierarchy(roles)[0];
}

/**
 * Check if user can manage a specific role based on hierarchy.
 * Users can only manage roles lower than their highest role.
 *
 * @param {Role[]} userRoles - The user roles value.
 * @param {{ $id: string; serverId: string; name: string; color: string; position: number; defaultOnJoin?: boolean | undefined; readMessages: boolean; sendMessages: boolean; manageMessages: boolean; manageChannels: boolean; manageRoles: boolean; manageServer: boolean; mentionEveryone: boolean; administrator: boolean; mentionable: boolean; memberCount?: number | undefined; $createdAt?: string | undefined; }} targetRole - The target role value.
 * @param {boolean} isOwner - The is owner value, if provided.
 * @returns {boolean} The return value.
 */
export function canManageRole(
    userRoles: Role[],
    targetRole: Role,
    isOwner = false,
): boolean {
    // Owner can manage all roles
    if (isOwner) {
        return true;
    }

    // Admin role can manage all roles except other admin roles
    const hasAdminRole = userRoles.some((role) => role.administrator);
    if (hasAdminRole && !targetRole.administrator) {
        return true;
    }

    // Check if user has manageRoles permission
    const hasManageRoles = userRoles.some((role) => role.manageRoles);
    if (!hasManageRoles) {
        return false;
    }

    // User can only manage roles lower than their highest role
    const highestRole = getHighestRole(userRoles);
    if (!highestRole) {
        return false;
    }

    return highestRole.position > targetRole.position;
}

/**
 * Validate that a permission name is valid.
 *
 * @param {string} permission - The permission value.
 * @returns {boolean} The return value.
 */
export function isValidPermission(
    permission: string,
): permission is Permission {
    const validPermissions: Permission[] = [
        "readMessages",
        "sendMessages",
        "manageMessages",
        "manageChannels",
        "manageRoles",
        "manageServer",
        "mentionEveryone",
        "administrator",
    ];
    return validPermissions.includes(permission as Permission);
}

/**
 * Get all permissions as an array.
 * @returns {Permission[]} The return value.
 */
export function getAllPermissions(): Permission[] {
    return [
        "readMessages",
        "sendMessages",
        "manageMessages",
        "manageChannels",
        "manageRoles",
        "manageServer",
        "mentionEveryone",
        "administrator",
    ];
}

/**
 * Get human-readable description for a permission.
 *
 * @param {'readMessages' | 'sendMessages' | 'manageMessages' | 'manageChannels' | 'manageRoles' | 'manageServer' | 'mentionEveryone' | 'administrator'} permission - The permission value.
 * @returns {string} The return value.
 */
export function getPermissionDescription(permission: Permission): string {
    const descriptions: Record<Permission, string> = {
        readMessages: "View channels and read message history",
        sendMessages: "Send messages in channels",
        manageMessages: "Delete and edit messages from other users",
        manageChannels: "Create, edit, and delete channels",
        manageRoles: "Create and modify roles below their highest role",
        manageServer: "Change server name and other server settings",
        mentionEveryone: "Use @everyone and @here mentions",
        administrator: "All permissions and bypass channel overrides",
    };
    return descriptions[permission];
}
