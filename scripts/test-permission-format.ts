// Test what Permission.read(Role.any()) actually produces
import { Permission, Role } from "appwrite";

console.log("Testing client SDK permission format:");
console.log("Permission.read(Role.any()):", Permission.read(Role.any()));
console.log("Permission.update(Role.user('123')):", Permission.update(Role.user('123')));
console.log("Permission.delete(Role.user('123')):", Permission.delete(Role.user('123')));

const permissions = [
  Permission.read(Role.any()),
  Permission.update(Role.user('test-user-id')),
  Permission.delete(Role.user('test-user-id')),
];

console.log("\nFull permissions array:", JSON.stringify(permissions, null, 2));
