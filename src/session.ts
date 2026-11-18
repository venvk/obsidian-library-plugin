// The sign-in window's session. Every service's first account signs in to the default partition; another account
// of a service has a partition of its own, switched in while that account is connected or read, so its cookies
// never meet the first account's.
export const DEFAULT_PARTITION = 'persist:library-auth'

let current = DEFAULT_PARTITION

export function authPartition(): string {
	return current
}

export function setAuthPartition(partition: string): void {
	current = partition
}

export function accountPartition(accountId: string): string {
	return `${DEFAULT_PARTITION}-${accountId}`
}
